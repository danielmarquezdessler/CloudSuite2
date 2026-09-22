import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'node:crypto';
import { assertCampaignAccess, assertCampaignManager, campaignRef, ConflictError, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { db, storage } from '../config/firebase.js';
import { createNotification } from './notifications.service.js';

type Input = Record<string, unknown>;
type Participant = { uid: string; required: boolean; status: 'pending' | 'confirmed' | 'declined' };
type CalendarEvent = Record<string, unknown> & { id: string; startAt: string; endAt: string; participants: Participant[]; resourceIds: string[]; revision: number; status: string };

const eventStatuses = new Set(['draft', 'confirmed', 'cancelled', 'completed']);
const calendars = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('calendar');
const resources = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('calendarResources');
const templates = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('calendarTemplates');
const tasks = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('tasks');
const idempotency = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('calendarIdempotency');
const eventTypes = (orgId: string, campId: string) => campaignRef(orgId, campId).collection('calendarEventTypes');
const defaultEventTypes = [
  ['campaign-launch', 'Lanzamiento de campaña'],
  ['political-rally', 'Actos políticos y mítines'],
  ['territorial-walk', 'Caminatas y recorridas territoriales (Timbreos)'],
  ['electoral-debate', 'Debates electorales'],
  ['press-conference', 'Conferencias de prensa'],
  ['media-interview', 'Entrevistas en medios de comunicación'],
  ['fundraising-event', 'Eventos de recaudación de fondos'],
  ['community-leaders', 'Reuniones con líderes comunitarios, sindicales o empresariales'],
  ['institution-visit', 'Visitas a instituciones, fábricas u ONGs'],
  ['strategy-meeting', 'Reuniones de estrategia con el equipo o comité de campaña'],
  ['volunteer-training', 'Capacitación de voluntarios y fiscales de mesa'],
  ['spot-recording', 'Grabación de spots publicitarios y sesiones de fotos'],
  ['outreach-table', 'Mesas de difusión y entrega de volantes'],
  ['campaign-closing', 'Actos de cierre de campaña'],
  ['election-day', 'Día de la elección (Votación del candidato y vigilia en el búnker)'],
  ['other', 'Otros']
] as const;
const legacyEventTypes = [
  ['event', 'Evento'], ['election', 'Elección'], ['veda', 'Veda'], ['meeting', 'Reunión'], ['territory', 'Territorio'], ['training', 'Capacitación'], ['communication', 'Comunicación'], ['legal', 'Jurídico'], ['fundraising', 'Recaudación']
] as const;
const defaultEventTypeValues = new Set<string>(defaultEventTypes.map(([value]) => value));
const legacyEventTypeLabels = new Map<string, string>(legacyEventTypes);
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const eventType = (value: unknown, fallback = 'event') => text(value, 80) || fallback;
const list = (value: unknown) => Array.isArray(value) ? value : [];
const ids = (value: unknown, max = 100) => Array.from(new Set(list(value).map((item) => text(item, 128)).filter(Boolean))).slice(0, max);
const iso = (value: unknown, label: string) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} debe tener una fecha y hora válidas.`);
  return new Date(parsed).toISOString();
};
const dateForLegacy = (date: string) => date.slice(0, 10);
const serialized = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });
const overlap = (startA: string, endA: string, startB: string, endB: string) => Date.parse(startA) < Date.parse(endB) && Date.parse(endA) > Date.parse(startB);
const displayName = (member: Input) => text(member.displayName, 180) || [text(member.firstName, 90), text(member.lastName, 90)].filter(Boolean).join(' ') || text(member.email, 180) || 'Miembro';

function normalizeLegacy(document: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): CalendarEvent {
  const raw = document.data() as Input;
  const legacyDate = text(raw.date) || new Date().toISOString().slice(0, 10);
  const startAt = text(raw.startAt) || `${legacyDate}T09:00:00.000Z`;
  const endAt = text(raw.endAt) || `${legacyDate}T10:00:00.000Z`;
  return {
    id: document.id,
    ...raw,
    type: eventType(raw.type),
    status: eventStatuses.has(text(raw.status)) ? text(raw.status) : 'confirmed',
    startAt,
    endAt,
    allDay: raw.allDay === true,
    timezone: text(raw.timezone, 80) || 'America/Argentina/Buenos_Aires',
    participants: list(raw.participants).map((item) => {
      const value = item as Input;
      return { uid: text(value.uid, 128), required: value.required !== false, status: ['pending', 'confirmed', 'declined'].includes(text(value.status)) ? text(value.status) as Participant['status'] : 'pending' };
    }).filter((participant) => participant.uid),
    resourceIds: ids(raw.resourceIds),
    teamIds: ids(raw.teamIds),
    labels: ids(raw.labels, 20),
    linkedUserIds: ids(raw.linkedUserIds),
    attachments: list(raw.attachments).slice(0, 30),
    description: text(raw.description, 5000),
    preparationMinutes: Math.max(0, Number(raw.preparationMinutes) || 0),
    teardownMinutes: Math.max(0, Number(raw.teardownMinutes) || 0),
    revision: Number(raw.revision ?? 1),
    date: legacyDate
  };
}

async function assertMembers(orgId: string, campId: string, participantIds: string[]) {
  if (!participantIds.length) return;
  const campaign = campaignRef(orgId, campId);
  const snapshots = await db.getAll(...participantIds.map((uid) => campaign.collection('members').doc(uid)));
  if (snapshots.some((snapshot) => !snapshot.exists)) throw new ValidationError('Una persona seleccionada no pertenece a la campaña.');
}

function cleanParticipants(value: unknown, optionalIds: unknown): Participant[] {
  const explicit = list(value).map((item) => {
    const raw = item as Input;
    return { uid: text(raw.uid, 128), required: raw.required !== false, status: ['pending', 'confirmed', 'declined'].includes(text(raw.status)) ? text(raw.status) as Participant['status'] : 'pending' };
  }).filter((participant) => participant.uid);
  const optional = new Set(ids(optionalIds));
  return Array.from(new Map(explicit.concat(ids(value).map((uid) => ({ uid, required: !optional.has(uid), status: 'pending' as const }))).map((participant) => [participant.uid, { ...participant, required: optional.has(participant.uid) ? false : participant.required }])).values());
}

function cleanRunOfShow(value: unknown) {
  return list(value).slice(0, 80).map((item, index) => {
    const raw = item as Input;
    return { id: text(raw.id, 100) || `step-${index + 1}`, at: text(raw.at, 40), title: text(raw.title, 300), ownerId: text(raw.ownerId, 128), status: ['pending', 'ready', 'done'].includes(text(raw.status)) ? text(raw.status) : 'pending' };
  }).filter((step) => step.title);
}

function cleanEvent(input: Input, current?: CalendarEvent) {
  const allDay = input.allDay === undefined ? current?.allDay === true : input.allDay === true;
  const startSource = input.startAt ?? (allDay ? `${text(input.startDate) || dateForLegacy(current?.startAt ?? '')}T00:00:00.000Z` : current?.startAt ?? input.date);
  const endSource = input.endAt ?? (allDay ? `${text(input.endDate) || dateForLegacy(current?.endAt ?? '')}T00:00:00.000Z` : current?.endAt ?? input.date);
  const startAt = iso(startSource, 'El inicio');
  const endAt = iso(endSource, 'El fin');
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new ValidationError('El fin debe ser posterior al inicio.');
  const type = eventType(input.type, eventType(current?.type));
  const status = text(input.status) || String(current?.status ?? 'confirmed');
  if (!eventStatuses.has(status)) throw new ValidationError('El estado del evento no es válido.');
  const participants = input.participants === undefined && input.participantIds === undefined && input.optionalParticipantIds === undefined ? current?.participants ?? [] : cleanParticipants(input.participants ?? input.participantIds, input.optionalParticipantIds);
  const resourceIds = input.resourceIds === undefined ? current?.resourceIds ?? [] : ids(input.resourceIds, 40);
  const locationRaw = input.location && typeof input.location === 'object' ? input.location as Input : (current?.location as Input | undefined) ?? {};
  const isPublication = input.isPublication === undefined ? current?.isPublication === true : input.isPublication === true;
  const linkedUserIds = input.linkedUserIds === undefined ? ids(current?.linkedUserIds) : ids(input.linkedUserIds);
  const allowLinkedEditing = input.allowLinkedEditing === undefined ? current?.allowLinkedEditing === true : input.allowLinkedEditing === true;
  return {
    title: text(input.title ?? current?.title, 300) || (() => { throw new ValidationError('El título es obligatorio.'); })(),
    description: text(input.description ?? current?.description, 5000),
    type,
    status,
    startAt,
    endAt,
    date: dateForLegacy(startAt),
    allDay,
    timezone: text(input.timezone ?? current?.timezone, 80) || 'America/Argentina/Buenos_Aires',
    visibility: ['campaign', 'team', 'private'].includes(text(input.visibility ?? current?.visibility)) ? text(input.visibility ?? current?.visibility) : 'campaign',
    priority: ['low', 'medium', 'high', 'critical'].includes(text(input.priority ?? current?.priority)) ? text(input.priority ?? current?.priority) : 'medium',
    teamIds: input.teamIds === undefined ? ids(current?.teamIds) : ids(input.teamIds),
    labels: input.labels === undefined ? ids(current?.labels, 20) : ids(input.labels, 20),
    participants,
    resourceIds,
    location: { label: text(locationRaw.label, 300), address: text(locationRaw.address, 500), mode: ['physical', 'virtual', 'hybrid'].includes(text(locationRaw.mode)) ? text(locationRaw.mode) : 'physical', lat: typeof locationRaw.lat === 'number' ? locationRaw.lat : null, lng: typeof locationRaw.lng === 'number' ? locationRaw.lng : null },
    preparationMinutes: Math.max(0, Math.min(1440, Number(input.preparationMinutes ?? current?.preparationMinutes ?? 0) || 0)),
    teardownMinutes: Math.max(0, Math.min(1440, Number(input.teardownMinutes ?? current?.teardownMinutes ?? 0) || 0)),
    runOfShow: input.runOfShow === undefined ? cleanRunOfShow(current?.runOfShow) : cleanRunOfShow(input.runOfShow),
    reminders: input.reminders === undefined ? list(current?.reminders).slice(0, 10) : list(input.reminders).slice(0, 10),
    isPublication,
    linkedUserIds: isPublication ? linkedUserIds : [],
    allowLinkedEditing: isPublication && allowLinkedEditing,
    attachments: input.attachments === undefined ? list(current?.attachments).slice(0, 30) : list(input.attachments).slice(0, 30)
  };
}

function publicationEditable(user: DecodedIdToken, event: CalendarEvent) {
  if (!event.isPublication) return true;
  if (user.role === 'cliente' || user.role === 'admin') return true;
  return event.allowLinkedEditing === true && ids(event.linkedUserIds).includes(user.uid);
}

async function assertEventEditable(user: DecodedIdToken, orgId: string, campId: string, event: CalendarEvent) {
  assertCampaignAccess(user, orgId, campId);
  if (!publicationEditable(user, event)) throw new ForbiddenError('No tenés permiso para editar esta publicación.');
}

async function syncPublicationTask(orgId: string, campId: string, eventId: string, event: CalendarEvent) {
  const ref = tasks(orgId, campId).doc(`calendar-publication-${eventId}`);
  if (!event.isPublication) return ref;
  const existing = await ref.get();
  const linkedUserIds = ids(event.linkedUserIds);
  await ref.set({
    title: String(event.title), description: String(event.description ?? ''), assignedTo: linkedUserIds[0] || String(event.createdBy ?? ''),
    linkedUserIds, dueDate: String(event.startAt).slice(0, 10), status: event.status === 'completed' ? 'completada' : event.status === 'cancelled' ? 'pendiente' : 'pendiente',
    priority: String(event.priority ?? 'medium') === 'critical' ? 'alta' : String(event.priority ?? 'media'), teamId: null,
    source: 'calendar_publication', sourceEventId: eventId, sourceEventPath: `/planning/calendar?event=${encodeURIComponent(eventId)}`,
    archived: false,
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp(), assignedBy: String(event.createdBy ?? '') }),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return ref;
}

async function notifyPublicationLinkedUsers(user: DecodedIdToken, orgId: string, campId: string, eventId: string, title: string, linkedUserIds: string[]) {
  await Promise.all(
    ids(linkedUserIds)
      .filter((uid) => uid !== user.uid)
      .map((uid) =>
        createNotification(uid, {
          type: 'calendar_publication_assigned',
          title: 'Nueva publicación asignada',
          message: title,
          metadata: {
            path: `/planning/calendar?event=${encodeURIComponent(eventId)}`,
            orgId,
            campId,
            eventId
          }
        }),
      ),
  );
}

async function archivePublicationTask(orgId: string, campId: string, eventId: string, user: DecodedIdToken) {
  await tasks(orgId, campId).doc(`calendar-publication-${eventId}`).set({ archived: true, archivedAt: FieldValue.serverTimestamp(), archivedBy: user.uid, source: 'calendar_publication', sourceEventId: eventId }, { merge: true });
}

const eventTypeRef = (orgId: string, campId: string, value: string) => eventTypes(orgId, campId).doc(createHash('sha256').update(value.toLocaleLowerCase()).digest('hex').slice(0, 32));

/**
 * Keeps the campaign catalogue on the new campaign-oriented defaults without
 * invalidating an event that still uses one of the former generic values.
 */
async function ensureEventTypeCatalog(orgId: string, campId: string) {
  const [eventsSnapshot, typesSnapshot] = await Promise.all([calendars(orgId, campId).get(), eventTypes(orgId, campId).get()]);
  const legacyInUse = new Set<string>();
  eventsSnapshot.docs.forEach((document) => {
    const value = text(document.data().type, 80) || 'event';
    if (legacyEventTypeLabels.has(value)) legacyInUse.add(value);
  });

  const stored = new Map(typesSnapshot.docs.map((document) => [text(document.data().value, 80), document]));
  const batch = db.batch();
  let writes = 0;
  defaultEventTypes.forEach(([value, label]) => {
    const existing = stored.get(value);
    if (!existing || text(existing.data().label, 80) !== label || existing.data().system !== true) {
      const ref = eventTypeRef(orgId, campId, value);
      batch.set(ref, { value, label, system: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writes += 1;
    }
  });
  legacyEventTypes.forEach(([value, label]) => {
    const existing = stored.get(value);
    if (legacyInUse.has(value) && !existing) {
      batch.set(eventTypeRef(orgId, campId, value), { value, label, legacy: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    }
    if (!legacyInUse.has(value) && existing) {
      batch.delete(existing.ref);
      writes += 1;
    }
  });
  if (writes) await batch.commit();
  return legacyInUse;
}

const publicationManager = (user: DecodedIdToken) => user.role === 'cliente' || user.role === 'admin';

function preservePublicationAccessForLinkedUser(user: DecodedIdToken, current: CalendarEvent, input: Input): Input {
  if (!current.isPublication || publicationManager(user)) return input;
  return {
    ...input,
    isPublication: true,
    linkedUserIds: ids(current.linkedUserIds),
    allowLinkedEditing: current.allowLinkedEditing === true
  };
}

async function rememberEventType(orgId: string, campId: string, type: string, user: DecodedIdToken) {
  if (defaultEventTypeValues.has(type)) return;
  const ref = eventTypeRef(orgId, campId, type);
  await ref.set({ value: type, label: type, createdBy: user.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function listEventTypes(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const legacyInUse = await ensureEventTypeCatalog(orgId, campId);
  const custom = await eventTypes(orgId, campId).get();
  const options = new Map<string, { value: string; label: string }>(defaultEventTypes.map(([value, label]) => [value, { value, label }]));
  custom.docs.forEach((document) => {
    const value = text(document.data().value, 80);
    if (!value || (legacyEventTypeLabels.has(value) && !legacyInUse.has(value))) return;
    options.set(value, { value, label: text(document.data().label, 80) || legacyEventTypeLabels.get(value) || value });
  });
  return [...options.values()];
}

export async function createEventType(user: DecodedIdToken, orgId: string, campId: string, input: Input) {
  assertCampaignAccess(user, orgId, campId);
  const label = text(input.label, 80);
  if (!label) throw new ValidationError('El tipo necesita un nombre.');
  const existingDefault = defaultEventTypes.find(([, defaultLabel]) => defaultLabel.localeCompare(label, 'es', { sensitivity: 'accent' }) === 0);
  if (existingDefault) return { value: existingDefault[0], label: existingDefault[1] };
  const catalog = await listEventTypes(user, orgId, campId);
  const existing = catalog.find((option) => option.label.localeCompare(label, 'es', { sensitivity: 'accent' }) === 0 || option.value.localeCompare(label, 'es', { sensitivity: 'accent' }) === 0);
  if (existing) return existing;
  await rememberEventType(orgId, campId, label, user);
  return { value: label, label };
}

async function conflictsFor(orgId: string, campId: string, candidate: { id?: string; startAt: string; endAt: string; participants: Participant[]; resourceIds: string[] }) {
  const events = (await calendars(orgId, campId).get()).docs.map(normalizeLegacy).filter((event) => event.id !== candidate.id && event.status !== 'cancelled' && !event.deleted);
  const personIds = new Set(candidate.participants.map((participant) => participant.uid));
  return events.filter((event) => overlap(candidate.startAt, candidate.endAt, event.startAt, event.endAt) && (event.participants.some((participant) => personIds.has(participant.uid)) || event.resourceIds.some((resourceId) => candidate.resourceIds.includes(resourceId)))).map((event) => ({ eventId: event.id, title: String(event.title), startAt: event.startAt, endAt: event.endAt, participantIds: event.participants.filter((participant) => personIds.has(participant.uid)).map((participant) => participant.uid), resourceIds: event.resourceIds.filter((resourceId) => candidate.resourceIds.includes(resourceId)) }));
}

async function reserveResources(orgId: string, campId: string, eventId: string, resourceIds: string[], startAt: string, endAt: string, status: string) {
  if (!resourceIds.length) return;
  const refs = resourceIds.map((resourceId) => resources(orgId, campId).doc(resourceId));
  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const unavailable: string[] = [];
    snapshots.forEach((snapshot) => {
      if (!snapshot.exists || snapshot.data()?.deleted) throw new ValidationError('Uno de los recursos seleccionados ya no existe.');
      const data = snapshot.data() ?? {};
      const active = list(data.reservations).filter((reservation) => {
        const item = reservation as Input;
        return text(item.eventId) !== eventId && text(item.status) !== 'cancelled' && overlap(startAt, endAt, text(item.startAt), text(item.endAt));
      });
      if (active.length >= Math.max(1, Number(data.quantity ?? 1))) unavailable.push(text(data.name) || snapshot.id);
      const reservation = { eventId, startAt, endAt, status };
      transaction.update(snapshot.ref, { reservations: active.concat(reservation), updatedAt: FieldValue.serverTimestamp() });
    });
    if (unavailable.length) throw new ConflictError('Hay recursos ocupados en ese horario.', { resources: unavailable });
  });
}

async function clearOldReservations(orgId: string, campId: string, eventId: string, currentResourceIds: string[]) {
  await Promise.all(currentResourceIds.map(async (resourceId) => {
    const ref = resources(orgId, campId).doc(resourceId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      transaction.update(ref, { reservations: list(snapshot.data()?.reservations).filter((reservation) => text((reservation as Input).eventId) !== eventId), updatedAt: FieldValue.serverTimestamp() });
    });
  }));
}

export async function listEvents(user: DecodedIdToken, orgId: string, campId: string): Promise<Array<CalendarEvent & { canEdit: boolean }>> {
  assertCampaignAccess(user, orgId, campId);
  const snapshot = await calendars(orgId, campId).get();
  return snapshot.docs.map(normalizeLegacy).filter((event) => !event.deleted).map((event) => ({ ...event, canEdit: publicationEditable(user, event) })).sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
}

export async function createEvent(user: DecodedIdToken, orgId: string, campId: string, input: Input) {
  assertCampaignAccess(user, orgId, campId);
  const data = cleanEvent(input);
  const key = text(input.idempotencyKey, 200);
  const payloadHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  let ref = calendars(orgId, campId).doc();
  if (key) {
    const keyId = createHash('sha256').update(`${user.uid}:createCalendarEvent:${key}`).digest('hex');
    const keyRef = idempotency(orgId, campId).doc(keyId);
    const claimed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(keyRef);
      if (existing.exists) {
        const storedHash = text(existing.data()?.payloadHash, 128);
        if (storedHash !== payloadHash) throw new ConflictError('La clave de idempotencia ya se usó con otro contenido.');
        return text(existing.data()?.eventId, 128);
      }
      const eventId = ref.id;
      transaction.create(keyRef, { eventId, payloadHash, actorId: user.uid, createdAt: FieldValue.serverTimestamp() });
      return eventId;
    });
    ref = calendars(orgId, campId).doc(claimed);
    const existingEvent = await ref.get();
    if (existingEvent.exists && !existingEvent.data()?.deleted) return { eventId: ref.id, ...normalizeLegacy(existingEvent), idempotentReplay: true };
  }
  await assertMembers(orgId, campId, data.participants.map((participant) => participant.uid));
  const conflict = await conflictsFor(orgId, campId, data);
  if (conflict.length && input.confirmConflicts !== true) throw new ConflictError('Hay conflictos de agenda. Revisalos antes de guardar.', { conflicts: conflict });
  await reserveResources(orgId, campId, ref.id, data.resourceIds, data.startAt, data.endAt, data.status);
  await ref.set({ ...data, revision: 1, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, updatedAt: FieldValue.serverTimestamp(), deleted: false });
  await rememberEventType(orgId, campId, data.type, user);
  const event = { id: ref.id, ...data, revision: 1, status: data.status, participants: data.participants, resourceIds: data.resourceIds, startAt: data.startAt, endAt: data.endAt, createdBy: user.uid } as CalendarEvent;
  const task = await syncPublicationTask(orgId, campId, ref.id, event);
  if (data.isPublication) await ref.update({ planningTaskId: task.id });
  if (data.isPublication) await notifyPublicationLinkedUsers(user, orgId, campId, ref.id, data.title, data.linkedUserIds);
  return { eventId: ref.id, ...data, revision: 1, planningTaskId: data.isPublication ? task.id : null, conflicts: conflict };
}

export async function updateEvent(user: DecodedIdToken, orgId: string, campId: string, eventId: string, input: Input) {
  const ref = calendars(orgId, campId).doc(eventId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.deleted) throw new NotFoundError('El evento no existe.');
  const current = normalizeLegacy(snapshot);
  await assertEventEditable(user, orgId, campId, current);
  const expectedRevision = input.expectedRevision === undefined ? current.revision : Number(input.expectedRevision);
  if (expectedRevision !== current.revision) throw new ConflictError('El evento fue actualizado por otra persona.', { revision: current.revision, event: current });
  const data = cleanEvent(preservePublicationAccessForLinkedUser(user, current, input), current);
  await assertMembers(orgId, campId, data.participants.map((participant) => participant.uid));
  const conflict = await conflictsFor(orgId, campId, { ...data, id: eventId });
  if (conflict.length && input.confirmConflicts !== true) throw new ConflictError('Hay conflictos de agenda. Revisalos antes de guardar.', { conflicts: conflict });
  await clearOldReservations(orgId, campId, eventId, current.resourceIds);
  await reserveResources(orgId, campId, eventId, data.resourceIds, data.startAt, data.endAt, data.status);
  const revision = current.revision + 1;
  await ref.update({ ...data, revision, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  await rememberEventType(orgId, campId, data.type, user);
  const task = await syncPublicationTask(orgId, campId, eventId, { ...current, ...data, id: eventId, revision, createdBy: current.createdBy } as CalendarEvent);
  if (data.isPublication) await ref.update({ planningTaskId: task.id });
  const previousLinkedUsers = current.isPublication ? ids(current.linkedUserIds) : [];
  const newlyLinkedUsers = data.isPublication
    ? ids(data.linkedUserIds).filter((uid) => !previousLinkedUsers.includes(uid))
    : [];
  if (newlyLinkedUsers.length) await notifyPublicationLinkedUsers(user, orgId, campId, eventId, data.title, newlyLinkedUsers);
  return { eventId, ...data, revision, planningTaskId: data.isPublication ? task.id : null, conflicts: conflict };
}

export async function deleteEvent(user: DecodedIdToken, orgId: string, campId: string, eventId: string) {
  const ref = calendars(orgId, campId).doc(eventId); const snapshot = await ref.get();
  if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const current = normalizeLegacy(snapshot); await assertEventEditable(user, orgId, campId, current);
  await clearOldReservations(orgId, campId, eventId, current.resourceIds);
  if (current.isPublication) await archivePublicationTask(orgId, campId, eventId, user);
  await ref.delete();
}

export async function cancelEvent(user: DecodedIdToken, orgId: string, campId: string, eventId: string, reason: unknown) {
  const ref = calendars(orgId, campId).doc(eventId); const snapshot = await ref.get();
  if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const current = normalizeLegacy(snapshot);
  await assertEventEditable(user, orgId, campId, current);
  await clearOldReservations(orgId, campId, eventId, current.resourceIds);
  await ref.update({ status: 'cancelled', cancellationReason: text(reason, 1000), cancelledAt: FieldValue.serverTimestamp(), cancelledBy: user.uid, revision: current.revision + 1, updatedAt: FieldValue.serverTimestamp() });
  if (current.isPublication) await syncPublicationTask(orgId, campId, eventId, { ...current, status: 'cancelled' });
  return { eventId, status: 'cancelled' };
}

export async function uploadPublicationAttachment(user: DecodedIdToken, orgId: string, campId: string, eventId: string, file?: Express.Multer.File) {
  if (!file?.buffer) throw new ValidationError('Seleccioná un archivo para adjuntar.');
  if (file.size > 15 * 1024 * 1024) throw new ValidationError('El adjunto no puede superar los 15 MB.');
  const ref = calendars(orgId, campId).doc(eventId); const snapshot = await ref.get();
  if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const event = normalizeLegacy(snapshot); if (!event.isPublication) throw new ValidationError('Los adjuntos están disponibles para eventos de Publicación.');
  await assertEventEditable(user, orgId, campId, event);
  const name = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `calendar/publications/${orgId}/${campId}/${eventId}/${Date.now()}-${randomUUID()}-${name}`; const token = randomUUID();
  await storage.bucket().file(path).save(file.buffer, { resumable: false, contentType: file.mimetype || 'application/octet-stream', metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const attachment = { id: randomUUID(), name: file.originalname, type: file.mimetype, size: file.size, storagePath: path, url: `https://firebasestorage.googleapis.com/v0/b/${storage.bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`, uploadedBy: user.uid, uploadedAt: new Date().toISOString() };
  await ref.update({ attachments: list(event.attachments).concat(attachment).slice(0, 30), updatedAt: FieldValue.serverTimestamp(), revision: event.revision + 1 });
  return attachment;
}

