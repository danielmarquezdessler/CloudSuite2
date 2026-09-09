import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { assertCampaignAccess, assertCampaignAdmin, campaignRef, NotFoundError, ValidationError } from './access.service.js';

type FunctionInput = { name?: string; description?: string; color?: string };
const clean = (input: FunctionInput) => {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('El nombre de la Función es obligatorio.');
  return { name, description: input.description?.trim() ?? '', color: input.color?.trim() ?? '#0060F0' };
};
const serialize = (doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot) => ({ id: doc.id, ...doc.data() });

export async function listFunctions(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const snapshot = await campaignRef(orgId, campId).collection('functions').where('deleted', '!=', true).get();
  return snapshot.docs.map(serialize);
}
export async function createFunction(user: DecodedIdToken, orgId: string, campId: string, input: FunctionInput) {
  assertCampaignAdmin(user, orgId, campId);
  const data = clean(input); const ref = campaignRef(orgId, campId).collection('functions').doc();
  await ref.set({ ...data, deleted: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { funcId: ref.id, ...data };
}
export async function updateFunction(user: DecodedIdToken, orgId: string, campId: string, funcId: string, input: FunctionInput) {
  assertCampaignAdmin(user, orgId, campId); const ref = campaignRef(orgId, campId).collection('functions').doc(funcId);
  if (!(await ref.get()).exists) throw new NotFoundError('La Función no existe.');
  const data = clean(input); await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() }); return { funcId, ...data };
}
export async function deleteFunction(user: DecodedIdToken, orgId: string, campId: string, funcId: string) {
  assertCampaignAdmin(user, orgId, campId); const ref = campaignRef(orgId, campId).collection('functions').doc(funcId);
  if (!(await ref.get()).exists) throw new NotFoundError('La Función no existe.');
  await ref.update({ deleted: true, deletedAt: FieldValue.serverTimestamp() });
}
