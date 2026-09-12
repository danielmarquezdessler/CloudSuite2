import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

const defaults = [
  ['Estrategia', 'Dirección política y prioridades de campaña.', '#0060F0'], ['Comunicación', 'Mensajes, prensa y contenidos.', '#7C3AED'], ['Avanzada y Logística', 'Operación territorial y recursos.', '#F97316'], ['Finanzas', 'Presupuesto, compras y rendición.', '#10B981'], ['Jurídico', 'Cumplimiento y documentación electoral.', '#EF4444']
] as const;
const statuses = ['por_hacer', 'en_progreso', 'en_revision', 'completada'] as const;
const priorities = ['baja', 'media', 'alta'] as const;
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
type SmartPlannerTask = { id: string; assignedTo?: string; [key: string]: unknown };
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString?.() ?? null, completedAt: doc.data().completedAt?.toDate?.().toISOString?.() ?? null });

async function addon(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const org = await db.collection('organizations').doc(orgId).get();
  if (org.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.');
}
async function membership(user: DecodedIdToken, orgId: string, campId: string) { return campaign(orgId, campId).collection('members').doc(user.uid).get(); }
async function manager(user: DecodedIdToken, orgId: string, campId: string) {
  await addon(user, orgId, campId);
  if (user.role === 'cliente' || user.role === 'admin') return;
  const member = await membership(user, orgId, campId);
  if (!['contador', 'pm'].includes(String(member.data()?.smartPlannerRole ?? 'miembro'))) throw new ForbiddenError('No tenés permisos para administrar SmartPlanner.');
}
export async function listAreas(user: DecodedIdToken, orgId: string, campId: string) {
  await addon(user, orgId, campId); const ref = campaign(orgId, campId).collection('spAreas'); let snap = await ref.orderBy('order').get();
  if (snap.empty) { const batch = db.batch(); defaults.forEach(([name, description, color], order) => batch.set(ref.doc(), { name, description, color, order, createdAt: FieldValue.serverTimestamp() })); await batch.commit(); snap = await ref.orderBy('order').get(); }
  return snap.docs.map(serialize);
}
export async function saveArea(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) { await manager(user, orgId, campId); const name = String(input.name ?? '').trim(); if (!name) throw new ValidationError('El nombre del área es obligatorio.'); const ref = id ? campaign(orgId, campId).collection('spAreas').doc(id) : campaign(orgId, campId).collection('spAreas').doc(); if (id && !(await ref.get()).exists) throw new NotFoundError('El área no existe.'); const data = { name, description: String(input.description ?? '').trim(), color: String(input.color ?? '#0060F0'), order: Number(input.order ?? Date.now()) }; await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }); return { id: ref.id, ...data }; }
export async function deleteArea(user: DecodedIdToken, orgId: string, campId: string, id: string) { await manager(user, orgId, campId); await campaign(orgId, campId).collection('spAreas').doc(id).delete(); }
export async function listTasks(user: DecodedIdToken, orgId: string, campId: string) { await addon(user, orgId, campId); const member = await membership(user, orgId, campId); const role = String(member.data()?.smartPlannerRole ?? 'miembro'); let tasks: SmartPlannerTask[] = (await campaign(orgId, campId).collection('spTasks').orderBy('createdAt', 'desc').get()).docs.map(serialize); if (!['cliente', 'admin'].includes(String(user.role)) && !['contador', 'pm'].includes(role)) tasks = tasks.filter((task) => task.assignedTo === user.uid); return tasks; }
export async function listMembers(user: DecodedIdToken, orgId: string, campId: string) { await addon(user, orgId, campId); const snap = await campaign(orgId, campId).collection('members').get(); return snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })); }
export async function saveTask(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) { if (!id) await manager(user, orgId, campId); else await addon(user, orgId, campId); const ref = id ? campaign(orgId, campId).collection('spTasks').doc(id) : campaign(orgId, campId).collection('spTasks').doc(); const existing = id ? await ref.get() : null; if (id && !existing?.exists) throw new NotFoundError('La tarea no existe.'); const member = await membership(user, orgId, campId); const role = String(member.data()?.smartPlannerRole ?? 'miembro'); const canManage = ['cliente', 'admin'].includes(String(user.role)) || ['contador', 'pm'].includes(role); if (id && !canManage && existing?.data()?.assignedTo !== user.uid) throw new ForbiddenError('Solo podés mover tus propias tareas.'); const status = String(input.status ?? existing?.data()?.status ?? 'por_hacer'); if (!statuses.includes(status as typeof statuses[number])) throw new ValidationError('El estado no es válido.'); if (!canManage) { await ref.update({ status, completedAt: status === 'completada' ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() }); return { id, status }; }
  const title = String(input.title ?? '').trim(); if (!title) throw new ValidationError('El título de la tarea es obligatorio.'); const priority = String(input.priority ?? 'media'); if (!priorities.includes(priority as typeof priorities[number])) throw new ValidationError('La prioridad no es válida.'); const data = { title, description: String(input.description ?? ''), areaId: String(input.areaId ?? ''), assignedTo: String(input.assignedTo ?? ''), status, priority, startDate: String(input.startDate ?? ''), dueDate: String(input.dueDate ?? '') }; if (!data.areaId || !data.assignedTo || !data.dueDate) throw new ValidationError('Área, responsable y fecha límite son obligatorios.'); await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }), ...(status === 'completada' ? { completedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true }); return { id: ref.id, ...data }; }
export async function deleteTask(user: DecodedIdToken, orgId: string, campId: string, id: string) { await manager(user, orgId, campId); await campaign(orgId, campId).collection('spTasks').doc(id).delete(); }
export async function setRole(user: DecodedIdToken, orgId: string, campId: string, uid: string, smartPlannerRole: unknown) { if (user.role !== 'cliente' && user.role !== 'admin') throw new ForbiddenError('Solo Cliente o admin puede asignar roles de SmartPlanner.'); await addon(user, orgId, campId); const role = String(smartPlannerRole ?? 'miembro'); if (!['contador', 'pm', 'miembro'].includes(role)) throw new ValidationError('El rol de SmartPlanner no es válido.'); const ref = campaign(orgId, campId).collection('members').doc(uid); if (!(await ref.get()).exists) throw new NotFoundError('El miembro no existe.'); await ref.update({ smartPlannerRole: role, updatedAt: FieldValue.serverTimestamp() }); return { uid, smartPlannerRole: role }; }
