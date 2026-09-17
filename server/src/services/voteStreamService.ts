import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, NotFoundError, ValidationError } from './access.service.js';

const systems = ['mayoritario_uninominal', 'votacion_bloque', 'segunda_vuelta', 'proporcional_plurinominal', 'orden_preferencia', 'mixto'] as const;
type ElectoralSystem = typeof systems[number];
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data()?.createdAt?.toDate?.().toISOString?.() ?? null, closedAt: doc.data()?.closedAt?.toDate?.().toISOString?.() ?? null });
const text = (value: unknown, label: string, max = 160, required = false) => { const valueText = typeof value === 'string' ? value.trim() : ''; if (required && !valueText) throw new ValidationError(`${label} es obligatorio.`); return valueText.slice(0, max); };
const number = (value: unknown, label: string, required = false) => { if (value === undefined || value === null || value === '') { if (required) throw new ValidationError(`${label} es obligatorio.`); return null; } const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError(`${label} debe ser un número válido.`); return parsed; };

async function access(user: DecodedIdToken, orgId: string, campId: string, write = false) {
  assertCampaignAccess(user, orgId, campId);
  const organization = await db.collection('organizations').doc(orgId).get();
  if (organization.data()?.enabledAddons?.voteStream !== true) throw new ValidationError('Vote Stream no está habilitado en el plan de esta organización.');
  if (write && !['cliente', 'admin'].includes(String(user.role))) throw new ValidationError('Solo Cliente o administrador puede administrar Vote Stream.');
}

function normalizeOptions(items: unknown, label: string) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => text(item, label, 80, true)).filter(Boolean).slice(0, 30);
}

async function principalCandidate(orgId: string, campId: string) {
  const snapshot = await campaign(orgId, campId).collection('candidates').where('isPrincipal', '==', true).limit(1).get();
  if (snapshot.empty) throw new ValidationError('La campaña no tiene un Candidato Principal para vincular.');
  const data = snapshot.docs[0].data();
  const rawPhoto = typeof data.photoUrl === 'string' ? data.photoUrl : ''; const rawToken = typeof data.photoDownloadToken === 'string' ? data.photoDownloadToken : '';
  const storageMatch = /^gs:\/\/([^/]+)\/(.+)$/.exec(rawPhoto); const photoUrl = /^https?:/.test(rawPhoto) ? rawPhoto : storageMatch && rawToken ? `https://firebasestorage.googleapis.com/v0/b/${storageMatch[1]}/o/${encodeURIComponent(storageMatch[2])}?alt=media&token=${encodeURIComponent(rawToken)}` : null;
  return { name: String(data.name ?? ''), party: String(data.party ?? ''), photoUrl };
}

function normalizeCandidates(value: unknown) {
  if (!Array.isArray(value) || value.length < 1) throw new ValidationError('Agregá al menos un candidato.');
  if (value.length > 10) throw new ValidationError('Podés agregar hasta 10 candidatos.');
  const candidates = value.map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return { name: text(item.name, `El nombre del candidato ${index + 1}`, 160, !item.linkedToPrincipal), party: text(item.party, 'El partido', 120), photoUrl: typeof item.photoUrl === 'string' ? item.photoUrl : null, linkedToPrincipal: item.linkedToPrincipal === true, order: index + 1 };
  });
  if (candidates.filter((item) => item.linkedToPrincipal).length > 1) throw new ValidationError('Solo un candidato puede vincularse al Principal de la campaña.');
  return candidates;
}

function margin(value: unknown) {
  const item = (value ?? {}) as Record<string, unknown>;
  if (item.enabled !== true) return { enabled: false, populationSize: null, confidenceLevel: 95, sampleSize: null, computedMargin: null };
  const populationSize = number(item.populationSize, 'La población', true)!; const sampleSize = number(item.sampleSize, 'La muestra estimada', true)!;
  if (populationSize < 2 || sampleSize < 1 || sampleSize > populationSize) throw new ValidationError('La muestra debe ser mayor a cero y no superar la población.');
  const confidenceLevel = Number(item.confidenceLevel ?? 95); const z = ({ 80: 1.28, 85: 1.44, 90: 1.64, 95: 1.96, 99: 2.58 } as Record<number, number>)[confidenceLevel];
  if (!z) throw new ValidationError('El nivel de confianza no es válido.');
  const computedMargin = Math.round(Math.sqrt(0.25 / sampleSize) * z * Math.sqrt((populationSize - sampleSize) / (populationSize - 1)) * 100);
  return { enabled: true, populationSize, confidenceLevel, sampleSize, computedMargin };
}

