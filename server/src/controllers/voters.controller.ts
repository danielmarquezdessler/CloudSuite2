import { Request, Response } from "express";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../services/access.service.js";
import * as voters from "../services/voters.service.js";
import * as visits from "../services/visits.service.js";
import * as planning from "../services/planning.service.js";
import { appendAudit } from "../services/audit.service.js";
import { invalidateAnalytics } from "../services/analytics.service.js";
const ids = (r: Request) =>
  [String(r.params.orgId), String(r.params.campId)] as const;
const fail = (s: Response, e: unknown) => {
  if (e instanceof ForbiddenError)
    return s.status(403).json({ message: e.message });
  if (e instanceof ConflictError)
    return s.status(409).json({ message: e.message, ...e.details });
  if (e instanceof ValidationError)
    return s.status(400).json({ message: e.message });
  if (e instanceof NotFoundError)
    return s.status(404).json({ message: e.message });
  console.error(e);
  return s.status(500).json({ message: "No pudimos completar la operación." });
};
const auditMeta = (r: Request) => ({
  ipAddress: r.ip,
  userAgent: r.get("user-agent") ?? undefined,
});
export const importVoters = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const result = await voters.importVoters(
      r.user!,
      orgId,
      campId,
      r.file,
      r.body.allowNearDuplicates === "true",
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "IMPORT_VOTERS",
      resource: "voters",
      changes: { after: { ...result, filename: r.file?.originalname ?? "" } },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.status(201).json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const createVoter = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const result = await voters.createVoter(
      r.user!,
      orgId,
      campId,
      r.body ?? {},
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "CREATE_VOTER",
      resource: "voter",
      resourceId: result.id,
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.status(201).json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const updateVoter = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const result = await voters.updateVoter(
      r.user!,
      orgId,
      campId,
      String(r.params.voterId),
      r.body ?? {},
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "UPDATE_VOTER",
      resource: "voter",
      resourceId: result.id,
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const duplicateVoters = async (r: Request, s: Response) => {
  try {
    s.json(await voters.listDuplicateVoters(r.user!, ...ids(r)));
  } catch (e) {
    fail(s, e);
  }
};
export const mergeVoters = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const result = await voters.mergeVoters(
      r.user!,
      orgId,
      campId,
      String(r.body?.keepId ?? ""),
      r.body?.mergeIds,
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "MERGE_VOTERS",
      resource: "voter",
      resourceId: result.keepId,
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const profile = async (r: Request, s: Response) => {
  try {
    s.json(
      await voters.voterProfile(r.user!, ...ids(r), String(r.params.voterId)),
    );
  } catch (e) {
    fail(s, e);
  }
};
export const addNote = async (r: Request, s: Response) => {
  try {
    const result = await voters.addVoterNote(
      r.user!,
      ...ids(r),
      String(r.params.voterId),
      r.body?.text,
    );
    void appendAudit(String(r.params.orgId), String(r.params.campId), r.user!, {
      action: "ADD_VOTER_NOTE",
      resource: "voter",
      resourceId: String(r.params.voterId),
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    s.status(201).json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const getVoters = async (r: Request, s: Response) => {
  try {
    s.json(await voters.listVoters(r.user!, ...ids(r)));
  } catch (e) {
    fail(s, e);
  }
};
export const startVisit = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const voterId = String(r.params.voterId);
    const result = await visits.startVisit(
      r.user!,
      orgId,
      campId,
      voterId,
      typeof r.body?.visitId === "string" ? r.body.visitId : undefined,
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "START_VISIT",
      resource: "voter",
      resourceId: voterId,
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.status(201).json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const feedback = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const voterId = String(r.params.voterId);
    await visits.saveFeedback(
      r.user!,
      orgId,
      campId,
      voterId,
      String(r.params.visitId),
      r.body,
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "RECORD_FEEDBACK",
      resource: "voter",
      resourceId: voterId,
      changes: { after: { visitId: r.params.visitId } },
      ...auditMeta(r),
    }).catch(console.error);
    s.status(204).end();
  } catch (e) {
    fail(s, e);
  }
};
export const conversion = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const voterId = String(r.params.voterId);
    await visits.convertVisit(
      r.user!,
      orgId,
      campId,
      voterId,
      String(r.params.visitId),
      String(r.body.decision),
    );
    const completedGoals = await planning.completeReachedGoals(
      r.user!,
      orgId,
      campId,
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "RECORD_CONVERSION",
      resource: "voter",
      resourceId: voterId,
      changes: {
        after: { decision: r.body.decision, visitId: r.params.visitId },
      },
      ...auditMeta(r),
    }).catch(console.error);
    completedGoals.forEach(
      (goal) =>
        void appendAudit(orgId, campId, r.user!, {
          action: "GOAL_COMPLETED",
          resource: "goal",
          resourceId: goal.goalId,
          changes: { after: goal },
          ...auditMeta(r),
        }).catch(console.error),
    );
    invalidateAnalytics(orgId, campId);
    s.status(204).end();
  } catch (e) {
    fail(s, e);
  }
};
export const householdVisit = async (r: Request, s: Response) => {
  try {
    const [orgId, campId] = ids(r);
    const result = await visits.completeHouseholdVisit(
      r.user!,
      orgId,
      campId,
      String(r.params.householdId),
      r.body?.feedback,
      r.body?.decisions,
    );
    void appendAudit(orgId, campId, r.user!, {
      action: "COMPLETE_HOUSEHOLD_VISIT",
      resource: "household",
      resourceId: result.householdId,
      changes: { after: result },
      ...auditMeta(r),
    }).catch(console.error);
    invalidateAnalytics(orgId, campId);
    s.status(201).json(result);
  } catch (e) {
    fail(s, e);
  }
};
export const history = async (r: Request, s: Response) => {
  try {
    s.json(
      await visits.listVisits(r.user!, ...ids(r), String(r.params.voterId)),
    );
  } catch (e) {
    fail(s, e);
  }
};
