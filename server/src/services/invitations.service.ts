import crypto from 'node:crypto';
import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, db } from '../config/firebase.js';
import { assertCampaignAdmin, campaignRef, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';
import { sendInvitationEmail } from './email.service.js';
import { createNotification } from './notifications.service.js';

type InviteInput = { email?: string; role?: string; functionId?: string | null; teamId?: string | null; message?: string };
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
