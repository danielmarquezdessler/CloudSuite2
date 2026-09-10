import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { storage } from '../config/firebase.js';
import { assertCampaignManager, campaignRef, NotFoundError, ValidationError } from './access.service.js';

export const CANDIDATE_TYPES = [
  'Presidente', 'Vicepresidente', 'Gobernador', 'Vicegobernador', 'Jefe de Gobierno', 'Vicejefe de Gobierno', 'Intendente', 'Viceintendente', 'Alcalde', 'Vicealcalde', 'Prefecto', 'Viceprefecto', 'Jefe Comunal', 'Presidente Comunal', 'Concejal', 'Regidor', 'Edil', 'Diputado Nacional', 'Diputado Provincial / Estatal / Departamental', 'Diputado Distrital', 'Senador Nacional', 'Senador Provincial / Estatal', 'Parlamentario', 'Representante', 'Asambleísta', 'Legislador', 'Constituyente', 'Consejero Regional', 'Consejero Departamental', 'Consejero Provincial', 'Consejero Municipal', 'Miembro de Junta', 'Miembro de Junta Departamental', 'Miembro de Junta Local', 'Vocal', 'Síndico', 'Corregidor', 'Gobernador Regional', 'Gobernador Departamental', 'Gobernador Provincial', 'Gobernador Municipal', 'Intendente Regional', 'Alcalde Metropolitano', 'Alcalde Municipal', 'Alcalde Distrital', 'Alcalde Provincial', 'Alcalde Local', 'Presidente Regional', 'Presidente Provincial', 'Presidente Municipal', 'Presidente de Junta', 'Representante Distrital', 'Representante Departamental', 'Representante Provincial', 'Representante Regional', 'Representante Municipal', 'Representante Comunal', 'Parlamentario Andino', 'Diputado del Parlamento Centroamericano', 'Diputado del Parlamento Regional', 'Miembro de Parlamento Supranacional', 'Candidato a Convencional', 'Candidato a Constituyente', 'Cargo Ejecutivo', 'Cargo Legislativo', 'Cargo Deliberativo', 'Cargo Regional', 'Cargo Provincial', 'Cargo Departamental', 'Cargo Municipal', 'Cargo Comunal', 'Cargo Distrital', 'Cargo Local', 'Otro'
] as const;

type CandidateInput = { name?: string; type?: string; customType?: string; party?: string; confirmClearPrincipal?: boolean | string };
type UploadedPhoto = { storagePath: string; downloadToken: string };
export class PrincipalResetRequiredError extends Error {
  constructor(public readonly voterCount: number, public readonly visitCount: number) { super(`Cambiar el candidato Principal reiniciará ${voterCount} electores y dejará fuera de las métricas actuales ${visitCount} visitas históricas.`); }
}

function downloadUrl(bucket: string, path: string, token: string) { return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`; }
function isAffirmative(value: unknown) { return value === true || value === 'true'; }

function normalize(input: CandidateInput) {
  const name = input.name?.trim(); const type = input.type?.trim(); const customType = input.customType?.trim() || null; const party = input.party?.trim() || null;
  if (!name) throw new ValidationError('El nombre del candidato es obligatorio.');
  if (name.length > 160) throw new ValidationError('El nombre del candidato no puede superar los 160 caracteres.');
  if (!type || !CANDIDATE_TYPES.includes(type as typeof CANDIDATE_TYPES[number])) throw new ValidationError('Elegí un tipo de cargo válido.');
  if (type === 'Otro' && !customType) throw new ValidationError('Indicá el tipo de cargo personalizado.');
  if (customType && customType.length > 120) throw new ValidationError('El tipo personalizado no puede superar los 120 caracteres.');
  if (party && party.length > 120) throw new ValidationError('El partido no puede superar los 120 caracteres.');
  return { name, type, ...(type === 'Otro' ? { customType } : {}), party };
}

async function uploadPhoto(candidateId: string, photo?: Express.Multer.File): Promise<UploadedPhoto | null> {
  if (!photo) return null;
  if (!photo.mimetype.startsWith('image/')) throw new ValidationError('La foto del candidato debe ser una imagen.');
  if (photo.size > 8 * 1024 * 1024) throw new ValidationError('La imagen no puede superar los 8 MB.');
  const path = `candidates/${candidateId}.jpg`; const file = storage.bucket().file(path); const downloadToken = randomUUID();
  await file.save(photo.buffer, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: downloadToken } } });
  return { storagePath: `gs://${storage.bucket().name}/${path}`, downloadToken };
}

async function readablePhoto(path: unknown, token: unknown) {
  if (typeof path !== 'string' || !path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const parsed = /^gs:\/\/([^/]+)\/(.+)$/.exec(path); if (!parsed) return null;
  const [, bucketName, objectPath] = parsed; const file = storage.bucket(bucketName).file(objectPath); let downloadToken = typeof token === 'string' ? token : '';
  if (!downloadToken) {
    const [metadata] = await file.getMetadata(); downloadToken = String(metadata.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0];
    if (!downloadToken) { downloadToken = randomUUID(); await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } }); }
  }
  return downloadUrl(bucketName, objectPath, downloadToken);
}

async function serialize(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, name: String(data.name ?? ''), type: String(data.type ?? ''), customType: data.customType ?? null, party: data.party ?? null, isPrincipal: Boolean(data.isPrincipal), photoUrl: await readablePhoto(data.photoUrl, data.photoDownloadToken), createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null };
}

