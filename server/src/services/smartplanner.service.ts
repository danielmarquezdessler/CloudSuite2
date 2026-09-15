import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db, storage } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { createNotification } from './notifications.service.js';

const defaults = [
  ['Estrategia', 'Dirección política y prioridades de campaña.', '#0060F0'], ['Comunicación', 'Mensajes, prensa y contenidos.', '#7C3AED'], ['Avanzada y Logística', 'Operación territorial y recursos.', '#F97316'], ['Finanzas', 'Presupuesto, compras y rendición.', '#10B981'], ['Jurídico', 'Cumplimiento y documentación electoral.', '#EF4444']
] as const;
const canonicalAreaOrder = new Map(defaults.map(([name], index) => [name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), index]));
const areaPosition = (area: Record<string, unknown>) => {
  const name = String(area.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return canonicalAreaOrder.get(name) ?? 1000 + Number(area.order ?? Number.MAX_SAFE_INTEGER);
};
const statuses = ['por_hacer', 'en_progreso', 'en_revision', 'completada'] as const;
const priorities = ['baja', 'media', 'alta'] as const;
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
type UserStory = { role: string; action: string; benefit: string };
type AcceptanceCriterion = { id: string; description: string; given: string; when: string; then: string; useGivenWhenThen: boolean; completed: boolean };
type ChecklistItem = { id: string; name: string; completed: boolean; responsible: string; dueDate: string };
const text = (value: unknown, maximum = 500) => String(value ?? '').trim().slice(0, maximum);
function cleanUserStory(value: unknown): UserStory | null {
  if (!value || typeof value !== 'object') return null;
  const story = value as Record<string, unknown>;
  const cleaned = { role: text(story.role, 120), action: text(story.action, 300), benefit: text(story.benefit, 300) };
  return cleaned.role || cleaned.action || cleaned.benefit ? cleaned : null;
}
function cleanAcceptanceCriteria(value: unknown): AcceptanceCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item, index) => {
    const criterion = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { id: text(criterion.id, 100) || `ac-${index + 1}`, description: text(criterion.description, 500), given: text(criterion.given, 400), when: text(criterion.when, 400), then: text(criterion.then, 400), useGivenWhenThen: criterion.useGivenWhenThen === true, completed: criterion.completed === true };
  }).filter((criterion) => criterion.description || criterion.given || criterion.when || criterion.then);
}
function cleanChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const entry = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { id: text(entry.id, 100) || `check-${index + 1}`, name: text(entry.name, 300), completed: entry.completed === true, responsible: text(entry.responsible, 128), dueDate: text(entry.dueDate, 20) };
  }).filter((entry) => entry.name);
}
async function activityName(user: DecodedIdToken) {
  const profile = await db.collection('users').doc(user.uid).get();
  return String(profile.data()?.displayName ?? user.name ?? user.email ?? 'Miembro');
}
async function writeTaskActivity(ref: FirebaseFirestore.DocumentReference, user: DecodedIdToken, previous: Record<string, unknown>, next: Record<string, unknown>) {
  const labels: Array<[keyof typeof next, string]> = [['status', 'Estado'], ['assignedTo', 'Responsable'], ['priority', 'Prioridad'], ['categoryId', 'Categoría']];
  const changed = labels.filter(([field]) => String(previous[field] ?? '') !== String(next[field] ?? ''));
  if (!changed.length) return;
  const changedByName = await activityName(user); const batch = db.batch();
  changed.forEach(([field, label]) => batch.set(ref.collection('activity').doc(), { field, fieldLabel: label, oldValue: String(previous[field] ?? ''), newValue: String(next[field] ?? ''), changedBy: user.uid, changedByName, changedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
}
export async function nextPbiDisplayId(orgId: string, campId: string) {
  const counter = campaign(orgId, campId).collection('spMeta').doc('pbiCounter');
  return db.runTransaction(async (transaction) => {
    const current = Number((await transaction.get(counter)).data()?.lastDisplayNumber ?? 1000);
    const next = Number.isFinite(current) ? current + 1 : 1001;
    transaction.set(counter, { lastDisplayNumber: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return `PBI-${next}`;
  });
}
type SmartPlannerTask = { id: string; assignedTo?: string; [key: string]: unknown };
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString?.() ?? null, completedAt: doc.data().completedAt?.toDate?.().toISOString?.() ?? null });
function readableProfilePhoto(profile: Record<string, unknown> | undefined) {
  const photoURL = profile?.photoURL;
  if (typeof photoURL !== 'string' || !photoURL) return null;
  if (/^https?:\/\//.test(photoURL)) return photoURL;
  const reference = /^gs:\/\/([^/]+)\/(.+)$/.exec(photoURL);
  const token = typeof profile?.avatarDownloadToken === 'string' ? profile.avatarDownloadToken : '';
  if (!reference || !token) return null;
  const [, bucket, path] = reference;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket || storage.bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

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
  const areas = snap.docs.map(serialize) as Array<Record<string, unknown>>;
  return areas.sort((left, right) => areaPosition(left) - areaPosition(right) || String(left.name ?? '').localeCompare(String(right.name ?? '')));
}
export async function saveArea(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) { await manager(user, orgId, campId); const name = String(input.name ?? '').trim(); if (!name) throw new ValidationError('El nombre del área es obligatorio.'); const ref = id ? campaign(orgId, campId).collection('spAreas').doc(id) : campaign(orgId, campId).collection('spAreas').doc(); if (id && !(await ref.get()).exists) throw new NotFoundError('El área no existe.'); const data = { name, description: String(input.description ?? '').trim(), color: String(input.color ?? '#0060F0'), order: Number(input.order ?? Date.now()) }; await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }); return { id: ref.id, ...data }; }
export async function deleteArea(user: DecodedIdToken, orgId: string, campId: string, id: string) { await manager(user, orgId, campId); await campaign(orgId, campId).collection('spAreas').doc(id).delete(); }
export async function listCategories(user: DecodedIdToken, orgId: string, campId: string) {
  await addon(user, orgId, campId);
  const snapshot = await campaign(orgId, campId).collection('spCategories').get();
  const categories = snapshot.docs.map(serialize) as Array<Record<string, unknown>>;
  return categories.sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? '')));
}
export async function saveCategory(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) {
  await manager(user, orgId, campId);
  const name = String(input.name ?? '').trim(); if (!name) throw new ValidationError('El nombre de la categoría es obligatorio.');
  const categories = campaign(orgId, campId).collection('spCategories'); const ref = id ? categories.doc(id) : categories.doc();
  if (id && !(await ref.get()).exists) throw new NotFoundError('La categoría no existe.');
  const duplicate = (await categories.get()).docs.find((doc) => doc.id !== ref.id && String(doc.data().name ?? '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (duplicate) throw new ValidationError('Ya existe una categoría con ese nombre.');
  const data = { name, color: String(input.color ?? '#7C3AED') };
  await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  return { id: ref.id, ...data };
}
export async function deleteCategory(user: DecodedIdToken, orgId: string, campId: string, id: string) {
  await manager(user, orgId, campId);
  const ref = campaign(orgId, campId).collection('spCategories').doc(id); if (!(await ref.get()).exists) throw new NotFoundError('La categoría no existe.');
  const linked = await campaign(orgId, campId).collection('spTasks').where('categoryId', '==', id).get(); const batch = db.batch();
  linked.docs.forEach((task) => batch.update(task.ref, { categoryId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })); batch.delete(ref); await batch.commit();
}
export async function listTasks(user: DecodedIdToken, orgId: string, campId: string) { await addon(user, orgId, campId); const member = await membership(user, orgId, campId); const role = String(member.data()?.smartPlannerRole ?? 'miembro'); let tasks: SmartPlannerTask[] = (await campaign(orgId, campId).collection('spTasks').orderBy('createdAt', 'desc').get()).docs.map(serialize); if (!['cliente', 'admin'].includes(String(user.role)) && !['contador', 'pm'].includes(role)) tasks = tasks.filter((task) => task.assignedTo === user.uid); return tasks; }
export async function listMembers(user: DecodedIdToken, orgId: string, campId: string) {
  await addon(user, orgId, campId);
  const snap = await campaign(orgId, campId).collection('members').get();
  const members = await Promise.all(snap.docs.map(async (doc) => {
    const membership = doc.data();
    const profile = (await db.collection('users').doc(doc.id).get()).data();
    return {
      uid: doc.id,
      ...membership,
      email: profile?.email ?? membership.email,
      displayName: profile?.displayName ?? membership.displayName,
      firstName: profile?.firstName ?? membership.firstName,
      lastName: profile?.lastName ?? membership.lastName,
      photoURL: readableProfilePhoto(profile)
    };
  }));
  if (!members.some((member) => member.uid === user.uid)) {
    const profile = (await db.collection('users').doc(user.uid).get()).data();
    members.unshift({
      uid: user.uid,
      email: profile?.email ?? user.email ?? '',
      displayName: profile?.displayName ?? user.name ?? user.email ?? 'Miembro',
      firstName: profile?.firstName,
      lastName: profile?.lastName,
      photoURL: readableProfilePhoto(profile)
    });
  }
  return members;
}
export async function saveTask(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) {
  if (!id) await manager(user, orgId, campId); else await addon(user, orgId, campId);
  const ref = id ? campaign(orgId, campId).collection('spTasks').doc(id) : campaign(orgId, campId).collection('spTasks').doc();
  const existing = id ? await ref.get() : null;
  if (id && !existing?.exists) throw new NotFoundError('La tarea no existe.');
  const member = await membership(user, orgId, campId);
  const role = String(member.data()?.smartPlannerRole ?? 'miembro');
  const canManage = ['cliente', 'admin'].includes(String(user.role)) || ['contador', 'pm'].includes(role);
  if (id && !canManage && existing?.data()?.assignedTo !== user.uid) throw new ForbiddenError('Solo podés mover tus propias tareas.');
  const status = String(input.status ?? existing?.data()?.status ?? 'por_hacer');
  if (!statuses.includes(status as typeof statuses[number])) throw new ValidationError('El estado no es válido.');
  if (!canManage) {
    const previous = existing?.data() ?? {};
    await ref.update({ status, completedAt: status === 'completada' ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
    await writeTaskActivity(ref, user, previous, { ...previous, status });
    return { id, status };
  }
  const title = String(input.title ?? '').trim();
  if (!title) throw new ValidationError('El título de la tarea es obligatorio.');
  const priority = String(input.priority ?? 'media');
  if (!priorities.includes(priority as typeof priorities[number])) throw new ValidationError('La prioridad no es válida.');
  const parsedCost = Number(input.cost ?? 0); const cost = Number.isFinite(parsedCost) ? Math.max(0, parsedCost) : 0;
  const categoryId = String(input.categoryId ?? existing?.data()?.categoryId ?? '').trim();
  if (categoryId && !(await campaign(orgId, campId).collection('spCategories').doc(categoryId).get()).exists) throw new ValidationError('La categoría seleccionada no existe.');
  const parentPbiId = String(input.parentPbiId ?? existing?.data()?.parentPbiId ?? '').trim();
  if (parentPbiId) {
    if (parentPbiId === ref.id) throw new ValidationError('Un PBI no puede ser subtarea de sí mismo.');
    if (!(await campaign(orgId, campId).collection('spTasks').doc(parentPbiId).get()).exists) throw new ValidationError('El PBI padre seleccionado no existe.');
  }
  const displayId = String(existing?.data()?.displayId ?? await nextPbiDisplayId(orgId, campId));
  const userStory = cleanUserStory(input.userStory ?? existing?.data()?.userStory);
  const acceptanceCriteria = cleanAcceptanceCriteria(input.acceptanceCriteria ?? existing?.data()?.acceptanceCriteria);
  const checklist = cleanChecklist(input.checklist ?? existing?.data()?.checklist);
  const data = { title, description: String(input.description ?? ''), areaId: String(input.areaId ?? ''), assignedTo: String(input.assignedTo ?? ''), categoryId, parentPbiId, displayId, userStory, acceptanceCriteria, checklist, status, priority, startDate: String(input.startDate ?? ''), dueDate: String(input.dueDate ?? ''), cost };
  if (!data.areaId || !data.assignedTo || !data.dueDate) throw new ValidationError('Área, responsable y fecha límite son obligatorios.');
  await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid }), ...(status === 'completada' ? { completedAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
  if (existing?.exists) await writeTaskActivity(ref, user, existing.data() ?? {}, data);
  if (data.assignedTo !== user.uid && data.assignedTo !== existing?.data()?.assignedTo) await createNotification(data.assignedTo, { type: 'smartplanner_task_assigned', title: 'Nueva tarea asignada', message: data.title, metadata: { path: '/smartplanner', orgId, campId, taskId: ref.id } });
  return { id: ref.id, ...data };
}
export async function deleteTask(user: DecodedIdToken, orgId: string, campId: string, id: string) { await manager(user, orgId, campId); await campaign(orgId, campId).collection('spTasks').doc(id).delete(); }
async function taskRefFor(user: DecodedIdToken, orgId: string, campId: string, taskId: string) {
  await addon(user, orgId, campId);
  const ref = campaign(orgId, campId).collection('spTasks').doc(taskId);
  if (!(await ref.get()).exists) throw new NotFoundError('El PBI no existe.');
  return ref;
}
export async function listTaskComments(user: DecodedIdToken, orgId: string, campId: string, taskId: string) {
  const ref = await taskRefFor(user, orgId, campId, taskId);
  return (await ref.collection('comments').orderBy('createdAt', 'asc').limit(250).get()).docs.map(serialize);
}
export async function createTaskComment(user: DecodedIdToken, orgId: string, campId: string, taskId: string, input: Record<string, unknown>) {
  const ref = await taskRefFor(user, orgId, campId, taskId); const body = text(input.text, 3000);
  if (!body) throw new ValidationError('Escribí un comentario.');
  const requested = Array.isArray(input.mentionedIds) ? input.mentionedIds : [];
  const mentionIds = Array.from(new Set(requested.map(String).filter((uid) => uid && uid !== user.uid))).slice(0, 20);
  const validMentionIds: string[] = [];
  for (const uid of mentionIds) if ((await campaign(orgId, campId).collection('members').doc(uid).get()).exists) validMentionIds.push(uid);
  const authorName = await activityName(user); const comment = ref.collection('comments').doc();
  await comment.set({ text: body, authorId: user.uid, authorName, mentions: validMentionIds, createdAt: FieldValue.serverTimestamp() });
  const path = `/smartplanner/pbi/${encodeURIComponent(taskId)}?comment=${encodeURIComponent(comment.id)}`;
  await Promise.all(validMentionIds.map((uid) => createNotification(uid, { type: 'smartplanner_pbi_mention', title: `${authorName} te mencionó en un PBI`, message: body, metadata: { path, orgId, campId, taskId, commentId: comment.id } })));
  return { id: comment.id, text: body, authorId: user.uid, authorName, mentions: validMentionIds, createdAt: null };
}
export async function listTaskActivity(user: DecodedIdToken, orgId: string, campId: string, taskId: string) {
  const ref = await taskRefFor(user, orgId, campId, taskId);
  return (await ref.collection('activity').orderBy('changedAt', 'desc').limit(250).get()).docs.map((document) => ({ id: document.id, ...document.data(), changedAt: document.data().changedAt?.toDate?.().toISOString?.() ?? null }));
}
export async function setRole(user: DecodedIdToken, orgId: string, campId: string, uid: string, smartPlannerRole: unknown) { if (user.role !== 'cliente' && user.role !== 'admin') throw new ForbiddenError('Solo Cliente o admin puede asignar roles de SmartPlanner.'); await addon(user, orgId, campId); const role = String(smartPlannerRole ?? 'miembro'); if (!['contador', 'pm', 'miembro'].includes(role)) throw new ValidationError('El rol de SmartPlanner no es válido.'); const ref = campaign(orgId, campId).collection('members').doc(uid); if (!(await ref.get()).exists) throw new NotFoundError('El miembro no existe.'); await ref.update({ smartPlannerRole: role, updatedAt: FieldValue.serverTimestamp() }); return { uid, smartPlannerRole: role }; }
