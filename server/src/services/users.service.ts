import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { adminAuth, db, storage } from '../config/firebase.js';
import { ForbiddenError, ValidationError, campaignRef } from './access.service.js';

export type CreateOrganizationUserInput = {
  firstName?: string; lastName?: string; phone?: string; email?: string; password?: string;
  functionId?: string | null; teamId?: string | null; campaignId?: string | null;
};
export type UpdateOrganizationUserInput = Pick<CreateOrganizationUserInput, 'firstName' | 'lastName' | 'phone'>;
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function assertOrganizationAdmin(user: DecodedIdToken, orgId: string) {
  if (user.orgId !== orgId || (user.role !== 'cliente' && user.role !== 'admin')) throw new ForbiddenError('Solo el Cliente o un administrador puede gestionar usuarios.');
}

function normalize(input: CreateOrganizationUserInput) {
  const firstName = input.firstName?.trim(); const lastName = input.lastName?.trim(); const email = input.email?.trim().toLowerCase(); const password = input.password ?? '';
  if (!firstName || !lastName) throw new ValidationError('El nombre y apellido son obligatorios.');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('Ingresá un email válido.');
  if (password.length < 6) throw new ValidationError('La contraseña debe tener al menos 6 caracteres.');
  return { firstName, lastName, displayName: `${firstName} ${lastName}`, phone: input.phone?.trim() ?? '', email, password, campaignId: input.campaignId?.trim() || null, functionId: input.functionId?.trim() || null, teamId: input.teamId?.trim() || null };
}

type AvatarReference = { storagePath: string; downloadToken: string };

function avatarDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function uploadAvatar(uid: string, avatar?: Express.Multer.File): Promise<AvatarReference | null> {
  if (!avatar) return null;
  if (!avatar.mimetype.startsWith('image/')) throw new ValidationError('La foto de perfil debe ser una imagen.');
  if (avatar.size > MAX_AVATAR_BYTES) throw new ValidationError('La imagen no puede superar los 8 MB.');
  const path = `avatars/${uid}.jpg`; const file = storage.bucket().file(path); const downloadToken = randomUUID();
  await file.save(avatar.buffer, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private,max-age=3600', metadata: { firebaseStorageDownloadTokens: downloadToken } } });
  return { storagePath: `gs://${storage.bucket().name}/${path}`, downloadToken };
}

/**
 * Firebase download tokens work with a private bucket and do not require a service-account
 * signing key, unlike V4 signed URLs when the local backend uses user ADC.
 */
async function avatarReadUrl(photoURL: unknown, existingToken: unknown) {
  if (typeof photoURL !== 'string' || !photoURL) return null;
  if (/^https?:\/\//.test(photoURL)) return { url: photoURL, downloadToken: null };
  const storageReference = /^gs:\/\/([^/]+)\/(.+)$/.exec(photoURL);
  if (!storageReference) return null;
  const [, bucketName, path] = storageReference; const bucket = storage.bucket(bucketName); const file = bucket.file(path);
  try {
    let downloadToken = typeof existingToken === 'string' && existingToken ? existingToken : '';
    if (!downloadToken) {
      const [metadata] = await file.getMetadata();
      downloadToken = String(metadata.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0];
      if (!downloadToken) {
        downloadToken = randomUUID();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
      }
    }
    return { url: avatarDownloadUrl(bucket.name, path, downloadToken), downloadToken };
  } catch (error) {
    console.warn(`No se pudo preparar la URL de descarga del avatar: ${photoURL}`, error);
    return null;
  }
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
    const avatarReference = await uploadAvatar(created.uid, avatar);
    const photoURL = avatarReference?.storagePath ?? null;
    const avatarDownloadToken = avatarReference?.downloadToken ?? null;
    const batch = db.batch(); const userRef = db.collection('users').doc(created.uid); const orgMemberRef = db.collection('organizations').doc(orgId).collection('members').doc(created.uid);
    batch.set(userRef, { email: data.email, displayName: data.displayName, firstName: data.firstName, lastName: data.lastName, phone: data.phone, photoURL, avatarDownloadToken, orgIds: [orgId], createdAt: FieldValue.serverTimestamp() });
    batch.set(orgMemberRef, { role: 'usuario', createdAt: FieldValue.serverTimestamp() });
    if (data.campaignId) {
      const memberRef = campaignRef(orgId, data.campaignId).collection('members').doc(created.uid);
      batch.set(memberRef, { email: data.email, displayName: data.displayName, role: 'usuario', functionId: data.functionId, teamId: data.teamId, joinedAt: FieldValue.serverTimestamp() });
      if (data.teamId) batch.set(campaignRef(orgId, data.campaignId).collection('teams').doc(data.teamId).collection('members').doc(created.uid), { joinedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    await adminAuth.setCustomUserClaims(created.uid, { role: 'usuario', orgId, camps: data.campaignId ? { [data.campaignId]: true } : {} });
    return { uid: created.uid, orgId, email: data.email, displayName: data.displayName, firstName: data.firstName, lastName: data.lastName, phone: data.phone, photoURL: avatarReference ? avatarDownloadUrl(storage.bucket().name, `avatars/${created.uid}.jpg`, avatarReference.downloadToken) : null, role: 'usuario', campaignId: data.campaignId, functionId: data.functionId, teamId: data.teamId };
  } catch (error) {
    await adminAuth.deleteUser(created.uid).catch(() => undefined);
    throw error;
  }
}

export async function listOrganizationUsers(user: DecodedIdToken, orgId: string) {
  assertOrganizationAdmin(user, orgId);
  const [members, users] = await Promise.all([db.collection('organizations').doc(orgId).collection('members').get(), db.collection('users').where('orgIds', 'array-contains', orgId).get()]);
  const roles = new Map(members.docs.map((member) => [member.id, member.data().role]));
  return Promise.all(users.docs.map(async (doc) => {
    const profile = doc.data(); const avatar = await avatarReadUrl(profile.photoURL, profile.avatarDownloadToken);
    if (avatar?.downloadToken && avatar.downloadToken !== profile.avatarDownloadToken) await doc.ref.update({ avatarDownloadToken: avatar.downloadToken });
    return { uid: doc.id, ...profile, photoURL: avatar?.url ?? null, role: roles.get(doc.id) ?? 'usuario' };
  }));
}

function normalizeProfile(input: UpdateOrganizationUserInput) {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  if (!firstName || !lastName) throw new ValidationError('El nombre y apellido son obligatorios.');
  return { firstName, lastName, displayName: `${firstName} ${lastName}`, phone: input.phone?.trim() ?? '' };
}

export async function updateOrganizationUser(user: DecodedIdToken, orgId: string, targetUid: string, input: UpdateOrganizationUserInput, avatar?: Express.Multer.File) {
  assertOrganizationAdmin(user, orgId);
  const profileRef = db.collection('users').doc(targetUid);
  const profile = await profileRef.get();
  if (!profile.exists || !(profile.data()?.orgIds ?? []).includes(orgId)) throw new ValidationError('El usuario no pertenece a esta organización.');

  const data = normalizeProfile(input);
  const avatarReference = avatar ? await uploadAvatar(targetUid, avatar) : null;
  const photoURL = avatarReference?.storagePath ?? profile.data()?.photoURL ?? null;
  const avatarDownloadToken = avatarReference?.downloadToken ?? profile.data()?.avatarDownloadToken ?? null;
  // El avatar se conserva como referencia gs:// en Firestore; Firebase Auth recibe solo el nombre.
  await adminAuth.updateUser(targetUid, { displayName: data.displayName });

  const campaigns = await db.collection('organizations').doc(orgId).collection('campaigns').get();
  const batch = db.batch();
  batch.update(profileRef, { ...data, photoURL, avatarDownloadToken, updatedAt: FieldValue.serverTimestamp() });
  for (const campaign of campaigns.docs) {
    const memberRef = campaign.ref.collection('members').doc(targetUid);
    const member = await memberRef.get();
    if (member.exists) batch.update(memberRef, { displayName: data.displayName, updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return { uid: targetUid, ...profile.data(), ...data, photoURL: avatarReference ? avatarDownloadUrl(storage.bucket().name, `avatars/${targetUid}.jpg`, avatarReference.downloadToken) : null };
}

export async function deleteOrganizationUser(user: DecodedIdToken, orgId: string, targetUid: string, confirmEmail: string) {
  assertOrganizationAdmin(user, orgId);
  if (targetUid === user.uid) throw new ValidationError('No podés eliminar tu propia cuenta desde esta pantalla.');
  const profileRef = db.collection('users').doc(targetUid);
  const profile = await profileRef.get();
  const profileData = profile.data();
  if (!profile.exists || !(profileData?.orgIds ?? []).includes(orgId)) throw new ValidationError('El usuario no pertenece a esta organización.');
  if (profileData?.email?.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw new ValidationError('El email de confirmación no coincide.');

  const orgIds = (profileData?.orgIds ?? []).filter((id: unknown): id is string => typeof id === 'string');
  const batch = db.batch();
  for (const relatedOrgId of orgIds) {
    const organization = db.collection('organizations').doc(relatedOrgId);
    const campaigns = await organization.collection('campaigns').get();
    for (const campaign of campaigns.docs) {
      const memberRef = campaign.ref.collection('members').doc(targetUid);
      const member = await memberRef.get();
      if (!member.exists) continue;
      const teamId = typeof member.data()?.teamId === 'string' ? member.data()!.teamId : null;
      batch.delete(memberRef);
      if (teamId) batch.delete(campaign.ref.collection('teams').doc(teamId).collection('members').doc(targetUid));
    }
    batch.delete(organization.collection('members').doc(targetUid));
  }
  batch.delete(profileRef);
  await batch.commit();
  await storage.bucket().file(`avatars/${targetUid}.jpg`).delete({ ignoreNotFound: true }).catch(() => undefined);
  await adminAuth.deleteUser(targetUid);
}
