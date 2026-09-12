import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertCampaignAccess, assertCampaignManager, campaignRef, NotFoundError, ValidationError } from './access.service.js';

type Coordinate = { lat: number; lng: number };
type Voter = { lat?: unknown; lng?: unknown; state?: unknown };
type Visit = { voterId?: unknown; startedAt?: unknown; completedAt?: unknown; conversion?: { decision?: unknown; timestamp?: unknown } };
type SnapshotPoint = Coordinate & { voterId: string; state: string };
const today = () => new Date().toISOString().slice(0, 10);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const stateFromDecision = (decision: unknown) => decision === 'yes' ? 'converted_yes' : decision === 'no' ? 'converted_no' : decision === 'undecided' ? 'undecided' : 'visited';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function millis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; }
  if (value && typeof value === 'object' && typeof (value as { _seconds?: unknown })._seconds === 'number') return Number((value as { _seconds: number })._seconds) * 1000;
  return 0;
}

function endOfDay(date: string) { return new Date(`${date}T23:59:59.999Z`).getTime(); }

function validatedDate(value: unknown) {
  const date = typeof value === 'string' && value.trim() ? value.trim() : today();
  if (!datePattern.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) throw new ValidationError('La fecha del snapshot no es válida.');
  if (date > today()) throw new ValidationError('No podés generar un snapshot futuro.');
  return date;
}

export async function opportunityZones(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const voters = await campaignRef(orgId, campId).collection('voters').get();
  const candidates = voters.docs.flatMap((doc) => {
    const data = doc.data() as Voter; const lat = number(data.lat); const lng = number(data.lng); const state = String(data.state ?? 'unvisited');
    return lat === null || lng === null || !['unvisited', 'undecided'].includes(state) ? [] : [{ lat, lng, state }];
  });
  if (!candidates.length) return [];
  const averageLat = candidates.reduce((sum, point) => sum + point.lat, 0) / candidates.length;
  const latStep = 0.0045;
  const lngStep = 0.0045 / Math.max(Math.cos(averageLat * Math.PI / 180), 0.2);
  const grid = new Map<string, { total: number; undecided: number; unvisited: number; lat: number; lng: number }>();
  candidates.forEach((point) => {
    const key = `${Math.floor(point.lat / latStep)}:${Math.floor(point.lng / lngStep)}`;
    const cell = grid.get(key) ?? { total: 0, undecided: 0, unvisited: 0, lat: 0, lng: 0 };
    cell.total += 1; cell.lat += point.lat; cell.lng += point.lng;
    if (point.state === 'undecided') cell.undecided += 1; else cell.unvisited += 1;
    grid.set(key, cell);
  });
  return [...grid.entries()].map(([id, cell]) => ({ id, lat: cell.lat / cell.total, lng: cell.lng / cell.total, radiusMeters: 250, total: cell.total, undecided: cell.undecided, unvisited: cell.unvisited, score: cell.undecided * 2 + cell.unvisited })).sort((left, right) => right.score - left.score || right.total - left.total).slice(0, 10);
}

export async function createSnapshot(user: DecodedIdToken, orgId: string, campId: string, input: { date?: unknown; rebuild?: unknown }) {
  assertCampaignManager(user, orgId, campId);
  const date = validatedDate(input.date);
  const campaign = campaignRef(orgId, campId); const ref = campaign.collection('mapSnapshots').doc(date);
  const existing = await ref.get();
  const rebuild = input.rebuild === true;
  if (existing.exists && !rebuild) return { date, created: false, pointCount: Array.isArray(existing.data()?.points) ? existing.data()!.points.length : 0 };
  const [voters, visits] = await Promise.all([campaign.collection('voters').get(), campaign.collection('visits').get()]);
  const cutoff = endOfDay(date); const visitsByVoter = new Map<string, Array<{ when: number; state: string }>>();
  visits.docs.forEach((doc) => {
    const visit = doc.data() as Visit; const voterId = typeof visit.voterId === 'string' ? visit.voterId : ''; const when = millis(visit.conversion?.timestamp) || millis(visit.completedAt) || millis(visit.startedAt);
    if (!voterId || !when || when > cutoff) return;
    const list = visitsByVoter.get(voterId) ?? []; list.push({ when, state: stateFromDecision(visit.conversion?.decision) }); visitsByVoter.set(voterId, list);
  });
  const points: SnapshotPoint[] = voters.docs.flatMap((doc) => {
    const voter = doc.data() as Voter; const lat = number(voter.lat); const lng = number(voter.lng); if (lat === null || lng === null) return [];
    const latest = (visitsByVoter.get(doc.id) ?? []).sort((left, right) => right.when - left.when)[0];
    return [{ voterId: doc.id, lat, lng, state: latest?.state ?? 'unvisited' }];
  });
  await ref.set({ date, points, pointCount: points.length, createdAt: FieldValue.serverTimestamp(), createdBy: user.uid, rebuiltAt: rebuild ? FieldValue.serverTimestamp() : null }, { merge: false });
  return { date, created: !existing.exists, rebuilt: rebuild, pointCount: points.length };
}

export async function listSnapshots(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const snapshots = await campaignRef(orgId, campId).collection('mapSnapshots').get();
  return snapshots.docs.map((doc) => ({ date: doc.id, pointCount: Number(doc.data().pointCount ?? (Array.isArray(doc.data().points) ? doc.data().points.length : 0)) })).sort((left, right) => left.date.localeCompare(right.date));
}

export async function getSnapshot(user: DecodedIdToken, orgId: string, campId: string, date: string) {
  assertCampaignAccess(user, orgId, campId);
  if (!datePattern.test(date)) throw new ValidationError('La fecha del snapshot no es válida.');
  const snapshot = await campaignRef(orgId, campId).collection('mapSnapshots').doc(date).get();
  if (!snapshot.exists) throw new NotFoundError('No existe un snapshot para esta fecha.');
  const points: unknown[] = Array.isArray(snapshot.data()?.points) ? snapshot.data()!.points : [];
  return { date, points: points.filter((point): point is SnapshotPoint => { const value = point as Partial<SnapshotPoint>; return Boolean(value) && typeof value.voterId === 'string' && number(value.lat) !== null && number(value.lng) !== null && typeof value.state === 'string'; }) };
}
