import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { saveProject } from './smartplannerProviders.service.js';

const operationTypes = ['mitin', 'caminata', 'cartel', 'otro'];
const operationStatuses = ['planificado', 'en_montaje', 'listo', 'finalizado'];
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const serialize = (document: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: document.id, ...document.data(), createdAt: document.data().createdAt?.toDate?.().toISOString?.() ?? null });

async function readable(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const organization = await db.collection('organizations').doc(orgId).get();
  if (organization.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.');
}
async function writable(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId);
  if (['cliente', 'admin'].includes(String(user.role))) return;
  const member = await campaign(orgId, campId).collection('members').doc(user.uid).get();
  if (!['pm', 'contador'].includes(String(member.data()?.smartPlannerRole ?? 'miembro'))) throw new ForbiddenError('No tenés permisos para administrar operaciones.');
}
const location = (value: unknown, name: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${name} es obligatoria.`);
  return parsed;
};
const requirements = (input: Record<string, unknown>) => ({ tarima: input.tarima === true, sonido: input.sonido === true, seguridad: input.seguridad === true, banderas: input.banderas === true, otros: String(input.otros ?? '').trim(), providerId: String(input.providerId ?? '').trim() });

export async function listOperations(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId);
  return (await campaign(orgId, campId).collection('spOperations').orderBy('scheduledDate', 'asc').get()).docs.map(serialize);
}

export async function saveOperation(user: DecodedIdToken, orgId: string, campId: string, operationId: string | null, input: Record<string, unknown>) {
  await writable(user, orgId, campId);
  const title = String(input.title ?? '').trim();
  const type = String(input.type ?? 'otro');
  const status = String(input.status ?? 'planificado');
  const address = String(input.address ?? '').trim();
  const assignedTo = String(input.assignedTo ?? '').trim();
  const scheduledDate = String(input.scheduledDate ?? '').trim();
  if (!title || !address || !scheduledDate || !operationTypes.includes(type) || !operationStatuses.includes(status)) throw new ValidationError('Completá los datos obligatorios de la operación.');
  if (assignedTo && !(await campaign(orgId, campId).collection('members').doc(assignedTo).get()).exists) throw new ValidationError('La persona responsable no pertenece a la campaña.');
  const reference = operationId ? campaign(orgId, campId).collection('spOperations').doc(operationId) : campaign(orgId, campId).collection('spOperations').doc();
  if (operationId && !(await reference.get()).exists) throw new NotFoundError('La operación no existe.');
  const data = { title, type, lat: location(input.lat, 'La latitud'), lng: location(input.lng, 'La longitud'), address, assignedTo, status, scheduledDate, notes: String(input.notes ?? '').trim(), requirements: requirements(input) };
  await reference.set({ ...data, ...(operationId ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid }) }, { merge: true });
  return { id: reference.id, ...data };
}

export async function saveRequirements(user: DecodedIdToken, orgId: string, campId: string, operationId: string, input: Record<string, unknown>) {
  await writable(user, orgId, campId);
  const reference = campaign(orgId, campId).collection('spOperations').doc(operationId);
  if (!(await reference.get()).exists) throw new NotFoundError('La operación no existe.');
  const data = requirements(input);
  await reference.update({ requirements: data, updatedAt: FieldValue.serverTimestamp() });
  return data;
}

export async function generateWorkOrder(user: DecodedIdToken, orgId: string, campId: string, operationId: string) {
  await writable(user, orgId, campId);
  const reference = campaign(orgId, campId).collection('spOperations').doc(operationId);
  const operation = await reference.get();
  if (!operation.exists) throw new NotFoundError('La operación no existe.');
  const source = operation.data() ?? {}; const required = requirements(source.requirements as Record<string, unknown> ?? {});
  if (!required.providerId) throw new ValidationError('Elegí un proveedor antes de generar la orden de trabajo.');
  if (typeof source.workOrderProjectId === 'string' && source.workOrderProjectId) return { projectId: source.workOrderProjectId, reused: true };
  const labels = [['tarima', 'Tarima'], ['sonido', 'Sonido'], ['seguridad', 'Seguridad'], ['banderas', 'Banderas']].filter(([key]) => required[key as keyof typeof required] === true).map(([, label]) => label);
  if (required.otros) labels.push(required.otros);
  const project = await saveProject(user, orgId, campId, null, { providerId: required.providerId, title: `Orden de trabajo: ${String(source.title ?? 'Operación')}`, description: labels.length ? `Requisitos del evento: ${labels.join(', ')}.` : 'Orden de trabajo sin requisitos detallados.', budget: 0, spent: 0, status: 'cotizando', startDate: String(source.scheduledDate ?? ''), endDate: String(source.scheduledDate ?? '') });
  await reference.update({ workOrderProjectId: project.id, updatedAt: FieldValue.serverTimestamp() });
  return { projectId: project.id, reused: false };
}

export async function removeOperation(user: DecodedIdToken, orgId: string, campId: string, operationId: string) {
  await writable(user, orgId, campId);
  const reference = campaign(orgId, campId).collection('spOperations').doc(operationId);
  if (!(await reference.get()).exists) throw new NotFoundError('La operación no existe.');
  await reference.delete();
}
