import { FieldValue } from 'firebase-admin/firestore';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, db } from '../config/firebase.js';
import { createNotification } from './notifications.service.js';
import { appendAudit } from './audit.service.js';

export class ConflictError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}

interface BootstrapInput {
  organizationName: string;
}

export async function bootstrapOrganization(user: DecodedIdToken, input: BootstrapInput) {
  const organizationName = input.organizationName.trim();
  const campaignName = 'Campaña Electoral';
  if (!organizationName) {
    throw new Error('El nombre de la organización es obligatorio.');
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
      await adminAuth.setCustomUserClaims(user.uid, { role: 'cliente', orgId: existingOrgId, allCamps: true });
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
  const circuitoRef = campaignRef.collection('circuitos').doc();
  const zoneRefs = [campaignRef.collection('zones').doc(), campaignRef.collection('zones').doc()];
  const goalRefs = [campaignRef.collection('goals').doc(), campaignRef.collection('goals').doc()];
  const budgetRefs = [campaignRef.collection('budgets').doc(), campaignRef.collection('budgets').doc(), campaignRef.collection('budgets').doc()];
  const suggestionRefs = [campaignRef.collection('aiSuggestions').doc(), campaignRef.collection('aiSuggestions').doc()];

  await db.runTransaction(async (transaction) => {
    transaction.set(orgRef, {
      nombre: organizationName,
      ownerUid: user.uid,
      enabledAddons: { smartPlanner: false },
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
    transaction.set(circuitoRef, { name: 'Circuito Central', district: 'Distrito Central', schools: [{ name: 'Escuela Central', address: 'Centro', lat: -34.6037, lng: -58.3816 }], leaderId: user.uid, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false });
    transaction.set(zoneRefs[0], { name: 'Zona Norte', neighborhood: 'Norte', circuitoId: circuitoRef.id, leaderId: user.uid, polygon: [{ lat: -34.59, lng: -58.40 }, { lat: -34.59, lng: -58.37 }, { lat: -34.60, lng: -58.37 }, { lat: -34.60, lng: -58.40 }], createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false });
    transaction.set(zoneRefs[1], { name: 'Zona Sur', neighborhood: 'Sur', circuitoId: circuitoRef.id, leaderId: user.uid, polygon: [{ lat: -34.61, lng: -58.40 }, { lat: -34.61, lng: -58.37 }, { lat: -34.63, lng: -58.37 }, { lat: -34.63, lng: -58.40 }], createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false });
    transaction.set(goalRefs[0], { type: 'coverage', target: 100, progress: 0, zoneId: zoneRefs[0].id, functionId: null, description: 'Cubrir el padrón prioritario', createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false });
    transaction.set(goalRefs[1], { type: 'conversion', target: 30, progress: 0, zoneId: zoneRefs[1].id, functionId: null, description: 'Convertir electores indecisos', createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false });
    [['Territorio', 100000, 0], ['Comunicación', 75000, 0], ['Logística', 50000, 0]].forEach(([category, amount, spent], index) => transaction.set(budgetRefs[index], { category, amount, spent, description: 'Línea inicial de presupuesto', createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, deleted: false }));
    [['focus_zone', 'Priorizá la Zona Norte durante la primera semana.', 'La cobertura inicial es la base para optimizar el resto de la campaña.'], ['resource_allocation', 'Reservá recursos para logística territorial.', 'El presupuesto inicial permite medir ejecución y desvíos.']].forEach(([type, content, reasoning], index) => transaction.set(suggestionRefs[index], { type, content, reasoning, potential_gain: 'Mejor cobertura y control de recursos', feedback: 'modified', source: 'demo', createdAt: FieldValue.serverTimestamp(), requestedBy: user.uid }));
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
    allCamps: true
  });

  await appendAudit(orgRef.id, campaignRef.id, user, {
    action: 'CAMPAIGN_CREATED', resource: 'campaign', resourceId: campaignRef.id,
    changes: { after: { nombre: campaignName, automatic: true } }
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
  const allCampaigns = user.role === 'cliente' && user.allCamps === true;
  const claimsArePending = !claimedOrgId;
  return {
    hasOrg: true,
    profile: {
      email: profile.email ?? user.email ?? '',
      displayName: profile.displayName ?? null
    },
    organization: {
      id: organizationSnapshot.id,
      nombre: organization.nombre,
      enabledAddons: { smartPlanner: organization.enabledAddons?.smartPlanner === true }
    },
    campaigns: campaignsSnapshot.docs
      .filter((campaign) => claimsArePending || allCampaigns || camps[campaign.id] === true)
      .map((campaign) => ({ id: campaign.id, nombre: campaign.data().nombre })),
    role: typeof user.role === 'string' ? user.role : member.role ?? 'sin-rol'
  };
}

/**
 * Add-ons change the scope of an organization, so only the platform-level
 * administrator claim may alter them. Campaign owners (role "cliente") are
 * deliberately not allowed to enable paid or gated modules for themselves.
 */
export async function setSmartPlannerEnabled(user: DecodedIdToken, orgId: string, enabled: unknown) {
  if (user.role !== 'admin') {
    throw new ForbiddenError('Solo un administrador global puede administrar add-ons.');
  }
  if (typeof enabled !== 'boolean') {
    throw new Error('El valor de SmartPlanner debe ser verdadero o falso.');
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const organization = await orgRef.get();
  if (!organization.exists) throw new NotFoundError('La organización no existe.');

  await orgRef.set({ enabledAddons: { ...(organization.data()?.enabledAddons ?? {}), smartPlanner: enabled } }, { merge: true });
  return { enabledAddons: { smartPlanner: enabled } };
}
