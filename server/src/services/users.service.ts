import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db, storage } from '../config/firebase.js';
import { ForbiddenError, ValidationError, campaignRef } from './access.service.js';

export type CreateOrganizationUserInput = {
  firstName?: string; lastName?: string; phone?: string; email?: string; password?: string;
  functionId?: string | null; teamId?: string | null; campaignId?: string | null;
};
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function assertOrganizationAdmin(user: DecodedIdToken, orgId: string) {
  if (user.orgId !== orgId || (user.role !== 'cliente' && user.role !== 'admin')) throw new ForbiddenError('Solo el Cliente o un administrador puede crear usuarios.');
}

function normalize(input: CreateOrganizationUserInput) {
  const firstName = input.firstName?.trim(); const lastName = input.lastName?.trim(); const email = input.email?.trim().toLowerCase(); const password = input.password ?? '';
  if (!firstName || !lastName) throw new ValidationError('El nombre y apellido son obligatorios.');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('Ingresá un email válido.');
  if (password.length < 6) throw new ValidationError('La contraseña debe tener al menos 6 caracteres.');
  return { firstName, lastName, displayName: `${firstName} ${lastName}`, phone: input.phone?.trim() ?? '', email, password, campaignId: input.campaignId?.trim() || null, functionId: input.functionId?.trim() || null, teamId: input.teamId?.trim() || null };
}

async function uploadAvatar(uid: string, avatar?: Express.Multer.File) {
  if (!avatar) return null;
  if (!avatar.mimetype.startsWith('image/')) throw new ValidationError('La foto de perfil debe ser una imagen.');
  if (avatar.size > MAX_AVATAR_BYTES) throw new ValidationError('La imagen no puede superar los 8 MB.');
  const path = `avatars/${uid}.jpg`; const file = storage.bucket().file(path);
  await file.save(avatar.buffer, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'public,max-age=3600' } });
  return `gs://${storage.bucket().name}/${path}`;
}

export async function createOrganizationUser(user: DecodedIdToken, orgId: string, input: CreateOrganizationUserInput, avatar?: Express.Multer.File) {
  assertOrganizationAdmin(user, orgId);
  const data = normalize(input);
  if (data.campaignId) {
    const campaign = await campaignRef(orgId, data.campaignId).get();
    if (!campaign.exists) throw new ValidationError('La campaña seleccionada no existe.');
    if (data.functionId) {
      const fn = await campaign.ref.collection('functions').doc(data.functionId).get();
      if (!fn.exists || fn.data()?.deleted) throw new ValidationError('La función seleccionada no existe en la campaña.');
    }
    if (data.teamId) {
      const team = await campaign.ref.collection('teams').doc(data.teamId).get();
      if (!team.exists || team.data()?.deleted) throw new ValidationError('El equipo seleccionado no existe en la campaña.');
    }
  } else if (data.functionId || data.teamId) throw new ValidationError('Elegí una campaña para asignar una función o equipo.');

  const created = await adminAuth.createUser({ email: data.email, password: data.password, displayName: data.displayName });
  try {
    const photoURL = await uploadAvatar(created.uid, avatar);
    const batch = db.batch(); const userRef = db.collection('users').doc(created.uid); const orgMemberRef = db.collection('organizations').doc(orgId).collection('members').doc(created.uid);
    batch.set(userRef, { email: data.email, displayName: data.displayName, firstName: data.firstName, lastName: data.lastName, phone: data.phone, photoURL, orgIds: [orgId], createdAt: FieldValue.serverTimestamp() });
    batch.set(orgMemberRef, { role: 'usuario', createdAt: FieldValue.serverTimestamp() });
    if (data.campaignId) {
      const memberRef = campaignRef(orgId, data.campaignId).collection('members').doc(created.uid);
      batch.set(memberRef, { email: data.email, displayName: data.displayName, role: 'usuario', functionId: data.functionId, teamId: data.teamId, joinedAt: FieldValue.serverTimestamp() });
      if (data.teamId) batch.set(campaignRef(orgId, data.campaignId).collection('teams').doc(data.teamId).collection('members').doc(created.uid), { joinedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    await adminAuth.setCustomUserClaims(created.uid, { role: 'usuario', orgId, camps: data.campaignId ? { [data.campaignId]: true } : {} });
    return { uid: created.uid, orgId, email: data.email, displayName: data.displayName, firstName: data.firstName, lastName: data.lastName, phone: data.phone, photoURL, role: 'usuario', campaignId: data.campaignId, functionId: data.functionId, teamId: data.teamId };
  } catch (error) {
    await adminAuth.deleteUser(created.uid).catch(() => undefined);
    throw error;
  }
}

export async function listOrganizationUsers(user: DecodedIdToken, orgId: string) {
  assertOrganizationAdmin(user, orgId);
  const [members, users] = await Promise.all([db.collection('organizations').doc(orgId).collection('members').get(), db.collection('users').where('orgIds', 'array-contains', orgId).get()]);
  const roles = new Map(members.docs.map((member) => [member.id, member.data().role]));
  return users.docs.map((doc) => ({ uid: doc.id, ...doc.data(), role: roles.get(doc.id) ?? 'usuario' }));
}