export async function deletePublicationAttachment(user: DecodedIdToken, orgId: string, campId: string, eventId: string, attachmentId: string) {
  const ref = calendars(orgId, campId).doc(eventId); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const event = normalizeLegacy(snapshot); if (!event.isPublication) throw new ValidationError('El evento no admite adjuntos de publicación.'); await assertEventEditable(user, orgId, campId, event);
  const attachments = list(event.attachments) as Input[]; const target = attachments.find((attachment) => text(attachment.id, 128) === attachmentId); if (!target) throw new NotFoundError('El adjunto no existe.');
  await storage.bucket().file(text(target.storagePath, 1000)).delete({ ignoreNotFound: true });
  await ref.update({ attachments: attachments.filter((attachment) => text(attachment.id, 128) !== attachmentId), updatedAt: FieldValue.serverTimestamp(), revision: event.revision + 1 });
}

export async function reschedulePreview(user: DecodedIdToken, orgId: string, campId: string, eventId: string, input: Input) {
  assertCampaignAccess(user, orgId, campId);
  const snapshot = await calendars(orgId, campId).doc(eventId).get();
  if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const current = normalizeLegacy(snapshot); const proposal = cleanEvent({ ...current, startAt: input.startAt, endAt: input.endAt }, current);
  return { eventId, current, proposal: { startAt: proposal.startAt, endAt: proposal.endAt }, conflicts: await conflictsFor(orgId, campId, { ...proposal, id: eventId }) };
}