export async function listCandidates(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignManager(user, orgId, campId);
  const snapshot = await campaignRef(orgId, campId).collection('candidates').orderBy('createdAt', 'asc').get();
  return Promise.all(snapshot.docs.map((candidate) => serialize(candidate.id, candidate.data())));
}

export async function createCandidate(user: DecodedIdToken, orgId: string, campId: string, input: CandidateInput, photo?: Express.Multer.File) {
  assertCampaignManager(user, orgId, campId); const data = normalize(input); const ref = campaignRef(orgId, campId).collection('candidates').doc(); const uploaded = await uploadPhoto(ref.id, photo);
  try { await ref.set({ ...data, photoUrl: uploaded?.storagePath ?? null, photoDownloadToken: uploaded?.downloadToken ?? null, isPrincipal: false, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid }); }
  catch (error) { if (uploaded) await storage.bucket().file(`candidates/${ref.id}.jpg`).delete().catch(() => undefined); throw error; }
  return serialize(ref.id, { ...data, photoUrl: uploaded?.storagePath ?? null, photoDownloadToken: uploaded?.downloadToken ?? null, isPrincipal: false, createdAt: null });
}

export async function updateCandidate(user: DecodedIdToken, orgId: string, campId: string, candidateId: string, input: CandidateInput, photo?: Express.Multer.File) {
  assertCampaignManager(user, orgId, campId); const ref = campaignRef(orgId, campId).collection('candidates').doc(candidateId); const existing = await ref.get(); if (!existing.exists) throw new NotFoundError('El candidato no existe.');
  const data = normalize(input); const uploaded = await uploadPhoto(candidateId, photo);
  const next = { ...data, ...(data.type !== 'Otro' ? { customType: FieldValue.delete() } : {}), ...(uploaded ? { photoUrl: uploaded.storagePath, photoDownloadToken: uploaded.downloadToken } : {}), updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid };
  await ref.update(next); return serialize(candidateId, { ...existing.data(), ...data, customType: data.type === 'Otro' ? data.customType : null, ...(uploaded ? { photoUrl: uploaded.storagePath, photoDownloadToken: uploaded.downloadToken } : {}) });
}

export async function deleteCandidate(user: DecodedIdToken, orgId: string, campId: string, candidateId: string, input: CandidateInput) {
  assertCampaignManager(user, orgId, campId); const ref = campaignRef(orgId, campId).collection('candidates').doc(candidateId); const candidate = await ref.get(); if (!candidate.exists) throw new NotFoundError('El candidato no existe.');
  if (candidate.data()?.isPrincipal && !isAffirmative(input.confirmClearPrincipal)) throw new ValidationError('Este es el candidato Principal. Confirmá que querés dejar la campaña sin Principal antes de eliminarlo.');
  const photo = candidate.data()?.photoUrl; await ref.delete(); if (typeof photo === 'string' && photo.startsWith('gs://')) { const path = photo.replace(/^gs:\/\/[^/]+\//, ''); await storage.bucket().file(path).delete().catch(() => undefined); }
  return { id: candidateId, deleted: true };
}

async function resetVoters(orgId: string, campId: string) {
  const voters = await campaignRef(orgId, campId).collection('voters').get();
  const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
  for (let index = 0; index < voters.docs.length; index += 400) chunks.push(voters.docs.slice(index, index + 400));
  for (const chunk of chunks) { const batch = campaignRef(orgId, campId).firestore.batch(); for (const voter of chunk) batch.update(voter.ref, { state: 'unvisited', visitedAt: null, lastVisitUid: null, feedback: null, conversions: { yes: 0, no: 0, undecided: 0, last_decision: null }, principalResetAt: FieldValue.serverTimestamp() }); await batch.commit(); }
  return voters.size;
}

export async function setPrincipal(user: DecodedIdToken, orgId: string, campId: string, candidateId: string, confirmReset: boolean) {
  assertCampaignManager(user, orgId, campId); const campaign = campaignRef(orgId, campId); const next = campaign.collection('candidates').doc(candidateId); const nextSnapshot = await next.get(); if (!nextSnapshot.exists) throw new NotFoundError('El candidato no existe.');
  const principals = await campaign.collection('candidates').where('isPrincipal', '==', true).get(); const previous = principals.docs.find((candidate) => candidate.id !== candidateId);
  if (previous) {
    const [voters, visits] = await Promise.all([campaign.collection('voters').get(), campaign.collection('visits').get()]);
    const affectedVoters = voters.docs.filter((voter) => voter.data().state !== 'unvisited' || Object.values(voter.data().conversions ?? {}).some((value) => typeof value === 'number' && value > 0)).length;
    if ((affectedVoters || visits.size) && !confirmReset) throw new PrincipalResetRequiredError(affectedVoters, visits.size);
    if (affectedVoters || visits.size) {
      await resetVoters(orgId, campId);
      await campaign.set({ metricsResetAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  const batch = campaign.firestore.batch(); principals.docs.filter((candidate) => candidate.id !== candidateId).forEach((candidate) => batch.update(candidate.ref, { isPrincipal: false, updatedAt: FieldValue.serverTimestamp() })); batch.set(next, { isPrincipal: true, principalSetAt: FieldValue.serverTimestamp(), principalSetBy: user.uid }, { merge: true }); await batch.commit();
  return { id: candidateId, isPrincipal: true };
}
