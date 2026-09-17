import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { ForbiddenError, NotFoundError, ValidationError, assertCampaignAccess } from './access.service.js';

const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const iso = (value: unknown) => (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString?.() ?? null;
const serialise = (doc: FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data(), submittedAt: iso(doc.data()?.submittedAt), editedAt: iso(doc.data()?.editedAt) });
const isManager = (user: DecodedIdToken) => ['cliente', 'admin'].includes(String(user.role));

async function addon(orgId: string) {
  const org = await db.collection('organizations').doc(orgId).get();
  if (org.data()?.enabledAddons?.voteStream !== true) throw new ValidationError('Vote Stream no está habilitado en el plan de esta organización.');
}
async function manager(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId); await addon(orgId);
  if (!isManager(user)) throw new ForbiddenError('Solo Cliente o administrador puede administrar Vote Stream.');
}
async function agentStream(user: DecodedIdToken, orgId: string, campId: string, streamId: string) {
  if (user.orgId !== orgId) throw new ForbiddenError('No tenés acceso a esta organización.');
  await addon(orgId);
  const ref = campaign(orgId, campId).collection('voteStreams').doc(streamId);
  const [stream, membership, assignment] = await Promise.all([ref.get(), db.collection('organizations').doc(orgId).collection('members').doc(user.uid).get(), ref.collection('agents').doc(user.uid).get()]);
  if (!membership.exists || !assignment.exists) throw new ForbiddenError('No estás asignado como agente de sondeo en esta Vote Stream.');
  if (!stream.exists) throw new NotFoundError('La Vote Stream no existe.');
  return { ref, stream };
}
async function configuration(ref: FirebaseFirestore.DocumentReference) {
  const [candidates, subLocations, genders, ages] = await Promise.all([ref.collection('candidates').orderBy('order').get(), ref.collection('subLocations').get(), ref.collection('genderOptions').get(), ref.collection('ageRanges').get()]);
  return { candidates: candidates.docs, subLocations: new Set(subLocations.docs.map((d) => d.id)), genders: new Set(genders.docs.map((d) => d.id)), ages: new Set(ages.docs.map((d) => d.id)) };
}
function option(value: unknown, allowed: Set<string>, label: string) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`${label} no pertenece a esta Vote Stream.`);
  return value;
}

/** One-time, idempotent reader migration from the legacy map document shape. */
export async function migrateLegacySubmissions(ref: FirebaseFirestore.DocumentReference) {
  const snapshot = await ref.collection('submissions').get();
  const legacy = snapshot.docs.filter((doc) => doc.data().votesByCandidate && !doc.data().migratedToCandidateEntries);
  for (const old of legacy) {
    const values = old.data().votesByCandidate as Record<string, unknown>;
    const batchId = String(old.data().batchId ?? old.id);
    const batch = db.batch();
    Object.entries(values).forEach(([candidateId, rawVotes]) => {
      const target = ref.collection('submissions').doc();
      batch.set(target, { submittedBy: old.data().submittedBy, submittedAt: old.data().submittedAt ?? FieldValue.serverTimestamp(), batchId, candidateId, votes: Number(rawVotes) || 0, ...(old.data().subLocationId ? { subLocationId: old.data().subLocationId } : {}), ...(old.data().genderId ? { genderId: old.data().genderId } : {}), ...(old.data().ageRangeId ? { ageRangeId: old.data().ageRangeId } : {}), migratedFrom: old.id });
    });
    batch.update(old.ref, { migratedToCandidateEntries: true });
    await batch.commit();
  }
}

