import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';

export class ForbiddenError extends Error {}
export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export function assertCampaignAccess(user: DecodedIdToken, orgId: string, campId: string) {
  const camps = user.camps as Record<string, boolean> | undefined;
  if (user.orgId !== orgId || !camps?.[campId]) throw new ForbiddenError('No tenés acceso a esta campaña.');
}

export function assertCampaignAdmin(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  if (user.role !== 'cliente') throw new ForbiddenError('Solo el Cliente puede administrar esta campaña.');
}

export function campaignRef(orgId: string, campId: string) {
  return db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
}
