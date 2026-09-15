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
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot): any => ({ id: doc.id, ...doc.data(), createdAt: asDate(doc.data().createdAt) });
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
  const byArea = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  existing.docs.filter((document) => document.data().archived !== true).forEach((document) => {
    const areaId = String(document.data().areaId ?? '');
    byArea.set(areaId, [...(byArea.get(areaId) ?? []), document]);
  });
  for (const area of areas) {
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
  return serialized.filter((channel) => channel.archived !== true && (channel.type === 'area' || !Array.isArray(channel.memberIds) || channel.memberIds.length === 0 || channel.memberIds.includes(user.uid))).sort((left, right) => (left.type === right.type ? String(left.name).localeCompare(String(right.name)) : left.type === 'area' ? -1 : 1));
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
  if (data.archived === true || (data.type !== 'area' && Array.isArray(data.memberIds) && data.memberIds.length > 0 && !data.memberIds.includes(user.uid))) throw new ForbiddenError('No tenés acceso a este canal.');
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
  if (existing) return serialize(existing);
  const ref = root.collection('spChannels').doc();
  await ref.set({ name: 'Direct', type: 'direct', tags: [], memberIds: [user.uid, recipient], createdBy: user.uid, archived: false, createdAt: FieldValue.serverTimestamp() });
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

export async function sendMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, rawText: unknown, file?: Express.Multer.File, rawMentionIds?: unknown) {
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
  const message = ref.collection('messages').doc();
  const senderName = profile.data()?.displayName ?? user.email ?? 'Miembro';
  await message.set({ senderId: user.uid, senderName, senderPhotoURL: readableProfilePhoto(profile.data(), user.picture), text, attachments: attachment ? [attachment] : [], mentions: validMentionIds, createdAt: FieldValue.serverTimestamp() });
  const path = `/smartplanner/comunicaciones?channel=${encodeURIComponent(channelId)}&message=${encodeURIComponent(message.id)}`;
  const channelData = channel.data() ?? {};
  const directRecipients = channelData.type === 'direct' ? (channelData.memberIds as unknown[] ?? []).map(String).filter((uid) => uid !== user.uid) : [];
  await Promise.all([
    ...validMentionIds.map((uid) => createNotification(uid, { type: 'smartplanner_mention', title: `${senderName} te mencionó`, message: text || 'Te mencionó en una conversación.', metadata: { path, orgId, campId, channelId, messageId: message.id } })),
    ...directRecipients.map((uid) => createNotification(uid, { type: 'smartplanner_direct_message', title: `Mensaje directo de ${senderName}`, message: text || 'Te envió un adjunto.', metadata: { path, orgId, campId, channelId, messageId: message.id } }))
  ]);
  return { id: message.id, senderId: user.uid, senderName, text, attachments: attachment ? [attachment] : [], mentions: validMentionIds, createdAt: null };
}
