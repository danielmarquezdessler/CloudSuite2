import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { adminAuth, db, storage } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

type CampaignInput = { nombre?: string; templateId?: string };
type CloneInput = CampaignInput & { copiar?: { equipos?: boolean; funciones?: boolean; preguntas?: boolean; candidatos?: boolean } };
type TemplateInput = { nombre?: string; campId?: string };

function organizationRef(orgId: string) {
  return db.collection('organizations').doc(orgId);
}

function assertOrganizationClient(user: DecodedIdToken, orgId: string) {
  if (user.orgId !== orgId || user.role !== 'cliente') {
    throw new ForbiddenError('Solo el Cliente puede gestionar las campañas de la organización.');
  }
}

function campaignName(input: CampaignInput) {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new ValidationError('El nombre de la campaña es obligatorio.');
  if (nombre.length > 120) throw new ValidationError('El nombre de la campaña no puede superar los 120 caracteres.');
  return nombre;
}

function templateName(input: TemplateInput) {
  const nombre = input.nombre?.trim();
  if (!nombre) throw new ValidationError('El nombre de la plantilla es obligatorio.');
  if (nombre.length > 120) throw new ValidationError('El nombre de la plantilla no puede superar los 120 caracteres.');
  return nombre;
}

function templateStructures(target: FirebaseFirestore.DocumentReference, template: FirebaseFirestore.DocumentData, uid: string, batch: FirebaseFirestore.WriteBatch) {
  const teams = Array.isArray(template.teams) ? template.teams : [];
  const functions = Array.isArray(template.functions) ? template.functions : [];
  const questionSets = Array.isArray(template.questionSets) ? template.questionSets : [];
  teams.forEach((item) => batch.set(target.collection('teams').doc(), { name: String(item?.name ?? ''), description: String(item?.description ?? ''), leaderId: null, deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), templateId: template.id ?? null }));
  functions.forEach((item) => batch.set(target.collection('functions').doc(), { name: String(item?.name ?? ''), description: String(item?.description ?? ''), color: String(item?.color ?? '#0060F0'), deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), templateId: template.id ?? null }));
  questionSets.forEach((item) => batch.set(target.collection('questionSets').doc(), { name: String(item?.name ?? ''), questions: Array.isArray(item?.questions) ? item.questions : [], active: Boolean(item?.active), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: uid, templateId: template.id ?? null }));
}

function serializeCampaign(id: string, data: FirebaseFirestore.DocumentData, memberCount: number, voterCount: number) {
  return {
    id,
    nombre: String(data.nombre ?? 'Campaña sin nombre'),
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
    memberCount,
    voterCount
  };
}

export async function listCampaigns(user: DecodedIdToken, orgId: string) {
  if (user.orgId !== orgId) throw new ForbiddenError('No tenés acceso a esta organización.');
  const snapshot = await organizationRef(orgId).collection('campaigns').orderBy('createdAt', 'asc').get();
  return Promise.all(snapshot.docs.map(async (campaign) => {
    const [members, voters] = await Promise.all([campaign.ref.collection('members').get(), campaign.ref.collection('voters').get()]);
    return serializeCampaign(campaign.id, campaign.data(), members.size, voters.size);
  }));
}

const asDate = (value: unknown) => value && typeof (value as { toDate?: unknown }).toDate === 'function'
  ? (value as { toDate: () => Date }).toDate() : null;
const percent = (value: number, total: number) => total ? Math.round((value / total) * 1000) / 10 : 0;