export async function respondToEvent(user: DecodedIdToken, orgId: string, campId: string, eventId: string, status: unknown) {
  assertCampaignAccess(user, orgId, campId);
  const next = text(status); if (!['confirmed', 'declined'].includes(next)) throw new ValidationError('La respuesta no es válida.');
  const ref = calendars(orgId, campId).doc(eventId); const snapshot = await ref.get(); if (!snapshot.exists) throw new NotFoundError('El evento no existe.');
  const event = normalizeLegacy(snapshot); if (!event.participants.some((participant) => participant.uid === user.uid)) throw new ForbiddenError('No participás de este evento.');
  const participants = event.participants.map((participant) => participant.uid === user.uid ? { ...participant, status: next as Participant['status'] } : participant);
  await ref.update({ participants, updatedAt: FieldValue.serverTimestamp(), revision: event.revision + 1 });
  return { eventId, status: next };
}

export async function listAvailability(user: DecodedIdToken, orgId: string, campId: string, input: Input) {
  assertCampaignAccess(user, orgId, campId);
  const startAt = iso(input.startAt, 'El inicio'); const endAt = iso(input.endAt, 'El fin');
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new ValidationError('El rango de disponibilidad no es válido.');
  const requested = ids(input.participantIds); await assertMembers(orgId, campId, requested);
  const events = await listEvents(user, orgId, campId);
  return requested.map((uid) => ({ uid, busy: events.filter((event) => event.status !== 'cancelled' && event.participants.some((participant) => participant.uid === uid) && overlap(startAt, endAt, event.startAt, event.endAt)).map((event) => ({ id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt })), availabilityKnown: true }));
}

