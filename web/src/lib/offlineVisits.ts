import Dexie, { Table } from 'dexie';
import { User } from 'firebase/auth';
import { authenticatedRequest } from './apiClient';

export type OfflineQuestion = { id: string; text: string; type: 'text' | 'radio' | 'checkbox'; isRequired: boolean; options: Array<{ label: string; value: string }> };
export type OfflineVoter = { id: string; name: string; phone?: string; address?: string; section?: string; state: string; teamName?: string; lastVisitAt?: string };
export type VisitDraft = {
  key: string;
  campaignKey: string;
  orgId: string;
  campId: string;
  voterId: string;
  visitId: string;
  step: number;
  answers: Record<string, string | string[]>;
  notes: string;
  questions: OfflineQuestion[];
  decision?: string;
  updatedAt: number;
};
type CachedVoter = OfflineVoter & { key: string; campaignKey: string; cachedAt: number };
type QueuedVisitRequest = { id?: number; campaignKey: string; draftKey: string; path: string; method: 'POST'; body: unknown; kind: 'start' | 'feedback' | 'conversion'; createdAt: number };
export type SyncState = { online: boolean; syncing: boolean; pending: number; message?: string };

class CloudSuiteOfflineDatabase extends Dexie {
  voters!: Table<CachedVoter, string>;
  visitDrafts!: Table<VisitDraft, string>;
  visitQueue!: Table<QueuedVisitRequest, number>;

  constructor() {
    super('cloudsuite-offline');
    this.version(1).stores({
      voters: '&key, campaignKey, cachedAt',
      visitDrafts: '&key, campaignKey, updatedAt',
      visitQueue: '++id, campaignKey, draftKey, createdAt'
    });
  }
}

export const offlineDb = new CloudSuiteOfflineDatabase();
const syncEvent = 'cloudsuite:offline-sync';
let syncing: Promise<void> | null = null;

