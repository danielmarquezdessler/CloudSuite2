import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db, storage } from '../config/firebase.js';
import { ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

type CampaignInput = { nombre?: string };

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

export async function createCampaign(user: DecodedIdToken, orgId: string, input: CampaignInput) {
  assertOrganizationClient(user, orgId);
  const nombre = campaignName(input);
  const organization = organizationRef(orgId);
  if (!(await organization.get()).exists) throw new NotFoundError('La organización no existe.');
  const campaign = organization.collection('campaigns').doc();
  const batch = db.batch();
  batch.set(campaign, { nombre, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid });
  batch.set(campaign.collection('members').doc(user.uid), {
    email: user.email ?? '', displayName: user.name ?? user.email?.split('@')[0] ?? '', role: 'cliente', functionId: null, teamId: null, joinedAt: FieldValue.serverTimestamp()
  });
  await batch.commit();

  const authUser = await adminAuth.getUser(user.uid);
  const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>;
  const camps = { ...((claims.camps as Record<string, boolean> | undefined) ?? {}), [campaign.id]: true };
  await adminAuth.setCustomUserClaims(user.uid, { ...claims, role: 'cliente', orgId, camps });
  return { id: campaign.id, nombre, memberCount: 1, voterCount: 0, createdAt: new Date().toISOString() };
}

export async function renameCampaign(user: DecodedIdToken, orgId: string, campId: string, input: CampaignInput) {
  assertOrganizationClient(user, orgId);
  const campaign = organizationRef(orgId).collection('campaigns').doc(campId);
  if (!(await campaign.get()).exists) throw new NotFoundError('La campaña no existe.');
  const nombre = campaignName(input);
  await campaign.update({ nombre, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  return { id: campId, nombre };
}

async function removeCampaignClaim(uid: string, orgId: string, campId: string) {
  try {
    const authUser = await adminAuth.getUser(uid);
    const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>;
    if (claims.orgId !== orgId) return;
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
