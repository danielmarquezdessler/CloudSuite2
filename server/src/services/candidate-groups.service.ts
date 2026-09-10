import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { assertCampaignManager, campaignRef, NotFoundError, ValidationError } from './access.service.js';

type CandidateGroupInput = { name?: string };
type SlateInput = { groupId?: string | null; slateRole?: string | null; order?: number | string | null };
type SlateOrderInput = { groupId?: string; titulares?: string[]; suplentes?: string[] };

function groupCollection(orgId: string, campId: string) {
  return campaignRef(orgId, campId).collection('candidateGroups');
}

function normalizeName(input: CandidateGroupInput) {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('El nombre del grupo es obligatorio.');
  if (name.length > 120) throw new ValidationError('El nombre del grupo no puede superar los 120 caracteres.');
  return name;
}

function serialize(id: string, data: FirebaseFirestore.DocumentData, counts: Map<string, { titulares: number; suplentes: number }>) {
  const count = counts.get(id) ?? { titulares: 0, suplentes: 0 };
  return { id, name: String(data.name ?? ''), createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null, ...count };
}

async function candidateCounts(orgId: string, campId: string) {
  const candidates = await campaignRef(orgId, campId).collection('candidates').get();
  const counts = new Map<string, { titulares: number; suplentes: number }>();
  for (const candidate of candidates.docs) {
    const groupId = candidate.data().groupId;
    if (typeof groupId !== 'string' || !groupId) continue;
    const current = counts.get(groupId) ?? { titulares: 0, suplentes: 0 };
    if (candidate.data().slateRole === 'titular') current.titulares += 1;
    if (candidate.data().slateRole === 'suplente') current.suplentes += 1;
    counts.set(groupId, current);
  }
  return counts;
}

export async function listCandidateGroups(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignManager(user, orgId, campId);
  const [groups, counts] = await Promise.all([groupCollection(orgId, campId).orderBy('createdAt', 'asc').get(), candidateCounts(orgId, campId)]);
  return groups.docs.map((group) => serialize(group.id, group.data(), counts));
}

export async function createCandidateGroup(user: DecodedIdToken, orgId: string, campId: string, input: CandidateGroupInput) {
  assertCampaignManager(user, orgId, campId);
  const name = normalizeName(input);
  const ref = groupCollection(orgId, campId).doc();
  await ref.set({ name, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  return { id: ref.id, name, createdAt: null, titulares: 0, suplentes: 0 };
}

export async function updateCandidateGroup(user: DecodedIdToken, orgId: string, campId: string, groupId: string, input: CandidateGroupInput) {
  assertCampaignManager(user, orgId, campId);
  const name = normalizeName(input); const ref = groupCollection(orgId, campId).doc(groupId);
  if (!(await ref.get()).exists) throw new NotFoundError('El grupo de candidatos no existe.');
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { id: groupId, name };
}

export async function deleteCandidateGroup(user: DecodedIdToken, orgId: string, campId: string, groupId: string) {
  assertCampaignManager(user, orgId, campId);
  const campaign = campaignRef(orgId, campId); const group = campaign.collection('candidateGroups').doc(groupId);
  if (!(await group.get()).exists) throw new NotFoundError('El grupo de candidatos no existe.');
  const candidates = await campaign.collection('candidates').where('groupId', '==', groupId).get();
  for (let index = 0; index < candidates.docs.length; index += 400) {
    const batch = campaign.firestore.batch();
    for (const candidate of candidates.docs.slice(index, index + 400)) batch.update(candidate.ref, { groupId: null, slateRole: null, order: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    await batch.commit();
  }
  await group.delete();
  return { id: groupId, deleted: true, unassignedCandidates: candidates.size };
}

function normalizeOrder(raw: SlateInput['order']) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new ValidationError('El orden debe ser un número entero mayor a cero.');
  return value;
}

export async function assignCandidateSlate(user: DecodedIdToken, orgId: string, campId: string, candidateId: string, input: SlateInput) {
  assertCampaignManager(user, orgId, campId);
  const campaign = campaignRef(orgId, campId); const candidate = campaign.collection('candidates').doc(candidateId);
  if (!(await candidate.get()).exists) throw new NotFoundError('El candidato no existe.');
  const groupId = typeof input.groupId === 'string' && input.groupId.trim() ? input.groupId.trim() : null;
  if (!groupId) {
    await candidate.update({ groupId: null, slateRole: null, order: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    return { id: candidateId, groupId: null, slateRole: null, order: null };
  }
  if (!(await campaign.collection('candidateGroups').doc(groupId).get()).exists) throw new NotFoundError('El grupo de candidatos no existe.');
  const slateRole = input.slateRole === 'titular' || input.slateRole === 'suplente' ? input.slateRole : null;
  if (!slateRole) throw new ValidationError('Elegí si el candidato es titular o suplente.');
  let order = normalizeOrder(input.order);
  if (!order) {
    const peers = await campaign.collection('candidates').where('groupId', '==', groupId).get();
    order = peers.docs.filter((item) => item.id !== candidateId && item.data().slateRole === slateRole).reduce((max, item) => Math.max(max, Number(item.data().order) || 0), 0) + 1;
  }
  await candidate.update({ groupId, slateRole, order, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { id: candidateId, groupId, slateRole, order };
}

export async function reorderCandidateSlate(user: DecodedIdToken, orgId: string, campId: string, input: SlateOrderInput) {
  assertCampaignManager(user, orgId, campId);
  const groupId = typeof input.groupId === 'string' ? input.groupId.trim() : '';
  if (!groupId) throw new ValidationError('Indicá la lista electoral a ordenar.');
  const titulares = Array.isArray(input.titulares) ? input.titulares : [];
  const suplentes = Array.isArray(input.suplentes) ? input.suplentes : [];
  const ids = [...titulares, ...suplentes];
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new ValidationError('La lista contiene candidatos inválidos o repetidos.');

  const campaign = campaignRef(orgId, campId);
  const [group, current] = await Promise.all([campaign.collection('candidateGroups').doc(groupId).get(), campaign.collection('candidates').where('groupId', '==', groupId).get()]);
  if (!group.exists) throw new NotFoundError('El grupo de candidatos no existe.');
  const currentIds = current.docs.map((candidate) => candidate.id).sort();
  const requestedIds = [...ids].sort();
  if (currentIds.length !== requestedIds.length || currentIds.some((id, index) => id !== requestedIds[index])) throw new ValidationError('La lista cambió. Actualizá la página e intentá de nuevo.');

  const updates = [
    ...titulares.map((id, index) => ({ id, slateRole: 'titular' as const, order: index + 1 })),
    ...suplentes.map((id, index) => ({ id, slateRole: 'suplente' as const, order: index + 1 }))
  ];
  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = campaign.firestore.batch();
    for (const update of updates.slice(offset, offset + 400)) batch.update(campaign.collection('candidates').doc(update.id), { groupId, slateRole: update.slateRole, order: update.order, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
    await batch.commit();
  }
  return { groupId, titulares, suplentes };
}
