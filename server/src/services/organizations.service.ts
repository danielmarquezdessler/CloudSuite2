import { FieldValue } from 'firebase-admin/firestore';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '../config/firebase.js';

export class ConflictError extends Error {}
export class NotFoundError extends Error {}

interface BootstrapInput {
  organizationName: string;
  campaignName: string;
}

export async function bootstrapOrganization(user: DecodedIdToken, input: BootstrapInput) {
  const organizationName = input.organizationName.trim();
  const campaignName = input.campaignName.trim();
  if (!organizationName || !campaignName) {
    throw new Error('El nombre de la organización y de la campaña son obligatorios.');
  }

  const userRef = db.collection('users').doc(user.uid);
  const existingUser = await userRef.get();
  if (existingUser.exists && (existingUser.data()?.orgIds?.length ?? 0) > 0) {
    const existingOrgId = existingUser.data()!.orgIds[0];
    const existingOrgRef = db.collection('organizations').doc(existingOrgId);
    const [existingOrg, existingCampaigns] = await Promise.all([
      existingOrgRef.get(),
      existingOrgRef.collection('campaigns').get()
    ]);

    if (existingOrg.exists && existingOrg.data()?.ownerUid === user.uid && !existingCampaigns.empty) {
      const camps = Object.fromEntries(existingCampaigns.docs.map((campaign) => [campaign.id, true]));
      await adminAuth.setCustomUserClaims(user.uid, { role: 'cliente', orgId: existingOrgId, camps });
      return { orgId: existingOrgId, campId: existingCampaigns.docs[0].id, recovered: true };
    }

    throw new ConflictError('Este usuario ya pertenece a una organización y no puede inicializar otra.');
  }

  const orgRef = db.collection('organizations').doc();
  const campaignRef = orgRef.collection('campaigns').doc();

  await db.runTransaction(async (transaction) => {
    transaction.set(orgRef, {
      nombre: organizationName,
      ownerUid: user.uid,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(orgRef.collection('members').doc(user.uid), {
      role: 'cliente',
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(campaignRef, {
      nombre: campaignName,
      createdAt: FieldValue.serverTimestamp()
    });
    transaction.set(userRef, {
      email: user.email ?? '',
      displayName: user.name ?? user.email?.split('@')[0] ?? '',
      orgIds: [orgRef.id]
    });
  });

  await adminAuth.setCustomUserClaims(user.uid, {
    role: 'cliente',
    orgId: orgRef.id,
    camps: { [campaignRef.id]: true }
  });

  return { orgId: orgRef.id, campId: campaignRef.id };
}

export async function getCurrentUserData(user: DecodedIdToken) {
  const orgId = typeof user.orgId === 'string' ? user.orgId : undefined;
  if (!orgId) {
    return { hasOrg: false };
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const [profileSnapshot, organizationSnapshot, campaignsSnapshot] = await Promise.all([
    db.collection('users').doc(user.uid).get(),
    orgRef.get(),
    orgRef.collection('campaigns').get()
  ]);

  if (!organizationSnapshot.exists) {
    throw new NotFoundError('La organización no existe.');
  }

  const profile = profileSnapshot.data() ?? {};
  const organization = organizationSnapshot.data()!;
  const camps = typeof user.camps === 'object' && user.camps !== null ? user.camps as Record<string, boolean> : {};
  return {
    hasOrg: true,
    profile: {
      email: profile.email ?? user.email ?? '',
      displayName: profile.displayName ?? null
    },
    organization: { id: organizationSnapshot.id, nombre: organization.nombre },
    campaigns: campaignsSnapshot.docs
      .filter((campaign) => camps[campaign.id] === true)
      .map((campaign) => ({ id: campaign.id, nombre: campaign.data().nombre })),
    role: typeof user.role === 'string' ? user.role : 'sin-rol'
  };
}