export async function listResources(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAccess(user, orgId, campId); return (await resources(orgId, campId).get()).docs.map(serialized).filter((resource) => !(resource as Input).deleted); }
export async function saveResource(user: DecodedIdToken, orgId: string, campId: string, resourceId: string | null, input: Input) {
  assertCampaignManager(user, orgId, campId); const name = text(input.name, 200); if (!name) throw new ValidationError('El recurso necesita un nombre.'); const ref = resourceId ? resources(orgId, campId).doc(resourceId) : resources(orgId, campId).doc();
  if (resourceId && !(await ref.get()).exists) throw new NotFoundError('El recurso no existe.'); const data = { name, type: text(input.type, 100) || 'otro', quantity: Math.max(1, Math.min(10000, Number(input.quantity) || 1)), description: text(input.description, 1000), deleted: false };
  await ref.set({ ...data, ...(resourceId ? { updatedAt: FieldValue.serverTimestamp() } : { reservations: [], createdAt: FieldValue.serverTimestamp(), createdBy: user.uid }) }, { merge: true }); return { id: ref.id, ...data };
}
export async function deleteResource(user: DecodedIdToken, orgId: string, campId: string, resourceId: string) { assertCampaignManager(user, orgId, campId); await resources(orgId, campId).doc(resourceId).update({ deleted: true, deletedAt: FieldValue.serverTimestamp() }); }