export async function listVoteStreams(user: DecodedIdToken, orgId: string, campId: string) { await access(user, orgId, campId); const snapshot = await campaign(orgId, campId).collection('voteStreams').orderBy('createdAt', 'desc').get(); return snapshot.docs.map(serialize); }
export async function getVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); const [candidates, subLocations, genders, ageRanges, agents, submissions] = await Promise.all([ref.collection('candidates').orderBy('order').get(), ref.collection('subLocations').get(), ref.collection('genderOptions').get(), ref.collection('ageRanges').get(), ref.collection('agents').get(), ref.collection('submissions').get()]); return { ...serialize(snapshot), candidates: candidates.docs.map(serialize), subLocations: subLocations.docs.map(serialize), genderOptions: genders.docs.map(serialize), ageRanges: ageRanges.docs.map(serialize), agents: agents.docs.map(serialize), submissions: submissions.docs.map(serialize) }; }

export async function createVoteStream(user: DecodedIdToken, orgId: string, campId: string, input: Record<string, unknown>) {
  await access(user, orgId, campId, true); const electoralSystem = String(input.electoralSystem) as ElectoralSystem; if (!systems.includes(electoralSystem)) throw new ValidationError('Elegí un sistema electoral válido.');
  const candidates = normalizeCandidates(input.candidates); const linked = candidates.find((candidate) => candidate.linkedToPrincipal); if (linked) Object.assign(linked, await principalCandidate(orgId, campId));
  const ref = campaign(orgId, campId).collection('voteStreams').doc(); const batch = db.batch(); const created = { name: text(input.name, 'El nombre', 160, true), electoralSystem, location: text(input.location, 'La localización', 200, true), date: text(input.date, 'La fecha', 20, true), status: 'pendiente', totalElectorsOrEstimatedVotes: number(input.totalElectorsOrEstimatedVotes, 'El total de votantes'), marginOfError: margin(input.marginOfError), createdBy: user.uid, createdAt: FieldValue.serverTimestamp(), closedAt: null, winnerCandidateId: null };
  batch.set(ref, created); candidates.forEach((candidate) => batch.set(ref.collection('candidates').doc(), candidate)); normalizeOptions(input.subLocations, 'La sub ubicación').forEach((name) => batch.set(ref.collection('subLocations').doc(), { name })); normalizeOptions(input.genderOptions, 'El género').forEach((name) => batch.set(ref.collection('genderOptions').doc(), { name })); normalizeOptions(input.ageRanges, 'El rango de edad').forEach((name) => batch.set(ref.collection('ageRanges').doc(), { name })); Array.isArray(input.agentIds) && input.agentIds.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0).slice(0, 100).forEach((uid) => batch.set(ref.collection('agents').doc(uid), { assignedAt: FieldValue.serverTimestamp(), assignedBy: user.uid })); await batch.commit(); return getVoteStream(user, orgId, campId, ref.id);
}

export async function updateVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string, input: Record<string, unknown>) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); if (!(await ref.get()).exists) throw new NotFoundError('La Vote Stream no existe.'); const next: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }; if ('totalElectorsOrEstimatedVotes' in input) next.totalElectorsOrEstimatedVotes = number(input.totalElectorsOrEstimatedVotes, 'El total de votantes'); if ('marginOfError' in input) next.marginOfError = margin(input.marginOfError); if ('name' in input) next.name = text(input.name, 'El nombre', 160, true); await ref.update(next); return getVoteStream(user, orgId, campId, id); }
export async function activateVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); if (snapshot.data()?.status !== 'pendiente') throw new ValidationError('Solo una Vote Stream pendiente puede activarse.'); await ref.update({ status: 'activa', activatedAt: FieldValue.serverTimestamp(), activatedBy: user.uid }); return getVoteStream(user, orgId, campId, id); }
export async function closeVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); if (snapshot.data()?.status !== 'activa') throw new ValidationError('Solo una Vote Stream activa puede cerrarse.'); const [candidates, submissions] = await Promise.all([ref.collection('candidates').get(), ref.collection('submissions').get()]); const totals: Record<string, number> = {}; candidates.docs.forEach((candidate) => { totals[candidate.id] = 0; }); submissions.docs.forEach((submission) => Object.entries(submission.data().votesByCandidate ?? {}).forEach(([candidateId, votes]) => { totals[candidateId] = (totals[candidateId] ?? 0) + (Number(votes) || 0); })); const winnerCandidateId = Object.entries(totals).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null; await ref.update({ status: 'cerrada', closedAt: FieldValue.serverTimestamp(), winnerCandidateId, closedBy: user.uid }); return getVoteStream(user, orgId, campId, id); }
export async function deleteVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); if (!(await ref.get()).exists) throw new NotFoundError('La Vote Stream no existe.'); const collections = ['candidates', 'subLocations', 'genderOptions', 'ageRanges', 'agents', 'submissions']; for (const collection of collections) { const snapshot = await ref.collection(collection).get(); const batch = db.batch(); snapshot.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); } await ref.delete(); return { id, deleted: true }; }
