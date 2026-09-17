import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

const systems = ['mayoritario_uninominal', 'votacion_bloque', 'segunda_vuelta', 'proporcional_plurinominal', 'orden_preferencia', 'mixto'] as const;
type ElectoralSystem = typeof systems[number];
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data()?.createdAt?.toDate?.().toISOString?.() ?? null, closedAt: doc.data()?.closedAt?.toDate?.().toISOString?.() ?? null });
const serializeSubmission = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data(), submittedAt: doc.data()?.submittedAt?.toDate?.().toISOString?.() ?? null });
const text = (value: unknown, label: string, max = 160, required = false) => { const valueText = typeof value === 'string' ? value.trim() : ''; if (required && !valueText) throw new ValidationError(`${label} es obligatorio.`); return valueText.slice(0, max); };
const number = (value: unknown, label: string, required = false) => { if (value === undefined || value === null || value === '') { if (required) throw new ValidationError(`${label} es obligatorio.`); return null; } const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError(`${label} debe ser un número válido.`); return parsed; };

async function access(user: DecodedIdToken, orgId: string, campId: string, write = false) {
  assertCampaignAccess(user, orgId, campId);
  const organization = await db.collection('organizations').doc(orgId).get();
  if (organization.data()?.enabledAddons?.voteStream !== true) throw new ValidationError('Vote Stream no está habilitado en el plan de esta organización.');
  if (write && !['cliente', 'admin'].includes(String(user.role))) throw new ForbiddenError('Solo Cliente o administrador puede administrar Vote Stream.');
}

async function assignedAgentAccess(user: DecodedIdToken, orgId: string) {
  if (user.orgId !== orgId) throw new ForbiddenError('No tenés acceso a esta organización.');
  const [organization, membership] = await Promise.all([
    db.collection('organizations').doc(orgId).get(),
    db.collection('organizations').doc(orgId).collection('members').doc(user.uid).get()
  ]);
  if (!membership.exists) throw new ForbiddenError('No pertenecés a esta organización.');
  if (organization.data()?.enabledAddons?.voteStream !== true) throw new ValidationError('Vote Stream no está habilitado en el plan de esta organización.');
}

async function assignableAgents(user: DecodedIdToken, orgId: string, campId: string) {
  await access(user, orgId, campId, true);
  const [members, profiles] = await Promise.all([
    db.collection('organizations').doc(orgId).collection('members').get(),
    db.collection('users').where('orgIds', 'array-contains', orgId).get()
  ]);
  const profileByUid = new Map(profiles.docs.map((profile) => [profile.id, profile.data()]));
  const candidates = new Map<string, { uid: string; displayName?: string; email: string }>();
  members.docs.forEach((member) => {
    const profile = profileByUid.get(member.id) ?? {}; const data = member.data();
    candidates.set(member.id, { uid: member.id, displayName: String(profile.displayName ?? data.displayName ?? '') || undefined, email: String(profile.email ?? data.email ?? '') });
  });
  profiles.docs.forEach((profile) => {
    const data = profile.data();
    if (!candidates.has(profile.id)) candidates.set(profile.id, { uid: profile.id, displayName: String(data.displayName ?? '') || undefined, email: String(data.email ?? '') });
  });
  return [...candidates.values()].sort((left, right) => (left.displayName ?? left.email).localeCompare(right.displayName ?? right.email));
}

async function validAgentIds(user: DecodedIdToken, orgId: string, campId: string, input: unknown) {
  const ids = Array.isArray(input) ? [...new Set(input.filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0).map((uid) => uid.trim()))].slice(0, 100) : [];
  const allowed = new Set((await assignableAgents(user, orgId, campId)).map((agent) => agent.uid));
  if (ids.some((uid) => !allowed.has(uid))) throw new ValidationError('Cada agente debe pertenecer a la organización de esta campaña.');
  return ids;
}

async function agentStream(user: DecodedIdToken, orgId: string, campId: string, id: string) {
  await assignedAgentAccess(user, orgId);
  const ref = campaign(orgId, campId).collection('voteStreams').doc(id);
  const [stream, agent] = await Promise.all([ref.get(), ref.collection('agents').doc(user.uid).get()]);
  if (!stream.exists) throw new NotFoundError('La Vote Stream no existe.');
  if (!agent.exists) throw new ForbiddenError('No estás asignado como agente de sondeo en esta Vote Stream.');
  return { ref, stream };
}