export async function compareCampaigns(user: DecodedIdToken, orgId: string, requestedIds: string[]) {
  if (user.orgId !== orgId) throw new ForbiddenError('No tenés acceso a esta organización.');
  const ids = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2) throw new ValidationError('Elegí al menos dos campañas para comparar.');
  if (ids.length > 6) throw new ValidationError('Podés comparar hasta seis campañas a la vez.');
  const allowed = (user.camps as Record<string, boolean> | undefined) ?? {};
  if (!(user.role === 'cliente' && user.allCamps === true) && ids.some((id) => !allowed[id])) throw new ForbiddenError('No tenés acceso a una de las campañas seleccionadas.');
  const organization = organizationRef(orgId);
  return Promise.all(ids.map(async (campId) => {
    const campaign = organization.collection('campaigns').doc(campId);
    const [campaignSnapshot, principalSnapshot, votersSnapshot, visitsSnapshot, membersSnapshot] = await Promise.all([
      campaign.get(), campaign.collection('candidates').where('isPrincipal', '==', true).limit(1).get(), campaign.collection('voters').get(), campaign.collection('visits').get(), campaign.collection('members').get()
    ]);
    if (!campaignSnapshot.exists) throw new NotFoundError('Una de las campañas seleccionadas no existe.');
    const resetAt = asDate(campaignSnapshot.data()?.metricsResetAt);
    const voters = votersSnapshot.docs.map((doc) => doc.data());
    const activeVisits = visitsSnapshot.docs.filter((visit) => {
      if (!resetAt) return true;
      const data = visit.data(); const occurredAt = asDate(data.startedAt) ?? asDate(data.completedAt);
      return Boolean(occurredAt && occurredAt >= resetAt);
    });
    const visited = voters.filter((voter) => voter.state !== 'unvisited').length;
    const yes = voters.filter((voter) => voter.state === 'converted_yes').length;
    const no = voters.filter((voter) => voter.state === 'converted_no').length;
    const undecided = voters.filter((voter) => voter.state === 'undecided').length;
    const principal = principalSnapshot.docs[0]?.data();
    const principalType = principal?.type === 'Otro' ? principal.customType || 'Otro' : principal?.type;
    return {
      id: campId,
      nombre: String(campaignSnapshot.data()?.nombre ?? 'Campaña sin nombre'),
      createdAt: campaignSnapshot.data()?.createdAt?.toDate?.().toISOString?.() ?? null,
      principal: principal ? { name: String(principal.name ?? ''), type: String(principalType ?? '') } : null,
      totalVoters: voters.length,
      totalVisits: activeVisits.length,
      coveragePercent: percent(visited, voters.length),
      memberCount: membersSnapshot.size,
      conversion: {
        yes: { count: yes, percent: percent(yes, voters.length) },
        no: { count: no, percent: percent(no, voters.length) },
        undecided: { count: undecided, percent: percent(undecided, voters.length) }
      }
    };
  }));
}

const timelineDate = (value: unknown) => asDate(value)?.toISOString() ?? new Date().toISOString();

export async function getCampaignTimeline(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = organizationRef(orgId).collection('campaigns').doc(campId);
  const [campaignSnapshot, audit, voters, visits] = await Promise.all([
    campaign.get(), campaign.collection('auditLog').get(), campaign.collection('voters').get(), campaign.collection('visits').get()
  ]);
  if (!campaignSnapshot.exists) throw new NotFoundError('La campaña no existe.');
  const interesting = new Set(['CAMPAIGN_CREATED', 'SET_PRINCIPAL_CANDIDATE', 'GOAL_COMPLETED', 'METRICS_RESET']);
  const events = audit.docs.filter((item) => interesting.has(String(item.data().action))).map((item) => {
    const data = item.data(); const after = data.changes?.after as Record<string, unknown> | undefined;
    const action = String(data.action);
    const title = action === 'CAMPAIGN_CREATED' ? 'Campaña creada'
      : action === 'SET_PRINCIPAL_CANDIDATE' ? `Candidato principal: ${String(after?.name ?? 'actualizado')}`
        : action === 'GOAL_COMPLETED' ? `Meta alcanzada: ${String(after?.description ?? 'objetivo de campaña')}`
          : 'Métricas de campaña reiniciadas';
    const type = action === 'CAMPAIGN_CREATED' ? 'campaign-created' : action === 'SET_PRINCIPAL_CANDIDATE' ? 'candidate' : action === 'GOAL_COMPLETED' ? 'goal' : 'reset';
    return { id: item.id, title, date: timelineDate(data.timestamp), type, description: typeof after?.message === 'string' ? after.message : undefined };
  });
  const visited = voters.docs.filter((item) => item.data().state !== 'unvisited').length;
  const lastVisit = visits.docs.map((item) => asDate(item.data().completedAt) ?? asDate(item.data().startedAt)).filter((value): value is Date => Boolean(value)).sort((left, right) => right.getTime() - left.getTime())[0];
  if (visits.size >= 100) events.push({ id: 'milestone-visits-100', title: '100 visitas registradas', date: (lastVisit ?? new Date()).toISOString(), type: 'volume', description: `La campaña superó las 100 visitas (${visits.size} en total).` });
  if (voters.size && visited / voters.size >= 0.5) events.push({ id: 'milestone-coverage-50', title: '50% de cobertura alcanzada', date: (lastVisit ?? new Date()).toISOString(), type: 'volume', description: `${visited} de ${voters.size} electores ya fueron visitados.` });
  return events.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

export async function createCampaign(user: DecodedIdToken, orgId: string, input: CampaignInput) {
  assertOrganizationClient(user, orgId);
  const nombre = campaignName(input);
  const organization = organizationRef(orgId);
  if (!(await organization.get()).exists) throw new NotFoundError('La organización no existe.');
  const template = input.templateId?.trim()
    ? await organization.collection('campaignTemplates').doc(input.templateId.trim()).get()
    : null;
  if (template && !template.exists) throw new NotFoundError('La plantilla seleccionada no existe.');
  const campaign = organization.collection('campaigns').doc();
  const batch = db.batch();
  batch.set(campaign, { nombre, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  batch.set(campaign.collection('members').doc(user.uid), {
    email: user.email ?? '', displayName: user.name ?? user.email?.split('@')[0] ?? '', role: 'cliente', functionId: null, teamId: null, joinedAt: FieldValue.serverTimestamp()
  });
  if (template) templateStructures(campaign, { id: template.id, ...template.data() }, user.uid, batch);
  await batch.commit();

  const authUser = await adminAuth.getUser(user.uid);
  const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>;
  delete claims.camps;
  await adminAuth.setCustomUserClaims(user.uid, { ...claims, role: 'cliente', orgId, allCamps: true });
  return { id: campaign.id, nombre, memberCount: 1, voterCount: 0, createdAt: new Date().toISOString() };
}

export async function listCampaignTemplates(user: DecodedIdToken, orgId: string) {
  assertOrganizationClient(user, orgId);
  const templates = await organizationRef(orgId).collection('campaignTemplates').orderBy('createdAt', 'asc').get();
  return templates.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      nombre: String(data.nombre ?? 'Plantilla sin nombre'),
      createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
      functionCount: Array.isArray(data.functions) ? data.functions.length : 0,
      teamCount: Array.isArray(data.teams) ? data.teams.length : 0,
      questionSetCount: Array.isArray(data.questionSets) ? data.questionSets.length : 0
    };
  });
}

