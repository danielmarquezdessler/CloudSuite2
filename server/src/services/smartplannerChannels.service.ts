import { randomUUID } from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db, storage } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { listAreas } from './smartplanner.service.js';
import { createNotification } from './notifications.service.js';

type Attachment = { type: 'image' | 'file'; url: string; name: string; size: number };
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const asDate = (value: unknown) => (value as { toDate?: () => Date })?.toDate?.().toISOString?.() ?? null;
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot): any => ({ id: doc.id, ...doc.data(), createdAt: asDate(doc.data().createdAt), updatedAt: asDate(doc.data().updatedAt), deletedAt: asDate(doc.data().deletedAt) });
const url = (bucket: string, path: string, token: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
function readableProfilePhoto(profile: Record<string, unknown> | undefined, fallback?: string) {
  const photoURL = profile?.photoURL;
  if (typeof photoURL === 'string' && /^https?:\/\//.test(photoURL)) return photoURL;
  const reference = typeof photoURL === 'string' ? /^gs:\/\/([^/]+)\/(.+)$/.exec(photoURL) : null;
  const token = typeof profile?.avatarDownloadToken === 'string' ? profile.avatarDownloadToken : '';
  if (reference && token) return url(reference[1], reference[2], token);
  return fallback ?? '';
}

async function allowed(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const organization = await db.collection('organizations').doc(orgId).get();
  if (organization.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.');
}

/** Idempotent compatibility migration. It copies (never deletes) the old area history. */
export async function ensureAreaChannels(user: DecodedIdToken, orgId: string, campId: string) {
  await allowed(user, orgId, campId);
  const areas = await listAreas(user, orgId, campId) as unknown as Array<{ id: string; name: string }>;
  const root = campaign(orgId, campId);
  const existing = await root.collection('spChannels').where('type', '==', 'area').get();
  const disabledAreas = new Set<string>();
  existing.docs.filter((document) => document.data().archived === true && document.data().disabled === true).forEach((document) => {
    disabledAreas.add(String(document.data().areaId ?? ''));
  });
  const byArea = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  existing.docs.filter((document) => document.data().archived !== true).forEach((document) => {
    const areaId = String(document.data().areaId ?? '');
    byArea.set(areaId, [...(byArea.get(areaId) ?? []), document]);
  });
  for (const area of areas) {
    // An organization admin can deliberately remove a built-in area channel.
    // Keep that decision durable instead of recreating it on every list request.
    if (disabledAreas.has(area.id)) continue;
    const candidates = byArea.get(area.id) ?? [];
    const candidateMessages = await Promise.all(candidates.map(async (candidate) => ({ candidate, messages: await candidate.ref.collection('messages').get() })));
    let channel = candidateMessages.sort((left, right) => right.messages.size - left.messages.size)[0]?.candidate;
    if (!channel) {
      const ref = root.collection('spChannels').doc();
      await ref.set({ name: String(area.name), type: 'area', areaId: area.id, tags: [], memberIds: [], createdBy: 'migration', archived: false, createdAt: FieldValue.serverTimestamp() });
      channel = await ref.get() as FirebaseFirestore.QueryDocumentSnapshot;
    }
    const duplicates = candidateMessages.filter(({ candidate }) => candidate.id !== channel!.id);
    for (const duplicate of duplicates) {
      const batch = db.batch();
      duplicate.messages.docs.forEach((message) => batch.set(channel!.ref.collection('messages').doc(message.id), { ...message.data(), attachments: Array.isArray(message.data().attachments) ? message.data().attachments : [] }, { merge: true }));
      batch.update(duplicate.candidate.ref, { archived: true, archivedAt: FieldValue.serverTimestamp() });
      await batch.commit();
    }
    const legacy = await root.collection('spAreas').doc(area.id).collection('messages').get();
    if (!legacy.empty) {
      const batch = db.batch();
      legacy.docs.forEach((message) => batch.set(channel!.ref.collection('messages').doc(message.id), { ...message.data(), attachments: Array.isArray(message.data().attachments) ? message.data().attachments : [] }, { merge: true }));
      await batch.commit();
    }
  }
}

export async function listChannels(user: DecodedIdToken, orgId: string, campId: string) {
  await ensureAreaChannels(user, orgId, campId);
  const root = campaign(orgId, campId);
  const channels = await root.collection('spChannels').get();
  const serialized = await Promise.all(channels.docs.map(async (channel) => {
    const latest = await channel.ref.collection('messages').orderBy('createdAt', 'desc').limit(1).get();
    return { ...serialize(channel), lastMessage: latest.empty ? null : serialize(latest.docs[0]) };
  }));
  return serialized.filter((channel) => channel.archived !== true && (!Array.isArray(channel.hiddenFor) || !channel.hiddenFor.includes(user.uid)) && (channel.type === 'area' || !Array.isArray(channel.memberIds) || channel.memberIds.length === 0 || channel.memberIds.includes(user.uid))).sort((left, right) => {
    const rightActivity = Date.parse(String(right.lastMessage?.createdAt ?? right.updatedAt ?? right.createdAt ?? '')) || 0;
    const leftActivity = Date.parse(String(left.lastMessage?.createdAt ?? left.updatedAt ?? left.createdAt ?? '')) || 0;
    return rightActivity - leftActivity || String(left.name).localeCompare(String(right.name));
  });
}

export async function createChannel(user: DecodedIdToken, orgId: string, campId: string, input: Record<string, unknown>) {
  await allowed(user, orgId, campId);
  const name = String(input.name ?? '').trim();
  if (!name || name.length > 80) throw new ValidationError('Indicá un nombre de canal de hasta 80 caracteres.');
  const tags = Array.from(new Set((Array.isArray(input.tags) ? input.tags : []).map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 10);
  const memberIds = Array.from(new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String).filter(Boolean))).slice(0, 100);
  const ref = campaign(orgId, campId).collection('spChannels').doc();
  await ref.set({ name, type: 'custom', tags, memberIds, createdBy: user.uid, createdAt: FieldValue.serverTimestamp() });
  return { id: ref.id, name, type: 'custom', tags, memberIds, createdBy: user.uid, createdAt: null };
}

async function channelFor(user: DecodedIdToken, orgId: string, campId: string, channelId: string) {
  await ensureAreaChannels(user, orgId, campId);
  const ref = campaign(orgId, campId).collection('spChannels').doc(channelId);
  const channel = await ref.get();
  if (!channel.exists) throw new NotFoundError('Canal no encontrado.');
  const data = channel.data() ?? {};
  if (data.archived === true || (data.type === 'direct' && Array.isArray(data.hiddenFor) && data.hiddenFor.includes(user.uid)) || (data.type !== 'area' && Array.isArray(data.memberIds) && data.memberIds.length > 0 && !data.memberIds.includes(user.uid))) throw new ForbiddenError('No tenés acceso a este canal.');
  return ref;
}

export async function directChannel(user: DecodedIdToken, orgId: string, campId: string, recipientId: unknown) {
  await allowed(user, orgId, campId);
  const recipient = String(recipientId ?? '').trim();
  if (!recipient || recipient === user.uid) throw new ValidationError('Elegí otra persona para iniciar un mensaje directo.');
  const root = campaign(orgId, campId);
  if (!(await root.collection('members').doc(recipient).get()).exists) throw new ValidationError('La persona elegida no pertenece a esta campaña.');
  const candidates = await root.collection('spChannels').where('memberIds', 'array-contains', user.uid).get();
  const existing = candidates.docs.find((channel) => channel.data().type === 'direct' && channel.data().archived !== true && Array.isArray(channel.data().memberIds) && channel.data().memberIds.length === 2 && channel.data().memberIds.includes(recipient));
  if (existing) {
    await existing.ref.update({ hiddenFor: FieldValue.arrayRemove(user.uid), updatedAt: FieldValue.serverTimestamp() });
    return serialize(await existing.ref.get() as FirebaseFirestore.QueryDocumentSnapshot);
  }
  const ref = root.collection('spChannels').doc();
  await ref.set({ name: 'Direct', type: 'direct', tags: [], memberIds: [user.uid, recipient], hiddenFor: [], createdBy: user.uid, archived: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { id: ref.id, name: 'Direct', type: 'direct', tags: [], memberIds: [user.uid, recipient], createdBy: user.uid, createdAt: null };
}

export async function listMessages(user: DecodedIdToken, orgId: string, campId: string, channelId: string) {
  const ref = await channelFor(user, orgId, campId, channelId);
  return (await ref.collection('messages').orderBy('createdAt', 'asc').limit(250).get()).docs.map(serialize);
}

async function attachmentFor(orgId: string, campId: string, channelId: string, file?: Express.Multer.File): Promise<Attachment | null> {
  if (!file) return null;
  if (file.size > 10 * 1024 * 1024) throw new ValidationError('El archivo no puede superar los 10 MB.');
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'adjunto';
  const path = `smartplanner/channels/${orgId}/${campId}/${channelId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const token = randomUUID();
  await storage.bucket().file(path).save(file.buffer, { resumable: false, contentType: file.mimetype || 'application/octet-stream', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  return { type: file.mimetype.startsWith('image/') ? 'image' : 'file', url: url(storage.bucket().name, path, token), name: file.originalname, size: file.size };
}

function organizationAdmin(user: DecodedIdToken) { return user.role === 'cliente' || user.role === 'admin'; }
function channelManager(user: DecodedIdToken, data: Record<string, unknown>) {
  if (data.type === 'area') return organizationAdmin(user);
  return data.createdBy === user.uid;
}

export async function updateChannel(user: DecodedIdToken, orgId: string, campId: string, channelId: string, input: Record<string, unknown>) {
  const ref = await channelFor(user, orgId, campId, channelId); const snapshot = await ref.get(); const data = snapshot.data() ?? {};
  if (data.type === 'direct') throw new ValidationError('Los mensajes directos no se renombran.');
  if (!channelManager(user, data)) throw new ForbiddenError('Solo quien creó el canal puede renombrarlo.');
  const name = String(input.name ?? '').trim(); if (!name || name.length > 80) throw new ValidationError('Indicá un nombre de canal de hasta 80 caracteres.');
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() }); return { ...serialize(await ref.get() as FirebaseFirestore.QueryDocumentSnapshot), name };
}

export async function deleteChannel(user: DecodedIdToken, orgId: string, campId: string, channelId: string) {
  const ref = await channelFor(user, orgId, campId, channelId); const snapshot = await ref.get(); const data = snapshot.data() ?? {};
  if (data.type === 'direct') { await ref.update({ hiddenFor: FieldValue.arrayUnion(user.uid), updatedAt: FieldValue.serverTimestamp() }); return { hidden: true }; }
  if (!channelManager(user, data)) throw new ForbiddenError(data.type === 'area' ? 'Solo un administrador de la organización puede eliminar canales predeterminados.' : 'Solo quien creó el canal puede eliminarlo.');
  await ref.update({ archived: true, ...(data.type === 'area' ? { disabled: true } : {}), archivedAt: FieldValue.serverTimestamp(), archivedBy: user.uid, updatedAt: FieldValue.serverTimestamp() }); return { archived: true };
}

export async function sendMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, rawText: unknown, file?: Express.Multer.File, rawMentionIds?: unknown, rawReplyTo?: unknown) {
  const ref = await channelFor(user, orgId, campId, channelId);
  const channel = await ref.get();
  const text = String(rawText ?? '').trim();
  const attachment = await attachmentFor(orgId, campId, channelId, file);
  if (!text && !attachment) throw new ValidationError('Escribí un mensaje o seleccioná un archivo para adjuntar.');
  const profile = await db.collection('users').doc(user.uid).get();
  const requestedMentions = Array.isArray(rawMentionIds) ? rawMentionIds : typeof rawMentionIds === 'string' ? (() => { try { return JSON.parse(rawMentionIds) as unknown; } catch { return []; } })() : [];
  const mentionIds = Array.from(new Set((Array.isArray(requestedMentions) ? requestedMentions : []).map(String).filter((uid) => uid && uid !== user.uid))).slice(0, 20);
  const campaignMembers = await Promise.all(mentionIds.map(async (uid) => ({ uid, exists: (await campaign(orgId, campId).collection('members').doc(uid).get()).exists })));
  const validMentionIds = campaignMembers.filter((member) => member.exists).map((member) => member.uid);
  const replyId = String(rawReplyTo ?? '').trim(); const replySnapshot = replyId ? await ref.collection('messages').doc(replyId).get() : null;
  if (replySnapshot && !replySnapshot.exists) throw new ValidationError('El mensaje citado ya no existe.');
  const reply = replySnapshot?.exists ? { messageId: replySnapshot.id, senderName: String(replySnapshot.data()?.senderName ?? 'Miembro'), text: String(replySnapshot.data()?.text ?? '').slice(0, 220) } : null;
  const message = ref.collection('messages').doc();
  const senderName = profile.data()?.displayName ?? user.email ?? 'Miembro';
  await message.set({ senderId: user.uid, senderName, senderPhotoURL: readableProfilePhoto(profile.data(), user.picture), text, attachments: attachment ? [attachment] : [], mentions: validMentionIds, replyTo: reply, reactions: {}, createdAt: FieldValue.serverTimestamp() });
  await ref.update({ updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() });
  const path = `/smartplanner/comunicaciones?channel=${encodeURIComponent(channelId)}&message=${encodeURIComponent(message.id)}`;
  const channelData = channel.data() ?? {};
  const directRecipients = channelData.type === 'direct' ? (channelData.memberIds as unknown[] ?? []).map(String).filter((uid) => uid !== user.uid) : [];
  await Promise.all([
    ...validMentionIds.map((uid) => createNotification(uid, { type: 'smartplanner_mention', title: `${senderName} te mencionó`, message: text || 'Te mencionó en una conversación.', metadata: { path, orgId, campId, channelId, messageId: message.id } })),
    ...directRecipients.map((uid) => createNotification(uid, { type: 'smartplanner_direct_message', title: `Mensaje directo de ${senderName}`, message: text || 'Te envió un adjunto.', metadata: { path, orgId, campId, channelId, messageId: message.id } }))
  ]);
  return { id: message.id, senderId: user.uid, senderName, text, attachments: attachment ? [attachment] : [], mentions: validMentionIds, createdAt: null };
}

async function ownMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, messageId: string) {
  const ref = await channelFor(user, orgId, campId, channelId); const message = await ref.collection('messages').doc(messageId).get();
  if (!message.exists) throw new NotFoundError('Mensaje no encontrado.'); if (message.data()?.senderId !== user.uid) throw new ForbiddenError('Solo podés modificar tus propios mensajes.');
  return { channel: ref, message };
}

export async function editMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, messageId: string, rawText: unknown) {
  const text = String(rawText ?? '').trim(); if (!text) throw new ValidationError('El mensaje no puede quedar vacío.'); const { channel, message } = await ownMessage(user, orgId, campId, channelId, messageId);
  await message.ref.update({ text, editedAt: FieldValue.serverTimestamp() }); await channel.update({ updatedAt: FieldValue.serverTimestamp() }); return serialize(await message.ref.get() as FirebaseFirestore.QueryDocumentSnapshot);
}

export async function deleteMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, messageId: string) {
  const { channel, message } = await ownMessage(user, orgId, campId, channelId, messageId); await message.ref.update({ text: '', attachments: [], deletedAt: FieldValue.serverTimestamp(), deletedBy: user.uid }); await channel.update({ updatedAt: FieldValue.serverTimestamp() }); return { deleted: true };
}

export async function reactToMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, messageId: string, rawEmoji: unknown) {
  const emoji = String(rawEmoji ?? '').trim(); if (!emoji || Array.from(emoji).length > 8) throw new ValidationError('Elegí una reacción válida.'); const ref = await channelFor(user, orgId, campId, channelId); const messageRef = ref.collection('messages').doc(messageId);
  await db.runTransaction(async (transaction) => { const message = await transaction.get(messageRef); if (!message.exists) throw new NotFoundError('Mensaje no encontrado.'); const reactions = { ...(message.data()?.reactions ?? {}) } as Record<string, string[]>; const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : []; reactions[emoji] = users.includes(user.uid) ? users.filter((uid) => uid !== user.uid) : [...users, user.uid]; if (!reactions[emoji].length) delete reactions[emoji]; transaction.update(messageRef, { reactions }); }); return serialize(await messageRef.get() as FirebaseFirestore.QueryDocumentSnapshot);
}

export async function forwardMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, messageId: string, rawDestinationId: unknown) {
  const source = await channelFor(user, orgId, campId, channelId); const destinationId = String(rawDestinationId ?? '').trim(); if (!destinationId) throw new ValidationError('Elegí un destino para reenviar.'); const destination = await channelFor(user, orgId, campId, destinationId); const message = await source.collection('messages').doc(messageId).get(); if (!message.exists || message.data()?.deletedAt) throw new NotFoundError('El mensaje ya no está disponible para reenviar.');
  const profile = await db.collection('users').doc(user.uid).get(); const senderName = profile.data()?.displayName ?? user.email ?? 'Miembro'; const forwarded = destination.collection('messages').doc(); const data = message.data() ?? {};
  await forwarded.set({ senderId: user.uid, senderName, senderPhotoURL: readableProfilePhoto(profile.data(), user.picture), text: String(data.text ?? ''), attachments: Array.isArray(data.attachments) ? data.attachments : [], mentions: [], reactions: {}, forwardedFrom: { channelId, messageId, senderName: String(data.senderName ?? 'Miembro') }, createdAt: FieldValue.serverTimestamp() }); await destination.update({ updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() }); return serialize(await forwarded.get() as FirebaseFirestore.QueryDocumentSnapshot);
}