async function voteStreamConfiguration(ref: FirebaseFirestore.DocumentReference, stream?: FirebaseFirestore.DocumentSnapshot) {
  const snapshot = stream ?? await ref.get();
  if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.');
  const [candidates, subLocations, genders, ageRanges] = await Promise.all([
    ref.collection('candidates').orderBy('order').get(), ref.collection('subLocations').get(), ref.collection('genderOptions').get(), ref.collection('ageRanges').get()
  ]);
  return { ...serialize(snapshot), candidates: candidates.docs.map(serialize), subLocations: subLocations.docs.map(serialize), genderOptions: genders.docs.map(serialize), ageRanges: ageRanges.docs.map(serialize) };
}

function optionalOptionId(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${label} no es válido.`);
  return value.trim();
}

function votes(value: unknown, candidateIds: Set<string>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Indicá votos por candidato.');
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) throw new ValidationError('Indicá al menos un candidato con votos.');
  if (entries.length > candidateIds.size) throw new ValidationError('La submission contiene candidatos no válidos.');
  return Object.fromEntries(entries.map(([candidateId, rawVotes]) => {
    if (!candidateIds.has(candidateId)) throw new ValidationError('La submission contiene un candidato que no pertenece a esta Vote Stream.');
    const count = Number(rawVotes);
    if (!Number.isInteger(count) || count < 0) throw new ValidationError('Los votos por candidato deben ser números enteros positivos o cero.');
    return [candidateId, count];
  }));
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
  const computedMargin = Math.round(Math.sqrt(0.25 / sampleSize) * z * Math.sqrt((populationSize - sampleSize) / (populationSize - 1)) * 10_000) / 100;
  return { enabled: true, populationSize, confidenceLevel, sampleSize, computedMargin };
}

export async function listVoteStreams(user: DecodedIdToken, orgId: string, campId: string) { await access(user, orgId, campId, true); const snapshot = await campaign(orgId, campId).collection('voteStreams').orderBy('createdAt', 'desc').get(); return snapshot.docs.map(serialize); }
export async function listAssignableAgents(user: DecodedIdToken, orgId: string, campId: string) { return assignableAgents(user, orgId, campId); }
export async function getVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); const [configuration, agents, submissions] = await Promise.all([voteStreamConfiguration(ref, snapshot), ref.collection('agents').get(), ref.collection('submissions').get()]); return { ...configuration, agents: agents.docs.map(serialize), submissions: submissions.docs.map(serializeSubmission) }; }

export async function listMyVoteStreams(user: DecodedIdToken, orgId: string, campId: string) {
  await assignedAgentAccess(user, orgId);
  const streams = await campaign(orgId, campId).collection('voteStreams').get();
  if (streams.empty) return [];
  const assignments = await db.getAll(...streams.docs.map((stream) => stream.ref.collection('agents').doc(user.uid)));
  const assignedStreams = streams.docs.filter((_, index) => assignments[index]?.exists);
  return (await Promise.all(assignedStreams.map((stream) => voteStreamConfiguration(stream.ref, stream)))).sort((left, right) => String((right as Record<string, unknown>).date ?? '').localeCompare(String((left as Record<string, unknown>).date ?? '')));
}

export async function createSubmission(user: DecodedIdToken, orgId: string, campId: string, id: string, input: Record<string, unknown>) {
  const { ref, stream } = await agentStream(user, orgId, campId, id);
  if (stream.data()?.status !== 'activa') throw new ValidationError('Esta Vote Stream no está activa, no se pueden enviar datos.');
  const [candidates, subLocations, genders, ageRanges] = await Promise.all([ref.collection('candidates').get(), ref.collection('subLocations').get(), ref.collection('genderOptions').get(), ref.collection('ageRanges').get()]);
  const subLocationId = optionalOptionId(input.subLocationId, 'La sub ubicación'); const genderId = optionalOptionId(input.genderId, 'El género'); const ageRangeId = optionalOptionId(input.ageRangeId, 'El rango de edad');
  if (subLocationId && !subLocations.docs.some((item) => item.id === subLocationId)) throw new ValidationError('La sub ubicación no pertenece a esta Vote Stream.');
  if (genderId && !genders.docs.some((item) => item.id === genderId)) throw new ValidationError('El género no pertenece a esta Vote Stream.');
  if (ageRangeId && !ageRanges.docs.some((item) => item.id === ageRangeId)) throw new ValidationError('El rango de edad no pertenece a esta Vote Stream.');
  const votesByCandidate = votes(input.votesByCandidate, new Set(candidates.docs.map((item) => item.id)));
  const submission = {
    submittedBy: user.uid,
    submittedAt: FieldValue.serverTimestamp(),
    votesByCandidate,
    ...(subLocationId ? { subLocationId } : {}), ...(genderId ? { genderId } : {}), ...(ageRangeId ? { ageRangeId } : {})
  };
  // Only this aggregate is exposed live to agents. Individual submissions stay
  // backend-only, so an agent never learns who sent another agent's results.
  const historicalSubmissions = await ref.collection('submissions').get();
  const historicalTotals = Object.fromEntries(candidates.docs.map((candidate) => [candidate.id, 0])) as Record<string, number>;
  historicalSubmissions.docs.forEach((existing) => Object.entries(existing.data().votesByCandidate ?? {}).forEach(([candidateId, count]) => { historicalTotals[candidateId] = (historicalTotals[candidateId] ?? 0) + (Number(count) || 0); }));
  const submissionRef = ref.collection('submissions').doc();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const existingLive = current.data()?.liveResults?.totals as Record<string, unknown> | undefined;
    const totals = Object.fromEntries(candidates.docs.map((candidate) => [candidate.id, Number(existingLive?.[candidate.id] ?? historicalTotals[candidate.id] ?? 0)])) as Record<string, number>;
    Object.entries(votesByCandidate).forEach(([candidateId, count]) => { totals[candidateId] = (totals[candidateId] ?? 0) + count; });
    transaction.set(submissionRef, submission);
    transaction.update(ref, { liveResults: { totals, totalVotes: Object.values(totals).reduce((sum, count) => sum + count, 0), updatedAt: FieldValue.serverTimestamp() } });
  });
  return serializeSubmission(await submissionRef.get());
}

export async function listMySubmissions(user: DecodedIdToken, orgId: string, campId: string, id: string) {
  const { ref } = await agentStream(user, orgId, campId, id);
  const submissions = await ref.collection('submissions').get();
  return submissions.docs.filter((submission) => submission.data().submittedBy === user.uid).sort((left, right) => (right.data().submittedAt?.toMillis?.() ?? 0) - (left.data().submittedAt?.toMillis?.() ?? 0)).map(serializeSubmission);
}

export async function createVoteStream(user: DecodedIdToken, orgId: string, campId: string, input: Record<string, unknown>) {
  await access(user, orgId, campId, true); const electoralSystem = String(input.electoralSystem) as ElectoralSystem; if (!systems.includes(electoralSystem)) throw new ValidationError('Elegí un sistema electoral válido.');
  const candidates = normalizeCandidates(input.candidates); const agentIds = await validAgentIds(user, orgId, campId, input.agentIds); const linked = candidates.find((candidate) => candidate.linkedToPrincipal); if (linked) Object.assign(linked, await principalCandidate(orgId, campId));
  const ref = campaign(orgId, campId).collection('voteStreams').doc(); const candidateEntries = candidates.map((candidate) => ({ ref: ref.collection('candidates').doc(), candidate })); const batch = db.batch(); const created = { name: text(input.name, 'El nombre', 160, true), electoralSystem, location: text(input.location, 'La localización', 200, true), date: text(input.date, 'La fecha', 20, true), status: 'pendiente', totalElectorsOrEstimatedVotes: number(input.totalElectorsOrEstimatedVotes, 'El total de votantes'), marginOfError: margin(input.marginOfError), createdBy: user.uid, createdAt: FieldValue.serverTimestamp(), closedAt: null, winnerCandidateId: null, liveResults: { totals: Object.fromEntries(candidateEntries.map(({ ref: candidateRef }) => [candidateRef.id, 0])), totalVotes: 0, updatedAt: FieldValue.serverTimestamp() } };
  batch.set(ref, created); candidateEntries.forEach(({ ref: candidateRef, candidate }) => batch.set(candidateRef, candidate)); normalizeOptions(input.subLocations, 'La sub ubicación').forEach((name) => batch.set(ref.collection('subLocations').doc(), { name })); normalizeOptions(input.genderOptions, 'El género').forEach((name) => batch.set(ref.collection('genderOptions').doc(), { name })); normalizeOptions(input.ageRanges, 'El rango de edad').forEach((name) => batch.set(ref.collection('ageRanges').doc(), { name })); agentIds.forEach((uid) => batch.set(ref.collection('agents').doc(uid), { assignedAt: FieldValue.serverTimestamp(), assignedBy: user.uid })); await batch.commit(); return getVoteStream(user, orgId, campId, ref.id);
}

export async function updateVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string, input: Record<string, unknown>) {
  await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); if (!(await ref.get()).exists) throw new NotFoundError('La Vote Stream no existe.'); const next: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid };
  if ('totalElectorsOrEstimatedVotes' in input) next.totalElectorsOrEstimatedVotes = number(input.totalElectorsOrEstimatedVotes, 'El total de votantes'); if ('marginOfError' in input) next.marginOfError = margin(input.marginOfError); if ('name' in input) next.name = text(input.name, 'El nombre', 160, true); if ('location' in input) next.location = text(input.location, 'La localización', 200, true); if ('date' in input) next.date = text(input.date, 'La fecha', 20, true); if ('electoralSystem' in input) { const electoralSystem = String(input.electoralSystem) as ElectoralSystem; if (!systems.includes(electoralSystem)) throw new ValidationError('Elegí un sistema electoral válido.'); next.electoralSystem = electoralSystem; }
  const collections = [{ key: 'subLocations', collection: 'subLocations', label: 'La sub ubicación' }, { key: 'genderOptions', collection: 'genderOptions', label: 'El género' }, { key: 'ageRanges', collection: 'ageRanges', label: 'El rango de edad' }] as const;
  for (const item of collections) if (item.key in input) { const existing = await ref.collection(item.collection).get(); const batch = db.batch(); existing.docs.forEach((document) => batch.delete(document.ref)); normalizeOptions(input[item.key], item.label).forEach((name) => batch.set(ref.collection(item.collection).doc(), { name })); await batch.commit(); }
  if ('agentIds' in input) { const agentIds = await validAgentIds(user, orgId, campId, input.agentIds); const existing = await ref.collection('agents').get(); const batch = db.batch(); existing.docs.forEach((document) => batch.delete(document.ref)); agentIds.forEach((uid) => batch.set(ref.collection('agents').doc(uid), { assignedAt: FieldValue.serverTimestamp(), assignedBy: user.uid })); await batch.commit(); }
  if ('candidates' in input) { const candidates = normalizeCandidates(input.candidates); const linked = candidates.find((candidate) => candidate.linkedToPrincipal); if (linked) Object.assign(linked, await principalCandidate(orgId, campId)); const existing = await ref.collection('candidates').get(); const batch = db.batch(); existing.docs.forEach((document) => batch.delete(document.ref)); candidates.forEach((candidate) => batch.set(ref.collection('candidates').doc(), candidate)); await batch.commit(); }
  await ref.update(next); return getVoteStream(user, orgId, campId, id);
}
export async function activateVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); if (snapshot.data()?.status !== 'pendiente') throw new ValidationError('Solo una Vote Stream pendiente puede activarse.'); await ref.update({ status: 'activa', activatedAt: FieldValue.serverTimestamp(), activatedBy: user.uid }); return getVoteStream(user, orgId, campId, id); }
export async function closeVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('La Vote Stream no existe.'); if (snapshot.data()?.status !== 'activa') throw new ValidationError('Solo una Vote Stream activa puede cerrarse.'); const [candidates, submissions] = await Promise.all([ref.collection('candidates').get(), ref.collection('submissions').get()]); const totals: Record<string, number> = {}; candidates.docs.forEach((candidate) => { totals[candidate.id] = 0; }); submissions.docs.forEach((submission) => Object.entries(submission.data().votesByCandidate ?? {}).forEach(([candidateId, votes]) => { totals[candidateId] = (totals[candidateId] ?? 0) + (Number(votes) || 0); })); const winnerCandidateId = Object.entries(totals).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null; await ref.update({ status: 'cerrada', closedAt: FieldValue.serverTimestamp(), winnerCandidateId, closedBy: user.uid }); return getVoteStream(user, orgId, campId, id); }
export async function deleteVoteStream(user: DecodedIdToken, orgId: string, campId: string, id: string) { await access(user, orgId, campId, true); const ref = campaign(orgId, campId).collection('voteStreams').doc(id); if (!(await ref.get()).exists) throw new NotFoundError('La Vote Stream no existe.'); const collections = ['candidates', 'subLocations', 'genderOptions', 'ageRanges', 'agents', 'submissions']; for (const collection of collections) { const snapshot = await ref.collection(collection).get(); const batch = db.batch(); snapshot.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); } await ref.delete(); return { id, deleted: true }; }
