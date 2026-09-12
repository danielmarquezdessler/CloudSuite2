import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

const stages = ['prospecto', 'contactado', 'comprometido', 'confirmado'];
const types = ['aportante', 'sponsor'];
const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString?.() ?? null });

async function writable(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const org = await db.collection('organizations').doc(orgId).get();
  if (org.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.');
  if (user.role === 'cliente' || user.role === 'admin') return;
  const member = await campaign(orgId, campId).collection('members').doc(user.uid).get();
  if (!['contador', 'pm'].includes(String(member.data()?.smartPlannerRole ?? 'miembro'))) throw new ForbiddenError('Solo Contador, PM o Cliente puede administrar aportantes.');
}

export async function list(user: DecodedIdToken, orgId: string, campId: string) { await writable(user, orgId, campId); return (await campaign(orgId, campId).collection('spContributors').orderBy('createdAt', 'desc').get()).docs.map(serialize); }
export async function save(user: DecodedIdToken, orgId: string, campId: string, id: string | null, input: Record<string, unknown>) {
  await writable(user, orgId, campId);
  const name = String(input.name ?? '').trim(); const type = String(input.type ?? 'aportante'); const stage = String(input.stage ?? 'prospecto');
  if (!name) throw new ValidationError('El nombre es obligatorio.'); if (!types.includes(type) || !stages.includes(stage)) throw new ValidationError('Tipo o etapa inválidos.');
  const ref = id ? campaign(orgId, campId).collection('spContributors').doc(id) : campaign(orgId, campId).collection('spContributors').doc();
  if (id && !(await ref.get()).exists) throw new NotFoundError('El aportante no existe.');
  const data = { name, type, stage, contactInfo: String(input.contactInfo ?? ''), amount: Math.max(0, Number(input.amount ?? 0)), notes: String(input.notes ?? '') };
  await ref.set({ ...data, ...(id ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true }); return { id: ref.id, ...data };
}
export async function remove(user: DecodedIdToken, orgId: string, campId: string, id: string) { await writable(user, orgId, campId); await campaign(orgId, campId).collection('spContributors').doc(id).delete(); }
