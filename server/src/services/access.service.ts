import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';

export class ForbiddenError extends Error {}
export class ValidationError extends Error {}
export class NotFoundError extends Error {}
/** A recoverable conflict that the caller may explicitly confirm. */
export class ConflictError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) { super(message); }
}

/**
 * Campaign product permissions are intentionally centralized. Until the
 * per-profile matrix ships, every member with a campaign claim can manage the
 * campaign resources available to an administrator. Flipping this policy is
 * the single future control point for the stricter gates below.
 */
export const campaignAuthorizationPolicy = {
  collaboratorsManageCampaignResources: true
} as const;

export function assertCampaignAccess(user: DecodedIdToken, orgId: string, campId: string) {
  const camps = user.camps as Record<string, boolean> | undefined;
  const allCampaigns = user.role === 'cliente' && user.allCamps === true;
  if (user.orgId !== orgId || (!allCampaigns && !camps?.[campId])) throw new ForbiddenError('No tenés acceso a esta campaña.');
}

/**
 * Read-only organization access.  Membership claims remain the normal fast
 * path; the member document is a narrow server-side fallback while a freshly
 * issued Firebase token is still propagating.  Keeping this separate from
 * administration gates makes the future visibility policy a single change.
 */
export async function assertOrganizationRead(user: DecodedIdToken, orgId: string) {
  if (user.orgId === orgId || user.role === 'admin') return;
  const member = await db.collection('organizations').doc(orgId).collection('members').doc(user.uid).get();
  if (!member.exists) throw new ForbiddenError('No tenés acceso a esta organización.');
}

export function assertCampaignAdmin(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  if (!campaignAuthorizationPolicy.collaboratorsManageCampaignResources && user.role !== 'cliente') throw new ForbiddenError('Solo el Cliente puede administrar esta campaña.');
}

export function assertCampaignManager(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  if (!campaignAuthorizationPolicy.collaboratorsManageCampaignResources && user.role !== 'cliente' && user.role !== 'admin') throw new ForbiddenError('Solo el Cliente o un admin puede importar electores.');
}

export function campaignRef(orgId: string, campId: string) {
  return db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
}
