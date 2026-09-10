import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertCampaignAccess, assertCampaignManager, campaignRef, NotFoundError, ValidationError } from './access.service.js';
import { db } from '../config/firebase.js';

export type TaskInput = {
  title?: string; description?: string; assignedTo?: string; teamId?: string | null;
  dueDate?: string; priority?: string; status?: string;
};
export type TaskFilters = { assignedTo?: string; status?: string; teamId?: string };

const priorities = new Set(['baja', 'media', 'alta']);
const statuses = new Set(['pendiente', 'en_progreso', 'completada']);

function clean(input: TaskInput) {
  const title = input.title?.trim();
  const assignedTo = input.assignedTo?.trim();
  const dueDate = input.dueDate?.trim();
  const priority = input.priority?.trim() || 'media';
  const status = input.status?.trim() || 'pendiente';
  if (!title) throw new ValidationError('El título de la tarea es obligatorio.');
  if (!assignedTo) throw new ValidationError('Asigná la tarea a un miembro de campaña.');
  if (!dueDate || Number.isNaN(Date.parse(dueDate))) throw new ValidationError('Ingresá una fecha límite válida.');
  if (!priorities.has(priority)) throw new ValidationError('La prioridad no es válida.');
  if (!statuses.has(status)) throw new ValidationError('El estado no es válido.');
  return { title, description: input.description?.trim() ?? '', assignedTo, teamId: input.teamId?.trim() || null, dueDate, priority, status };
}

async function validateAssignees(orgId: string, campId: string, assignedTo: string, teamId: string | null) {
  const campaign = campaignRef(orgId, campId);
  if (!(await campaign.collection('members').doc(assignedTo).get()).exists) throw new ValidationError('La persona asignada debe ser miembro de la campaña.');
  if (teamId && !(await campaign.collection('teams').doc(teamId).get()).exists) throw new ValidationError('El equipo seleccionado no existe.');
}

function serialize(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  return {
    id: doc.id, ...data,
    createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
    completedAt: data.completedAt?.toDate?.().toISOString?.() ?? null
  } as Record<string, any>;
}

export async function listTasks(user: DecodedIdToken, orgId: string, campId: string, filters: TaskFilters = {}) {
  assertCampaignAccess(user, orgId, campId);
  const snap = await campaignRef(orgId, campId).collection('tasks').orderBy('createdAt', 'desc').get();
  return snap.docs.map(serialize).filter((task) =>
    (!filters.assignedTo || task.assignedTo === filters.assignedTo) &&
    (!filters.status || task.status === filters.status) &&
    (!filters.teamId || task.teamId === filters.teamId)
  );
}

export async function createTask(user: DecodedIdToken, orgId: string, campId: string, input: TaskInput) {
  assertCampaignManager(user, orgId, campId);
  const data = clean(input); await validateAssignees(orgId, campId, data.assignedTo, data.teamId);
  const ref = campaignRef(orgId, campId).collection('tasks').doc();
  await ref.set({ ...data, assignedBy: user.uid, createdAt: FieldValue.serverTimestamp(), completedAt: data.status === 'completada' ? FieldValue.serverTimestamp() : null });
  return { id: ref.id, ...data };
}

export async function updateTask(user: DecodedIdToken, orgId: string, campId: string, taskId: string, input: TaskInput) {
  assertCampaignManager(user, orgId, campId);
  const ref = campaignRef(orgId, campId).collection('tasks').doc(taskId); const current = await ref.get();
  if (!current.exists) throw new NotFoundError('La tarea no existe.');
  const data = clean({ ...current.data(), ...input }); await validateAssignees(orgId, campId, data.assignedTo, data.teamId);
  const wasCompleted = current.data()?.status === 'completada';
  await ref.update({ ...data, completedAt: data.status === 'completada' ? (wasCompleted ? current.data()?.completedAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp()) : null, updatedAt: FieldValue.serverTimestamp() });
  return { id: taskId, ...data };
}

export async function deleteTask(user: DecodedIdToken, orgId: string, campId: string, taskId: string) {
  assertCampaignManager(user, orgId, campId);
  const ref = campaignRef(orgId, campId).collection('tasks').doc(taskId);
  if (!(await ref.get()).exists) throw new NotFoundError('La tarea no existe.');
  await ref.delete();
}

type Visit = { visitUid?: string; startedAt?: Timestamp; conversion?: { decision?: string } };
type Task = { assignedTo?: string; status?: string; completedAt?: Timestamp };

function inRange(value: Timestamp | undefined, start?: Date, end?: Date) {
  const time = value?.toDate().getTime() ?? 0;
  return (!start || time >= start.getTime()) && (!end || time <= end.getTime());
}

export async function teamProductivity(user: DecodedIdToken, orgId: string, campId: string, filters: { start?: string; end?: string; teamId?: string }) {
  assertCampaignAccess(user, orgId, campId);
  const start = filters.start ? new Date(`${filters.start}T00:00:00`) : undefined;
  const end = filters.end ? new Date(`${filters.end}T23:59:59.999`) : undefined;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) throw new ValidationError('El rango de fechas no es válido.');
  const campaign = campaignRef(orgId, campId);
  const [members, visits, tasks, teams] = await Promise.all([campaign.collection('members').get(), campaign.collection('visits').get(), campaign.collection('tasks').get(), campaign.collection('teams').get()]);
  const teamNames = new Map(teams.docs.map((doc) => [doc.id, String(doc.data().name ?? 'Sin equipo')]));
  const users = await Promise.all(members.docs.map((member) => db.collection('users').doc(member.id).get()));
  const usersById = new Map(users.filter(Boolean).map((doc) => [doc!.id, doc!.data()!]));
  return members.docs.map((member) => {
    const data = member.data(); const teamId = typeof data.teamId === 'string' ? data.teamId : null;
    if (filters.teamId && teamId !== filters.teamId) return null;
    const memberVisits = visits.docs.map((doc) => doc.data() as Visit).filter((visit) => visit.visitUid === member.id && inRange(visit.startedAt, start, end));
    const decisionCount = (decision: string) => memberVisits.filter((visit) => visit.conversion?.decision === decision).length;
    const yes = decisionCount('yes'); const no = decisionCount('no'); const undecided = decisionCount('undecided');
    const profile = usersById.get(member.id);
    const completedTasks = tasks.docs.map((doc) => doc.data() as Task).filter((task) => task.assignedTo === member.id && task.status === 'completada' && inRange(task.completedAt, start, end)).length;
    return { uid: member.id, name: String(data.displayName ?? profile?.displayName ?? data.email ?? profile?.email ?? member.id), teamId, teamName: teamId ? teamNames.get(teamId) ?? 'Sin equipo' : 'Sin equipo', visits: memberVisits.length, yes, no, undecided, conversionRate: yes + no ? Math.round((yes / (yes + no)) * 100) : 0, completedTasks };
  }).filter(Boolean);
}
