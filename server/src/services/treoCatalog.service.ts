import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { appendAudit } from './audit.service.js';
import { campaignRef, NotFoundError, ValidationError } from './access.service.js';

export const catalogKinds = ['costCenters', 'stages', 'activities', 'paymentMethods'] as const;
export type CatalogKind = typeof catalogKinds[number];
const defaults: Record<CatalogKind, string[]> = {
  costCenters: [], stages: [], activities: [],
  paymentMethods: ['Efectivo', 'Transferencia bancaria', 'Tarjeta de débito', 'Tarjeta de crédito', 'Cheque', 'Mercado Pago']
};
const fieldByKind: Record<CatalogKind, { id: string; name: string }> = {
  costCenters: { id: 'costCenterId', name: 'costCenter' },
  stages: { id: 'stageId', name: 'stage' },
  activities: { id: 'activityId', name: 'activity' },
  paymentMethods: { id: 'paymentMethodId', name: 'paymentMethod' }
};
const label: Record<CatalogKind, string> = { costCenters: 'centro de costo', stages: 'etapa', activities: 'actividad', paymentMethods: 'medio de pago' };
const collection = (orgId: string, campaignId: string, kind: CatalogKind) => campaignRef(orgId, campaignId).collection(`treo${kind[0].toUpperCase()}${kind.slice(1)}`);
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
export const canonicalCatalogName = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR');
const serialize = (snap: FirebaseFirestore.DocumentSnapshot) => ({ id: snap.id, ...snap.data() });
const validKind = (value: string): CatalogKind => { if (!(catalogKinds as readonly string[]).includes(value)) throw new ValidationError('El catálogo no es válido.'); return value as CatalogKind; };