export async function syncPublicRanking(orgId: string, campId: string, streamId: string) {
  const ref = campaign(orgId, campId).collection('voteStreams').doc(streamId);
  const [stream, config] = await Promise.all([ref.get(), configuration(ref)]);
  if (!stream.exists) return;
  const totals = (stream.data()?.liveResults?.totals ?? {}) as Record<string, number>;
  const candidates = config.candidates.map((candidate) => ({ id: candidate.id, name: String(candidate.data().name ?? ''), party: String(candidate.data().party ?? ''), photoUrl: candidate.data().photoUrl ?? null, partyLogoUrl: candidate.data().partyLogoUrl ?? null, votes: Number(totals[candidate.id] ?? 0), order: Number(candidate.data().order ?? 0) }));
  const publicRef = campaign(orgId, campId).collection('publicVoteRankings').doc(streamId);
  const current = await publicRef.get();
  await publicRef.set({ public: current.data()?.public === true, streamId, name: stream.data()?.name ?? '', location: stream.data()?.location ?? '', date: stream.data()?.date ?? '', status: stream.data()?.status ?? '', candidates, totalVotes: candidates.reduce((sum, c) => sum + c.votes, 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function nextCandidate(user: DecodedIdToken, orgId: string, campId: string, streamId: string, after?: string) {
  const { ref, stream } = await agentStream(user, orgId, campId, streamId);
  const { candidates } = await configuration(ref); const ordered = [...candidates].sort((a, b) => Number(b.data().linkedToPrincipal) - Number(a.data().linkedToPrincipal) || Number(a.data().order ?? 0) - Number(b.data().order ?? 0));
  const index = after ? ordered.findIndex((candidate) => candidate.id === after) + 1 : 0;
  const candidate = ordered[index];
  return { status: stream.data()?.status, candidate: candidate ? { id: candidate.id, ...candidate.data() } : null, remaining: Math.max(0, ordered.length - index - 1) };
}

export async function submitCandidate(user: DecodedIdToken, orgId: string, campId: string, streamId: string, input: Record<string, unknown>) {
  const { ref, stream } = await agentStream(user, orgId, campId, streamId);
  if (stream.data()?.status !== 'activa') throw new ValidationError('Esta Vote Stream no está activa, no se pueden enviar datos.');
  const { candidates, subLocations, genders, ages } = await configuration(ref);
  const candidateId = typeof input.candidateId === 'string' ? input.candidateId : '';
  if (!candidates.some((candidate) => candidate.id === candidateId)) throw new ValidationError('El candidato no pertenece a esta Vote Stream.');
  const votes = Number(input.votes); if (!Number.isInteger(votes) || votes < 0) throw new ValidationError('Indicá una cantidad entera de votos válida.');
  const subLocationId = option(input.subLocationId, subLocations, 'La sub ubicación'); const genderId = option(input.genderId, genders, 'El género'); const ageRangeId = option(input.ageRangeId, ages, 'El rango de edad');
  const batchId = typeof input.batchId === 'string' && input.batchId ? input.batchId.slice(0, 100) : db.collection('_ids').doc().id;
  const submission = { submittedBy: user.uid, submittedAt: FieldValue.serverTimestamp(), batchId, candidateId, votes, ...(subLocationId ? { subLocationId } : {}), ...(genderId ? { genderId } : {}), ...(ageRangeId ? { ageRangeId } : {}) };
  const result = ref.collection('submissions').doc();
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref); const existing = (current.data()?.liveResults?.totals ?? {}) as Record<string, number>;
    const totals: Record<string, number> = {}; candidates.forEach((candidate) => { totals[candidate.id] = Number(existing[candidate.id] ?? 0); }); totals[candidateId] += votes;
    transaction.set(result, submission); transaction.update(ref, { liveResults: { totals, totalVotes: Object.values(totals).reduce((sum, value) => sum + value, 0), updatedAt: FieldValue.serverTimestamp() } });
  });
  await syncPublicRanking(orgId, campId, streamId); return serialise(await result.get());
}

export async function mySubmissions(user: DecodedIdToken, orgId: string, campId: string, streamId: string) {
  const { ref } = await agentStream(user, orgId, campId, streamId); await migrateLegacySubmissions(ref); const all = await ref.collection('submissions').where('submittedBy', '==', user.uid).get(); return all.docs.sort((a,b) => (b.data().submittedAt?.toMillis?.() ?? 0) - (a.data().submittedAt?.toMillis?.() ?? 0)).map(serialise);
}
export async function agentsStatus(user: DecodedIdToken, orgId: string, campId: string, streamId: string) {
  await manager(user, orgId, campId); const ref = campaign(orgId, campId).collection('voteStreams').doc(streamId); const [agents, subs, profiles] = await Promise.all([ref.collection('agents').get(), ref.collection('submissions').get(), db.collection('users').where('orgIds', 'array-contains', orgId).get()]);
  const names = new Map(profiles.docs.map((p) => [p.id, String(p.data().displayName ?? p.data().email ?? p.id)])); const day = new Date().toISOString().slice(0, 10);
  return agents.docs.map((agent) => { const sent = subs.docs.filter((sub) => sub.data().submittedBy === agent.id && String(sub.data().submittedAt?.toDate?.()?.toISOString?.() ?? '').slice(0, 10) === day).sort((a,b) => (b.data().submittedAt?.toMillis?.() ?? 0) - (a.data().submittedAt?.toMillis?.() ?? 0))[0]; return { uid: agent.id, name: names.get(agent.id) ?? agent.id, submittedToday: Boolean(sent), latestBatchId: sent?.data().batchId ?? null }; });
}
export async function submissionsByBatch(user: DecodedIdToken, orgId: string, campId: string, streamId: string, batchId: string) { await manager(user, orgId, campId); const ref = campaign(orgId, campId).collection('voteStreams').doc(streamId); await migrateLegacySubmissions(ref); const snap = await ref.collection('submissions').where('batchId', '==', batchId).get(); return snap.docs.map(serialise); }
export async function editSubmission(user: DecodedIdToken, orgId: string, campId: string, streamId: string, submissionId: string, input: Record<string, unknown>) {
  await manager(user, orgId, campId); const ref = campaign(orgId, campId).collection('voteStreams').doc(streamId); const entry = ref.collection('submissions').doc(submissionId); const [snapshot, config] = await Promise.all([entry.get(), configuration(ref)]); if (!snapshot.exists) throw new NotFoundError('El envío no existe.'); const votes = Number(input.votes); if (!Number.isInteger(votes) || votes < 0) throw new ValidationError('Indicá una cantidad entera de votos válida.'); const candidateId = String(snapshot.data()?.candidateId ?? ''); if (!config.candidates.some((candidate) => candidate.id === candidateId)) throw new ValidationError('El candidato no es válido.');
  await db.runTransaction(async (transaction) => { const current = await transaction.get(ref); const totals = { ...((current.data()?.liveResults?.totals ?? {}) as Record<string, number>) }; totals[candidateId] = Math.max(0, Number(totals[candidateId] ?? 0) - Number(snapshot.data()?.votes ?? 0) + votes); transaction.update(entry, { votes, editedBy: user.uid, editedAt: FieldValue.serverTimestamp() }); transaction.update(ref, { liveResults: { totals, totalVotes: Object.values(totals).reduce((sum,value) => sum + Number(value),0), updatedAt: FieldValue.serverTimestamp() } }); }); await syncPublicRanking(orgId, campId, streamId); return serialise(await entry.get());
}
export async function publishRanking(user: DecodedIdToken, orgId: string, campId: string, streamId: string) { await manager(user, orgId, campId); await syncPublicRanking(orgId, campId, streamId); await campaign(orgId,campId).collection('publicVoteRankings').doc(streamId).set({ public: true, publishedAt: FieldValue.serverTimestamp(), publishedBy:user.uid }, { merge: true }); return { url: `/vote-stream/public/${orgId}/${campId}/${streamId}` }; }