export async function listTemplates(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAccess(user, orgId, campId); return (await templates(orgId, campId).get()).docs.map(serialized).filter((template) => !(template as Input).deleted); }
export async function saveTemplate(user: DecodedIdToken, orgId: string, campId: string, templateId: string | null, input: Input) {
  assertCampaignManager(user, orgId, campId); const name = text(input.name, 200); if (!name) throw new ValidationError('La plantilla necesita un nombre.'); const ref = templateId ? templates(orgId, campId).doc(templateId) : templates(orgId, campId).doc(); const body = input.event && typeof input.event === 'object' ? input.event as Input : input;
  await ref.set({ name, event: { title: text(body.title, 300), description: text(body.description, 5000), type: eventType(body.type), durationMinutes: Math.max(15, Math.min(10080, Number(body.durationMinutes) || 60)), teamIds: ids(body.teamIds), resourceIds: ids(body.resourceIds), preparationMinutes: Math.max(0, Number(body.preparationMinutes) || 0), teardownMinutes: Math.max(0, Number(body.teardownMinutes) || 0), runOfShow: cleanRunOfShow(body.runOfShow) }, ...(templateId ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp(), createdBy: user.uid }), deleted: false }, { merge: true }); return { id: ref.id, name };
}
export async function deleteTemplate(user: DecodedIdToken, orgId: string, campId: string, templateId: string) { assertCampaignManager(user, orgId, campId); await templates(orgId, campId).doc(templateId).update({ deleted: true, deletedAt: FieldValue.serverTimestamp() }); }

export function eventIcs(event: CalendarEvent) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z'); const date = (value: string) => value.replace(/[-:.]/g, '').replace('Z', 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CloudSuite//Calendario Electoral//ES', 'BEGIN:VEVENT', `UID:${event.id}@cloudsuite`, `DTSTAMP:${stamp}`, `DTSTART:${date(event.startAt)}`, `DTEND:${date(event.endAt)}`, `SUMMARY:${String(event.title).replace(/[\\,;]/g, '\\$&')}`, `DESCRIPTION:${String(event.description ?? '').replace(/\n/g, '\\n')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