export async function saveCampaignTemplate(user: DecodedIdToken, orgId: string, input: TemplateInput) {
  assertOrganizationClient(user, orgId);
  const nombre = templateName(input);
  const campId = input.campId?.trim();
  if (!campId) throw new ValidationError('Elegí la campaña cuya estructura querés guardar.');
  const campaign = organizationRef(orgId).collection('campaigns').doc(campId);
  if (!(await campaign.get()).exists) throw new NotFoundError('La campaña no existe.');
  const [teams, functions, questionSets] = await Promise.all([campaign.collection('teams').get(), campaign.collection('functions').get(), campaign.collection('questionSets').get()]);
  const template = organizationRef(orgId).collection('campaignTemplates').doc();
  await template.set({
    nombre,
    teams: teams.docs.filter((item) => item.data().deleted !== true).map((item) => ({ name: String(item.data().name ?? ''), description: String(item.data().description ?? '') })),
    functions: functions.docs.filter((item) => item.data().deleted !== true).map((item) => ({ name: String(item.data().name ?? ''), description: String(item.data().description ?? ''), color: String(item.data().color ?? '#0060F0') })),
    questionSets: questionSets.docs.map((item) => ({ name: String(item.data().name ?? ''), questions: item.data().questions ?? [], active: Boolean(item.data().active) })),
    sourceCampaignId: campId,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: user.uid
  });
  return { id: template.id, nombre, functionCount: functions.docs.filter((item) => item.data().deleted !== true).length, teamCount: teams.docs.filter((item) => item.data().deleted !== true).length, questionSetCount: questionSets.size, createdAt: new Date().toISOString() };
}

export async function deleteCampaignTemplate(user: DecodedIdToken, orgId: string, templateId: string) {
  assertOrganizationClient(user, orgId);
  const template = organizationRef(orgId).collection('campaignTemplates').doc(templateId);
  if (!(await template.get()).exists) throw new NotFoundError('La plantilla no existe.');
  await template.delete();
  return { id: templateId, deleted: true };
}

