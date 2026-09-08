import { FieldValue } from 'firebase-admin/firestore';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '../config/firebase.js';
import { createNotification } from './notifications.service.js';

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
  const defaultFunctions = [
    ['Jefe de Campaña', 'Conduce la estrategia general de la campaña.', '#0060F0'],
    ['Coordinador de Zona', 'Coordina la operación territorial.', '#D6008C'],
    ['Fiscal', 'Fiscaliza y reporta durante la jornada electoral.', '#198754'],
    ['Militante', 'Colabora con las acciones de campaña.', '#FD7E14'],
    ['Apoyo Logístico', 'Apoya la logística y los recursos.', '#6C757D']
  ] as const;
  const functionRefs = defaultFunctions.map(() => campaignRef.collection('functions').doc());

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
    defaultFunctions.forEach(([name, description, color], index) => transaction.set(functionRefs[index], {
      name, description, color, deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    }));
    transaction.set(campaignRef.collection('members').doc(user.uid), {
      email: user.email ?? '', displayName: user.name ?? user.email?.split('@')[0] ?? '', role: 'cliente', functionId: functionRefs[0].id, teamId: null, joinedAt: FieldValue.serverTimestamp()
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

  await Promise.all([
    createNotification(user.uid, { type: 'welcome', title: 'Bienvenido a CloudSuite', message: `Tu campaña ${campaignName} está lista para empezar.`, metadata: { orgId: orgRef.id, campId: campaignRef.id } }),
    createNotification(user.uid, { type: 'tip', title: 'Importá tus electores', message: 'Subí un CSV o Excel para iniciar la conversión electoral.', metadata: { path: '/electoral-conversion/voters' } }),
    createNotification(user.uid, { type: 'tip', title: 'Configurá tu visita', message: 'Personalizá las preguntas que verá tu equipo territorial.', metadata: { path: '/planning/questions' } })
  ]);

  return { orgId: orgRef.id, campId: campaignRef.id };
}

export async function getCurrentUserData(user: DecodedIdToken) {
  const profileSnapshot = await db.collection('users').doc(user.uid).get();
  const profile = profileSnapshot.data() ?? {};
  const claimedOrgId = typeof user.orgId === 'string' ? user.orgId : undefined;
  const profileOrgId = Array.isArray(profile.orgIds)
    ? profile.orgIds.find((orgId): orgId is string => typeof orgId === 'string')
    : undefined;
  // Firebase puede tardar unos segundos en emitir un token con claims recién asignadas.
  // Durante esa ventana el backend sólo usa la membresía del propio usuario como respaldo.
  const orgId = claimedOrgId ?? profileOrgId;
  if (!orgId) {
    return { hasOrg: false };
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const [organizationSnapshot, memberSnapshot, campaignsSnapshot] = await Promise.all([
    orgRef.get(),
    orgRef.collection('members').doc(user.uid).get(),
    orgRef.collection('campaigns').get()
  ]);

  if (!organizationSnapshot.exists) {
    throw new NotFoundError('La organización no existe.');
  }
  if (!memberSnapshot.exists) {
    return { hasOrg: false };
  }

  const organization = organizationSnapshot.data()!;
  const member = memberSnapshot.data() ?? {};
  const camps = typeof user.camps === 'object' && user.camps !== null ? user.camps as Record<string, boolean> : {};
  const claimsArePending = !claimedOrgId;
  return {
    hasOrg: true,
    profile: {
      email: profile.email ?? user.email ?? '',
      displayName: profile.displayName ?? null
    },
    organization: { id: organizationSnapshot.id, nombre: organization.nombre },
    campaigns: campaignsSnapshot.docs
      .filter((campaign) => claimsArePending || camps[campaign.id] === true)
      .map((campaign) => ({ id: campaign.id, nombre: campaign.data().nombre })),
    role: typeof user.role === 'string' ? user.role : member.role ?? 'sin-rol'
  };
}
