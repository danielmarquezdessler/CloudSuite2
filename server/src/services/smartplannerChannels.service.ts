import { randomUUID } from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db, storage } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { listAreas } from './smartplanner.service.js';

type Attachment = { type: 'image' | 'file'; url: string; name: string; size: number };
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const asDate = (value: unknown) => (value as { toDate?: () => Date })?.toDate?.().toISOString?.() ?? null;
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot): any => ({ id: doc.id, ...doc.data(), createdAt: asDate(doc.data().createdAt) });
const url = (bucket: string, path: string, token: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

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
  const byArea = new Map(existing.docs.map((document) => [String(document.data().areaId ?? ''), document]));
  for (const area of areas) {
    let channel = byArea.get(area.id);
    if (!channel) {
      const ref = root.collection('spChannels').doc();
      await ref.set({ name: String(area.name), type: 'area', areaId: area.id, tags: [], memberIds: [], createdBy: 'migration', createdAt: FieldValue.serverTimestamp() });
      channel = await ref.get() as FirebaseFirestore.QueryDocumentSnapshot;
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
  return serialized.sort((left, right) => (left.type === right.type ? String(left.name).localeCompare(String(right.name)) : left.type === 'area' ? -1 : 1));
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
  return ref;
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

export async function sendMessage(user: DecodedIdToken, orgId: string, campId: string, channelId: string, rawText: unknown, file?: Express.Multer.File) {
  const ref = await channelFor(user, orgId, campId, channelId);
  const text = String(rawText ?? '').trim();
  const attachment = await attachmentFor(orgId, campId, channelId, file);
  if (!text && !attachment) throw new ValidationError('Escribí un mensaje o seleccioná un archivo para adjuntar.');
  const profile = await db.collection('users').doc(user.uid).get();
  const message = ref.collection('messages').doc();
  await message.set({ senderId: user.uid, senderName: profile.data()?.displayName ?? user.email ?? 'Miembro', text, attachments: attachment ? [attachment] : [], createdAt: FieldValue.serverTimestamp() });
  return { id: message.id, senderId: user.uid, senderName: profile.data()?.displayName ?? user.email ?? 'Miembro', text, attachments: attachment ? [attachment] : [], createdAt: null };
}