async function findEquivalent(orgId: string, campaignId: string, kind: CatalogKind, raw: unknown) {
  const canonicalName = canonicalCatalogName(raw); if (!canonicalName) return null;
  const rows = await collection(orgId, campaignId, kind).where('canonicalName', '==', canonicalName).limit(1).get();
  return rows.empty ? null : rows.docs[0];
}
export async function resolveCatalogValue(orgId: string, campaignId: string, kindValue: CatalogKind, raw: unknown, uid: string) {
  const kind = validKind(kindValue); const name = clean(raw); if (!name) return { id: '', name: '' };
  const existing = await findEquivalent(orgId, campaignId, kind, name); if (existing) return { id: existing.id, name: String(existing.data().name) };
  const ref = collection(orgId, campaignId, kind).doc(); const row = { orgId, campaignId, name, canonicalName: canonicalCatalogName(name), system: false, createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  await ref.set(row); return { id: ref.id, name };
}
export async function resolveCatalogInput(orgId: string, campaignId: string, kind: CatalogKind, input: any, uid: string) {
  const field = fieldByKind[kind]; const requestedId = clean(input?.[field.id]);
  if (requestedId) { const snap = await collection(orgId, campaignId, kind).doc(requestedId).get(); if (!snap.exists) throw new ValidationError(`El ${label[kind]} no pertenece a esta campaña.`); return { id: snap.id, name: String(snap.data()?.name ?? '') }; }
  return resolveCatalogValue(orgId, campaignId, kind, input?.[field.name], uid);
}
export async function listCatalog(user: DecodedIdToken, orgId: string, campaignId: string, kindValue: string) {
  const kind = validKind(kindValue); await seedCatalog(user, orgId, campaignId, kind);
  return (await collection(orgId, campaignId, kind).orderBy('name').get()).docs.map(serialize);
}
export async function createCatalog(user: DecodedIdToken, orgId: string, campaignId: string, kindValue: string, input: any) {
  const kind = validKind(kindValue); const name = clean(input.name); if (!name) throw new ValidationError(`El ${label[kind]} es obligatorio.`);
  const resolved = await resolveCatalogValue(orgId, campaignId, kind, name, user.uid); const ref = collection(orgId, campaignId, kind).doc(resolved.id); const snap = await ref.get();
  if (snap.data()?.createdBy === user.uid && !snap.data()?.system) await appendAudit(orgId, campaignId, user, { action: 'TREO_CATALOG_CREATED', resource: `treo${kind}`, resourceId: ref.id, changes: { before: null, after: { name: resolved.name, kind } } });
  return serialize(snap);
}
export async function updateCatalog(user: DecodedIdToken, orgId: string, campaignId: string, kindValue: string, id: string, input: any) {
  const kind = validKind(kindValue); const ref = collection(orgId, campaignId, kind).doc(id); const before = await ref.get(); if (!before.exists) throw new NotFoundError('El valor de catálogo no existe.');
  const name = clean(input.name); if (!name) throw new ValidationError(`El ${label[kind]} es obligatorio.`); const existing = await findEquivalent(orgId, campaignId, kind, name); if (existing && existing.id !== id) throw new ValidationError(`Ya existe un ${label[kind]} equivalente.`);
  await ref.update({ name, canonicalName: canonicalCatalogName(name), updatedAt: FieldValue.serverTimestamp() }); const after = await ref.get(); await appendAudit(orgId, campaignId, user, { action: 'TREO_CATALOG_UPDATED', resource: `treo${kind}`, resourceId: id, changes: { before: serialize(before), after: serialize(after) } }); return serialize(after);
}
async function usage(orgId: string, campaignId: string, kind: CatalogKind, id: string) {
  const campaign = campaignRef(orgId, campaignId); const target = fieldByKind[kind].id; const sources = kind === 'paymentMethods' ? [campaign.collection('financeTransactions')] : [campaign.collection('treoBudgetLines'), campaign.collection('treoProcurements'), campaign.collection('financeTransactions')];
  const rows = await Promise.all(sources.map((source) => source.where(target, '==', id).limit(1).get())); return rows.some((row) => !row.empty);
}
export async function removeCatalog(user: DecodedIdToken, orgId: string, campaignId: string, kindValue: string, id: string) {
  const kind = validKind(kindValue); const ref = collection(orgId, campaignId, kind).doc(id); const before = await ref.get(); if (!before.exists) throw new NotFoundError('El valor de catálogo no existe.'); if (await usage(orgId, campaignId, kind, id)) throw new ValidationError('No podés eliminar un valor de catálogo que está en uso. Reasigná los registros antes de eliminarlo.');
  await ref.delete(); await appendAudit(orgId, campaignId, user, { action: 'TREO_CATALOG_DELETED', resource: `treo${kind}`, resourceId: id, changes: { before: serialize(before), after: null } });
}
export async function seedCatalog(user: DecodedIdToken, orgId: string, campaignId: string, kind: CatalogKind) { for (const name of defaults[kind]) await resolveCatalogValue(orgId, campaignId, kind, name, user.uid); }
export async function migrateTreoCatalogs(user: DecodedIdToken, orgId: string, campaignId: string) {
  const campaign = campaignRef(orgId, campaignId); const [budgets, orders, transactions] = await Promise.all([campaign.collection('treoBudgetLines').get(), campaign.collection('treoProcurements').get(), campaign.collection('financeTransactions').get()]);
  const records = [{ rows: budgets.docs, fields: ['costCenters', 'stages', 'activities'] as CatalogKind[] }, { rows: orders.docs, fields: ['costCenters', 'stages', 'activities'] as CatalogKind[] }, { rows: transactions.docs, fields: ['costCenters', 'stages', 'activities', 'paymentMethods'] as CatalogKind[] }];
  const counts: Record<string, number> = { created: 0, repointed: 0 }; const resolved = new Map<string, { id: string; name: string }>();
  for (const group of records) for (const row of group.rows) for (const kind of group.fields) { const field = fieldByKind[kind]; const data = row.data(); if (data[field.id] || !clean(data[field.name])) continue; const key = `${kind}:${canonicalCatalogName(data[field.name])}`; let item = resolved.get(key); if (!item) { const had = await findEquivalent(orgId, campaignId, kind, data[field.name]); item = await resolveCatalogValue(orgId, campaignId, kind, data[field.name], user.uid); if (!had) counts.created += 1; resolved.set(key, item); } await row.ref.update({ [field.id]: item.id, [field.name]: item.name, catalogMigratedAt: FieldValue.serverTimestamp() }); counts.repointed += 1; }
  for (const kind of catalogKinds) await seedCatalog(user, orgId, campaignId, kind); if (counts.created || counts.repointed) await appendAudit(orgId, campaignId, user, { action: 'TREO_CATALOG_MIGRATED', resource: 'treoCatalogMigration', resourceId: campaignId, changes: { before: null, after: counts } }); return counts;
}
export function catalogFields(kind: CatalogKind, value: { id: string; name: string }) { const field = fieldByKind[kind]; return { [field.id]: value.id || null, [field.name]: value.name || '' }; }
