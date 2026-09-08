import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { campaignRef } from './access.service.js';

export type AuditInput = {
  action: string;
  resource: string;
  resourceId?: string;
  changes?: { before?: unknown; after?: unknown };
  ipAddress?: string;
  userAgent?: string;
};

/** Best-effort, append-only audit trail. Callers intentionally do not await it. */
export async function appendAudit(orgId: string, campId: string, user: DecodedIdToken, input: AuditInput) {
  await campaignRef(orgId, campId).collection('auditLog').doc().set({
    timestamp: FieldValue.serverTimestamp(),
    userId: user.uid,
    userEmail: user.email ?? '',
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    changes: input.changes ?? {},
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  });
}

