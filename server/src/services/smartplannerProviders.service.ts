import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const categories = ['imprenta', 'sonido', 'medios', 'producción', 'catering', 'transporte', 'otro'];
const statuses = ['cotizando', 'aprobado', 'en_curso', 'completado', 'cancelado'];
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString?.() ?? null });

async function readable(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const organization = await db.collection('organizations').doc(orgId).get();
  if (organization.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.');
}

async function writable(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId);
  if (['cliente', 'admin'].includes(String(user.role))) return;
  const member = await campaign(orgId, campId).collection('members').doc(user.uid).get();
  if (!['contador', 'pm'].includes(String(member.data()?.smartPlannerRole ?? 'miembro'))) throw new ForbiddenError('No tenés permisos para administrar proveedores.');
}

const money = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; };

export async function listProviders(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId);
  return (await campaign(orgId, campId).collection('spProviders').orderBy('createdAt', 'desc').get()).docs.map(serialize);
}

export async function saveProvider(user: DecodedIdToken, orgId: string, campId: string, providerId: string | null, input: Record<string, unknown>) {
  await writable(user, orgId, campId);
  const name = String(input.name ?? '').trim(); const category = String(input.category ?? 'otro');
  if (!name || !categories.includes(category)) throw new ValidationError('Proveedor o categoría inválidos.');
  const ref = providerId ? campaign(orgId, campId).collection('spProviders').doc(providerId) : campaign(orgId, campId).collection('spProviders').doc();
  if (providerId && !(await ref.get()).exists) throw new NotFoundError('Proveedor no encontrado.');
  const data = { name, category, contactInfo: String(input.contactInfo ?? '') };
  await ref.set({ ...data, ...(providerId ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  return { id: ref.id, ...data };
}

export async function removeProvider(user: DecodedIdToken, orgId: string, campId: string, providerId: string) {
  await writable(user, orgId, campId);
  const ref = campaign(orgId, campId).collection('spProviders').doc(providerId);
  if (!(await ref.get()).exists) throw new NotFoundError('Proveedor no encontrado.');
  const projects = await campaign(orgId, campId).collection('spProviderProjects').where('providerId', '==', providerId).get();
  const batch = db.batch(); batch.delete(ref); projects.docs.forEach((project) => batch.delete(project.ref)); await batch.commit();
}

export async function listProjects(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId);
  return (await campaign(orgId, campId).collection('spProviderProjects').orderBy('createdAt', 'desc').get()).docs.map(serialize);
}

export async function saveProject(user: DecodedIdToken, orgId: string, campId: string, projectId: string | null, input: Record<string, unknown>) {
  await writable(user, orgId, campId);
  const providerId = String(input.providerId ?? ''); const title = String(input.title ?? '').trim(); const status = String(input.status ?? 'cotizando');
  if (!providerId || !title || !statuses.includes(status)) throw new ValidationError('Proveedor, título o estado inválidos.');
  if (!(await campaign(orgId, campId).collection('spProviders').doc(providerId).get()).exists) throw new ValidationError('El proveedor seleccionado no existe.');
  const ref = projectId ? campaign(orgId, campId).collection('spProviderProjects').doc(projectId) : campaign(orgId, campId).collection('spProviderProjects').doc();
  if (projectId && !(await ref.get()).exists) throw new NotFoundError('Proyecto no encontrado.');
  const data = { providerId, title, description: String(input.description ?? ''), budget: money(input.budget), spent: money(input.spent), status, startDate: String(input.startDate ?? ''), endDate: String(input.endDate ?? '') };
  await ref.set({ ...data, ...(projectId ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  return { id: ref.id, ...data };
}

export async function removeProject(user: DecodedIdToken, orgId: string, campId: string, projectId: string) {
  await writable(user, orgId, campId);
  const ref = campaign(orgId, campId).collection('spProviderProjects').doc(projectId);
  if (!(await ref.get()).exists) throw new NotFoundError('Proyecto no encontrado.');
  await ref.delete();
}
