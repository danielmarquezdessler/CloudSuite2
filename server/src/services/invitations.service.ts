import crypto from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, db } from '../config/firebase.js';
import { assertCampaignAdmin, campaignRef, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { sendInvitationEmail } from './email.service.js';
import { createNotification } from './notifications.service.js';

type InviteInput = { email?: string; role?: string; functionId?: string | null; teamId?: string | null; message?: string };
type MemberInput = { role?: string; functionId?: string | null; teamId?: string | null };
const secret = () => process.env.INVITATION_TOKEN_SECRET ?? process.env.PROJECT_ID ?? 'cloudsuite-local-development-secret';
const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
function signInvitation(invId: string, email: string, orgId: string) { const payload = encode({ invId, email, orgId, issuedAt: Date.now() }); return `${payload}.${crypto.createHmac('sha256', secret()).update(payload).digest('base64url')}`; }
function verifyInvitationToken(token: string) { const [payload, signature] = token.split('.'); const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url'); if (!payload || !signature || Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new ValidationError('La invitación no es válida.'); return JSON.parse(Buffer.from(payload, 'base64url').toString()) as { invId: string; email: string; orgId: string }; }
const inviteRef = (orgId: string) => db.collection('organizations').doc(orgId).collection('invitations');
async function findInvitation(orgId: string, invId: string, email: string) {
  const invitation = await inviteRef(orgId).doc(invId).get();
  if (!invitation.exists || invitation.data()?.email !== email) throw new NotFoundError('La invitación no existe.');
  return invitation;
}
export async function createInvitation(user: DecodedIdToken, orgId: string, campId: string, input: InviteInput) {
  assertCampaignAdmin(user, orgId, campId); const email = input.email?.trim().toLowerCase(); if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('Ingresá un email válido.');
  const campaign = campaignRef(orgId, campId); const existingMembers = await campaign.collection('members').where('email', '==', email).limit(1).get(); if (!existingMembers.empty) throw new ValidationError('Este email ya es miembro de la campaña.');
  const existingInvite = await inviteRef(orgId).where('campaignId', '==', campId).where('email', '==', email).where('status', '==', 'pending').limit(1).get(); if (!existingInvite.empty) throw new ValidationError('Ya existe una invitación pendiente para este email.');
  const ref = inviteRef(orgId).doc(); const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)); const role = input.role === 'admin' ? 'admin' : 'usuario';
  await ref.set({ email, senderUid: user.uid, role, functionId: input.functionId ?? null, teamId: input.teamId ?? null, campaignId: campId, status: 'pending', expiresAt, createdAt: FieldValue.serverTimestamp(), message: input.message?.trim() ?? '' });
  const [organization, campaignData] = await Promise.all([db.collection('organizations').doc(orgId).get(), campaign.get()]); const token = signInvitation(ref.id, email, orgId); const base = process.env.APP_URL ?? 'http://127.0.0.1:5173'; const emailResult = await sendInvitationEmail(email, organization.data()?.nombre ?? 'tu organización', campaignData.data()?.nombre ?? 'tu campaña', `${base}/join-invitation?token=${encodeURIComponent(token)}`, input.message);
  return { invId: ref.id, email, status: 'pending', expiresAt: expiresAt.toDate().toISOString(), ...emailResult };
}
export async function listInvitations(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAdmin(user, orgId, campId); const snap = await inviteRef(orgId).where('campaignId', '==', campId).where('status', '==', 'pending').get(); return snap.docs.map(d => ({ id: d.id, ...d.data(), expiresAt: d.data().expiresAt?.toDate?.().toISOString() })); }
export async function revokeInvitation(user: DecodedIdToken, orgId: string, campId: string, invId: string) { assertCampaignAdmin(user, orgId, campId); const ref = inviteRef(orgId).doc(invId); const doc = await ref.get(); if (!doc.exists || doc.data()?.campaignId !== campId) throw new NotFoundError('La invitación no existe.'); await ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp() }); }
export async function resendInvitation(user: DecodedIdToken, orgId: string, campId: string, invId: string) {
  assertCampaignAdmin(user, orgId, campId);
  const ref = inviteRef(orgId).doc(invId); const doc = await ref.get(); const invitation = doc.data();
  if (!doc.exists || invitation?.campaignId !== campId || invitation.status !== 'pending') throw new NotFoundError('La invitación pendiente no existe.');
  const [organization, campaign] = await Promise.all([db.collection('organizations').doc(orgId).get(), campaignRef(orgId, campId).get()]);
  const token = signInvitation(invId, String(invitation.email), orgId); const base = process.env.APP_URL ?? 'http://127.0.0.1:5173';
  const result = await sendInvitationEmail(String(invitation.email), organization.data()?.nombre ?? 'tu organización', campaign.data()?.nombre ?? 'tu campaña', `${base}/join-invitation?token=${encodeURIComponent(token)}`, invitation.message);
  await ref.update({ resentAt: FieldValue.serverTimestamp(), resendCount: FieldValue.increment(1) });
  return { invId, email: invitation.email, ...result };
}
export async function previewInvitation(token: string) { const decoded = verifyInvitationToken(token); const doc = await findInvitation(decoded.orgId, decoded.invId, decoded.email); const data = doc.data()!; if (data.status !== 'pending' || data.expiresAt.toDate() < new Date()) throw new ValidationError('La invitación expiró o ya no está disponible.'); const campaign = await campaignRef(decoded.orgId, data.campaignId).get(); const organization = await db.collection('organizations').doc(decoded.orgId).get(); return { email: data.email, organizationName: organization.data()?.nombre, campaignName: campaign.data()?.nombre, token };
}
export async function acceptInvitation(user: DecodedIdToken, token: string) { const preview = await previewInvitation(token); if (user.email?.toLowerCase() !== preview.email) throw new ForbiddenError('Iniciá sesión con el email invitado.'); const decoded = verifyInvitationToken(token); const invitationDoc = await findInvitation(decoded.orgId, decoded.invId, decoded.email); const invitation = invitationDoc.data()!; const orgId = decoded.orgId; const memberRef = campaignRef(orgId, invitation.campaignId).collection('members').doc(user.uid);
  await memberRef.set({ email: user.email, displayName: user.name ?? user.email?.split('@')[0] ?? '', role: invitation.role, functionId: invitation.functionId, teamId: invitation.teamId, joinedAt: FieldValue.serverTimestamp() });
  await db.collection('users').doc(user.uid).set({
    email: user.email ?? '', displayName: user.name ?? user.email?.split('@')[0] ?? '', orgIds: [orgId]
  }, { merge: true });
  await db.collection('organizations').doc(orgId).collection('members').doc(user.uid).set({
    role: invitation.role, createdAt: FieldValue.serverTimestamp()
  }, { merge: true });
  if (invitation.teamId) await campaignRef(orgId, invitation.campaignId).collection('teams').doc(invitation.teamId).collection('members').doc(user.uid).set({ joinedAt: FieldValue.serverTimestamp() });
  const current = (await adminAuth.getUser(user.uid)).customClaims ?? {}; const camps = { ...((current.camps as Record<string, boolean>) ?? {}), [invitation.campaignId]: true }; await adminAuth.setCustomUserClaims(user.uid, { ...current, role: current.role ?? invitation.role, orgId, camps });
  await invitationDoc.ref.update({ status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), acceptedUid: user.uid });
  await createNotification(invitation.senderUid, { type: 'member_joined', title: 'Nuevo miembro en tu campaña', message: `${user.email ?? 'Un usuario'} aceptó la invitación.`, metadata: { campId: invitation.campaignId } });
  return { orgId, campId: invitation.campaignId };
}
export async function listMembers(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAdmin(user, orgId, campId); const members = await campaignRef(orgId, campId).collection('members').get(); return members.docs.map(d => ({ uid: d.id, ...d.data() })); }
function memberData(input: MemberInput) {
  const role = input.role === 'admin' ? 'admin' : 'usuario';
  return { role, functionId: input.functionId ?? null, teamId: input.teamId ?? null };
}
async function ensureTeam(orgId: string, campId: string, teamId: string | null) {
  if (!teamId) return;
  const team = await campaignRef(orgId, campId).collection('teams').doc(teamId).get();
  if (!team.exists || team.data()?.deleted === true) throw new ValidationError('El equipo seleccionado no existe.');
}
export async function updateMember(user: DecodedIdToken, orgId: string, campId: string, memberId: string, input: MemberInput) {
  assertCampaignAdmin(user, orgId, campId);
  const campaign = campaignRef(orgId, campId); const ref = campaign.collection('members').doc(memberId); const current = await ref.get();
  if (!current.exists) throw new NotFoundError('El miembro no existe.');
  if (current.data()?.role === 'cliente') throw new ValidationError('No se puede modificar el rol del Cliente propietario.');
  const data = memberData(input); await ensureTeam(orgId, campId, data.teamId);
  const previousTeamId = typeof current.data()?.teamId === 'string' ? current.data()!.teamId : null;
  const batch = db.batch(); batch.update(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
  if (previousTeamId && previousTeamId !== data.teamId) batch.delete(campaign.collection('teams').doc(previousTeamId).collection('members').doc(memberId));
  if (data.teamId) batch.set(campaign.collection('teams').doc(data.teamId).collection('members').doc(memberId), { joinedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  const authUser = await adminAuth.getUser(memberId); const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>;
  if (claims.orgId === orgId) await adminAuth.setCustomUserClaims(memberId, { ...claims, role: data.role });
  return { uid: memberId, ...data };
}
export async function removeMember(user: DecodedIdToken, orgId: string, campId: string, memberId: string) {
  assertCampaignAdmin(user, orgId, campId);
  if (memberId === user.uid) throw new ValidationError('No podés removerte de la campaña que administrás.');
  const campaign = campaignRef(orgId, campId); const ref = campaign.collection('members').doc(memberId); const member = await ref.get();
  if (!member.exists) throw new NotFoundError('El miembro no existe.');
  if (member.data()?.role === 'cliente') throw new ValidationError('No se puede remover al Cliente propietario.');
  const teamId = typeof member.data()?.teamId === 'string' ? member.data()!.teamId : null; const batch = db.batch(); batch.delete(ref);
  if (teamId) batch.delete(campaign.collection('teams').doc(teamId).collection('members').doc(memberId));
  await batch.commit();
  const authUser = await adminAuth.getUser(memberId); const claims = { ...(authUser.customClaims ?? {}) } as Record<string, unknown>; const camps = { ...((claims.camps as Record<string, boolean> | undefined) ?? {}) };
  delete camps[campId];
  if (claims.orgId === orgId) {
    if (Object.keys(camps).length) claims.camps = camps;
    else { delete claims.camps; delete claims.orgId; delete claims.role; await db.collection('organizations').doc(orgId).collection('members').doc(memberId).delete(); }
    await adminAuth.setCustomUserClaims(memberId, claims);
  }
}
export async function removeTeamMember(user: DecodedIdToken, orgId: string, campId: string, teamId: string, memberId: string) {
  assertCampaignAdmin(user, orgId, campId);
  const campaign = campaignRef(orgId, campId); const ref = campaign.collection('members').doc(memberId); const member = await ref.get();
  if (!member.exists) throw new NotFoundError('El miembro no existe.');
  if (member.data()?.teamId !== teamId) throw new ValidationError('El miembro no pertenece a este equipo.');
  await db.runTransaction(async transaction => { transaction.update(ref, { teamId: null, updatedAt: FieldValue.serverTimestamp() }); transaction.delete(campaign.collection('teams').doc(teamId).collection('members').doc(memberId)); });
}