export async function renameCampaign(user: DecodedIdToken, orgId: string, campId: string, input: CampaignInput) {
  assertOrganizationClient(user, orgId);
  const campaign = organizationRef(orgId).collection('campaigns').doc(campId);
  if (!(await campaign.get()).exists) throw new NotFoundError('La campaña no existe.');
  const nombre = campaignName(input);
  await campaign.update({ nombre, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { id: campId, nombre };
}

async function copyCandidatePhoto(source: unknown, candidateId: string) {
  if (typeof source !== 'string' || !source.startsWith('gs://')) return { photoUrl: null, photoDownloadToken: null };
  const sourcePath = source.replace(/^gs:\/\/[^/]+\//, ''); const destinationPath = `candidates/${candidateId}.jpg`;
  const token = randomUUID();
  await storage.bucket().file(sourcePath).copy(storage.bucket().file(destinationPath));
  await storage.bucket().file(destinationPath).setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  return { photoUrl: `gs://${storage.bucket().name}/${destinationPath}`, photoDownloadToken: token };
}

export async function cloneCampaign(user: DecodedIdToken, orgId: string, sourceCampId: string, input: CloneInput) {
  assertOrganizationClient(user, orgId);
  const source = organizationRef(orgId).collection('campaigns').doc(sourceCampId);
  if (!(await source.get()).exists) throw new NotFoundError('La campaña a duplicar no existe.');
  const copied = { equipos: input.copiar?.equipos !== false, funciones: input.copiar?.funciones !== false, preguntas: input.copiar?.preguntas !== false, candidatos: input.copiar?.candidatos !== false };
  const created = await createCampaign(user, orgId, { nombre: campaignName(input) });
  const target = organizationRef(orgId).collection('campaigns').doc(created.id);
  const [teams, functions, questionSets, candidates] = await Promise.all([
    copied.equipos ? source.collection('teams').get() : Promise.resolve(null),
    copied.funciones ? source.collection('functions').get() : Promise.resolve(null),
    copied.preguntas ? source.collection('questionSets').get() : Promise.resolve(null),
    copied.candidatos ? source.collection('candidates').get() : Promise.resolve(null)
  ]);
  const batch = db.batch();
  teams?.docs.filter((item) => item.data().deleted !== true).forEach((item) => batch.set(target.collection('teams').doc(), { name: String(item.data().name ?? ''), description: String(item.data().description ?? ''), leaderId: null, deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), clonedFrom: item.id }));
  functions?.docs.filter((item) => item.data().deleted !== true).forEach((item) => batch.set(target.collection('functions').doc(), { name: String(item.data().name ?? ''), description: String(item.data().description ?? ''), color: String(item.data().color ?? '#0060F0'), deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), clonedFrom: item.id }));
  questionSets?.docs.forEach((item) => batch.set(target.collection('questionSets').doc(), { name: String(item.data().name ?? ''), questions: item.data().questions ?? [], active: Boolean(item.data().active), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: user.uid, clonedFrom: item.id }));
  await batch.commit();
  for (const item of candidates?.docs ?? []) {
    const ref = target.collection('candidates').doc(); const photo = await copyCandidatePhoto(item.data().photoUrl, ref.id);
    await ref.set({ name: String(item.data().name ?? ''), type: String(item.data().type ?? ''), ...(item.data().type === 'Otro' && item.data().customType ? { customType: String(item.data().customType) } : {}), party: item.data().party ?? null, ...photo, isPrincipal: false, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, clonedFrom: item.id });
  }
  return { ...created, copied };
}

async function removeCampaignClaim(uid: string, orgId: string, campId: string) {
  try {
    const authUser = await adminAuth.getUser(uid);
    const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>;
    if (claims.orgId !== orgId) return;
    if (claims.role === 'cliente' && claims.allCamps === true) return;
    const camps = { ...((claims.camps as Record<string, boolean> | undefined) ?? {}) };
    delete camps[campId];
    if (Object.keys(camps).length) {
      await adminAuth.setCustomUserClaims(uid, { ...claims, camps });
      return;
    }
    delete claims.camps;
    delete claims.orgId;
    delete claims.role;
    await Promise.all([
      adminAuth.setCustomUserClaims(uid, claims),
      organizationRef(orgId).collection('members').doc(uid).delete()
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/user-not-found') return;
    throw error;
  }
}

export async function deleteCampaign(user: DecodedIdToken, orgId: string, campId: string) {
  assertOrganizationClient(user, orgId);
  const organization = organizationRef(orgId);
  const [campaigns, campaign] = await Promise.all([organization.collection('campaigns').get(), organization.collection('campaigns').doc(campId).get()]);
  if (!campaign.exists) throw new NotFoundError('La campaña no existe.');
  if (campaigns.size <= 1) throw new ValidationError('Debe existir al menos una campaña.');

  const campaignRef = campaign.ref;
  const [members, pendingInvitations, candidates] = await Promise.all([
    campaignRef.collection('members').get(),
    organization.collection('invitations').where('campaignId', '==', campId).where('status', '==', 'pending').get(),
    campaignRef.collection('candidates').get()
  ]);
  // recursiveDelete elimina el documento de campaña y todas sus subcolecciones: voters, visits,
  // teams, functions, calendar, circuitos, zones, goals, routes, questionSets, budgets,
  // aiSuggestions, auditLog y cualquier colección futura propia de la campaña.
  await db.recursiveDelete(campaignRef);
  await Promise.all([
    ...candidates.docs.map((candidate) => {
      const photo = candidate.data().photoUrl;
      const path = typeof photo === 'string' && photo.startsWith('gs://') ? photo.replace(/^gs:\/\/[^/]+\//, '') : '';
      return path ? storage.bucket().file(path).delete().catch(() => undefined) : Promise.resolve();
    }),
    ...members.docs.map((member) => removeCampaignClaim(member.id, orgId, campId)),
    ...pendingInvitations.docs.map((invitation) => invitation.ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedReason: 'campaign_deleted' }))
  ]);
  return { id: campId, deleted: true, removedMembers: members.size };
}