const campaignKey = (orgId: string, campId: string) => `${orgId}:${campId}`;
const draftKey = (orgId: string, campId: string, voterId: string) => `${campaignKey(orgId, campId)}:${voterId}`;
const randomId = () => globalThis.crypto?.randomUUID?.() ?? `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

function publish(state: Omit<SyncState, 'online'>) {
  window.dispatchEvent(new CustomEvent<SyncState>(syncEvent, { detail: { online: isOnline(), ...state } }));
}

export function feedbackPayload(draft: VisitDraft) {
  return {
    responses: draft.questions.map(question => ({ questionId: question.id, question: question.text, answer: draft.answers[question.id] ?? null })),
    notes: draft.notes,
    timestamp: new Date().toISOString()
  };
}

export async function cacheVoters(orgId: string, campId: string, voters: OfflineVoter[]) {
  const key = campaignKey(orgId, campId);
  const now = Date.now();
  await offlineDb.transaction('rw', offlineDb.voters, async () => {
    await offlineDb.voters.where('campaignKey').equals(key).delete();
    await offlineDb.voters.bulkPut(voters.map(voter => ({ ...voter, key: `${key}:${voter.id}`, campaignKey: key, cachedAt: now })));
  });
}

export async function cachedVoters(orgId: string, campId: string) {
  const items = await offlineDb.voters.where('campaignKey').equals(campaignKey(orgId, campId)).sortBy('name');
  return items.map(({ key: _key, campaignKey: _campaignKey, cachedAt: _cachedAt, ...voter }) => voter);
}

export async function ensureVisitDraft(orgId: string, campId: string, voterId: string, questions: OfflineQuestion[]) {
  const key = draftKey(orgId, campId, voterId);
  const existing = await offlineDb.visitDrafts.get(key);
  if (existing) return existing;
  const visitId = randomId();
  const draft: VisitDraft = { key, campaignKey: campaignKey(orgId, campId), orgId, campId, voterId, visitId, step: 0, answers: {}, notes: '', questions, updatedAt: Date.now() };
  const path = `/api/organizations/${orgId}/campaigns/${campId}/voters/${voterId}/visits`;
  await offlineDb.transaction('rw', offlineDb.visitDrafts, offlineDb.visitQueue, async () => {
    await offlineDb.visitDrafts.put(draft);
    await offlineDb.visitQueue.add({ campaignKey: draft.campaignKey, draftKey: key, path, method: 'POST', body: { visitId }, kind: 'start', createdAt: Date.now() });
  });
  return draft;
}

export async function saveVisitProgress(key: string, changes: Pick<VisitDraft, 'step' | 'answers' | 'notes' | 'questions'>) {
  await offlineDb.visitDrafts.update(key, { ...changes, updatedAt: Date.now() });
}

async function queueRequest(draft: VisitDraft, kind: QueuedVisitRequest['kind'], body: unknown) {
  const path = kind === 'start'
    ? `/api/organizations/${draft.orgId}/campaigns/${draft.campId}/voters/${draft.voterId}/visits`
    : `/api/organizations/${draft.orgId}/campaigns/${draft.campId}/voters/${draft.voterId}/visits/${draft.visitId}/${kind === 'feedback' ? 'feedback' : 'conversion'}`;
  await offlineDb.visitQueue.add({ campaignKey: draft.campaignKey, draftKey: draft.key, path, method: 'POST', body, kind, createdAt: Date.now() });
}

export async function queueFeedback(key: string) {
  const draft = await offlineDb.visitDrafts.get(key);
  if (!draft) throw new Error('No encontramos el borrador local de la visita.');
  await queueRequest(draft, 'feedback', feedbackPayload(draft));
}

export async function queueConversion(key: string, decision: string) {
  const draft = await offlineDb.visitDrafts.get(key);
  if (!draft) throw new Error('No encontramos el borrador local de la visita.');
  await offlineDb.visitDrafts.update(key, { decision, updatedAt: Date.now() });
  await queueRequest(draft, 'conversion', { decision });
}

export async function pendingVisitCount(campaign?: { orgId: string; campId: string }) {
  if (!campaign) return offlineDb.visitQueue.count();
  return offlineDb.visitQueue.where('campaignKey').equals(campaignKey(campaign.orgId, campaign.campId)).count();
}

export async function syncPendingVisits(user: User, campaign?: { orgId: string; campId: string }) {
  if (!isOnline()) { publish({ syncing: false, pending: await pendingVisitCount(campaign), message: 'Sin conexión — tu trabajo se guarda localmente.' }); return; }
  if (syncing) return syncing;
  syncing = (async () => {
    let pending = await pendingVisitCount(campaign);
    while (pending && isOnline()) {
      const request = campaign
        ? await offlineDb.visitQueue.where('campaignKey').equals(campaignKey(campaign.orgId, campaign.campId)).sortBy('createdAt').then(items => items[0])
        : await offlineDb.visitQueue.orderBy('createdAt').first();
      if (!request?.id) break;
      publish({ syncing: true, pending, message: `Sincronizando ${Math.max(1, (await pendingVisitCount(campaign)))} pendientes…` });
      const result = await authenticatedRequest(user, request.path, { method: request.method, body: JSON.stringify(request.body) });
      if (result.error) {
        publish({ syncing: false, pending, message: 'No pudimos sincronizar todavía. Reintentaremos al recuperar la conexión.' });
        return;
      }
      await offlineDb.transaction('rw', offlineDb.visitQueue, offlineDb.visitDrafts, async () => {
        await offlineDb.visitQueue.delete(request.id!);
        if (request.kind === 'conversion') await offlineDb.visitDrafts.delete(request.draftKey);
      });
      pending = await pendingVisitCount(campaign);
    }
    publish({ syncing: false, pending: 0, message: 'Todo sincronizado.' });
  })().finally(() => { syncing = null; });
  return syncing;
}

export function subscribeToSync(listener: (state: SyncState) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<SyncState>).detail);
  window.addEventListener(syncEvent, handler);
  return () => window.removeEventListener(syncEvent, handler);
}
