import { randomUUID } from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { storage } from '../config/firebase.js';
import { assertCampaignAccess, assertCampaignManager, campaignRef, NotFoundError, ValidationError } from './access.service.js';

type IncidentInput = { title?: string; description?: string; severity?: string; address?: string; lat?: string | number; lng?: string | number; status?: string };
type Filters = { status?: string; severity?: string };
const maxPhotoBytes = 8 * 1024 * 1024;
const severities = new Set(['baja', 'media', 'alta']); const statuses = new Set(['abierta', 'resuelta']);

function clean(input: IncidentInput, requireTitle = true) {
  const title = input.title?.trim() ?? ''; const severity = input.severity?.trim() || 'media'; const status = input.status?.trim() || 'abierta';
  const lat = input.lat === '' || input.lat === undefined ? null : Number(input.lat); const lng = input.lng === '' || input.lng === undefined ? null : Number(input.lng);
  if (requireTitle && !title) throw new ValidationError('El título de la incidencia es obligatorio.');
  if (!severities.has(severity)) throw new ValidationError('La severidad no es válida.');
  if (!statuses.has(status)) throw new ValidationError('El estado no es válido.');
  if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) throw new ValidationError('Las coordenadas no son válidas.');
  return { title, description: input.description?.trim() ?? '', severity, status, address: input.address?.trim() ?? '', lat, lng };
}

const publicUrl = (bucket: string, path: string, token: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
async function uploadPhoto(incidentId: string, photo?: Express.Multer.File) {
  if (!photo) return null;
  if (!photo.mimetype.startsWith('image/')) throw new ValidationError('La foto de la incidencia debe ser una imagen.');
  if (photo.size > maxPhotoBytes) throw new ValidationError('La imagen no puede superar los 8 MB.');
  const path = `incidents/${incidentId}.jpg`; const token = randomUUID(); const file = storage.bucket().file(path);
  await file.save(photo.buffer, { resumable: false, contentType: photo.mimetype, metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: token } } });
  return { storagePath: `gs://${storage.bucket().name}/${path}`, token, url: publicUrl(storage.bucket().name, path, token) };
}
function serialize(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data(); const ref = typeof data.photoUrl === 'string' ? /^gs:\/\/([^/]+)\/(.+)$/.exec(data.photoUrl) : null; const token = typeof data.photoDownloadToken === 'string' ? data.photoDownloadToken : '';
  return { id: doc.id, ...data, photoUrl: ref && token ? publicUrl(ref[1], ref[2], token) : null, createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null, resolvedAt: data.resolvedAt?.toDate?.().toISOString?.() ?? null } as Record<string, any>;
}
export async function listIncidents(user: DecodedIdToken, orgId: string, campId: string, filters: Filters = {}) {
  assertCampaignAccess(user, orgId, campId); const snap = await campaignRef(orgId, campId).collection('incidents').orderBy('createdAt', 'desc').get();
  return snap.docs.map(serialize).filter((incident) => (!filters.status || incident.status === filters.status) && (!filters.severity || incident.severity === filters.severity));
}
export async function createIncident(user: DecodedIdToken, orgId: string, campId: string, input: IncidentInput, photo?: Express.Multer.File) {
  assertCampaignManager(user, orgId, campId); const data = clean(input); const ref = campaignRef(orgId, campId).collection('incidents').doc(); const uploaded = await uploadPhoto(ref.id, photo);
  try { await ref.set({ ...data, reportedBy: user.uid, photoUrl: uploaded?.storagePath ?? null, photoDownloadToken: uploaded?.token ?? null, createdAt: FieldValue.serverTimestamp(), resolvedAt: data.status === 'resuelta' ? FieldValue.serverTimestamp() : null }); }
  catch (error) { if (uploaded) await storage.bucket().file(`incidents/${ref.id}.jpg`).delete().catch(() => undefined); throw error; }
  return { id: ref.id, ...data, photoUrl: uploaded?.url ?? null };
}
export async function updateIncident(user: DecodedIdToken, orgId: string, campId: string, incidentId: string, input: IncidentInput) {
  assertCampaignManager(user, orgId, campId); const ref = campaignRef(orgId, campId).collection('incidents').doc(incidentId); const current = await ref.get(); if (!current.exists) throw new NotFoundError('La incidencia no existe.');
  const data = clean({ ...current.data(), ...input }); const wasResolved = current.data()?.status === 'resuelta';
  await ref.update({ ...data, resolvedAt: data.status === 'resuelta' ? (wasResolved ? current.data()?.resolvedAt : FieldValue.serverTimestamp()) : null, updatedAt: FieldValue.serverTimestamp() });
  return { id: incidentId, ...data };
}
