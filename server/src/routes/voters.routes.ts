import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import * as controller from "../controllers/voters.controller.js";
import * as issues from "../controllers/issues.controller.js";
export const votersRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const base = "/organizations/:orgId/campaigns/:campId";
votersRouter.post(
  `${base}/voters/import`,
  requireAuth,
  upload.single("file"),
  controller.importVoters,
);
votersRouter.get(`${base}/voters`, requireAuth, controller.getVoters);
votersRouter.post(`${base}/voters`, requireAuth, controller.createVoter);
votersRouter.post(`${base}/voters/selection/bulk`, requireAuth, controller.bulkUpdate);
votersRouter.put(
  `${base}/voters/:voterId`,
  requireAuth,
  controller.updateVoter,
);
votersRouter.get(
  `${base}/voters/:voterId/profile`,
  requireAuth,
  controller.profile,
);
votersRouter.post(
  `${base}/voters/:voterId/notes`,
  requireAuth,
  controller.addNote,
);
votersRouter.post(
  `${base}/households/:householdId/visits`,
  requireAuth,
  controller.householdVisit,
);
votersRouter.get(
  `${base}/voters/duplicates`,
  requireAuth,
  controller.duplicateVoters,
);
votersRouter.post(`${base}/voters/merge`, requireAuth, controller.mergeVoters);
votersRouter.get(`${base}/issues/types`, requireAuth, issues.list);
votersRouter.post(`${base}/issues/types`, requireAuth, issues.create);
votersRouter.put(`${base}/issues/types/:issueId`, requireAuth, issues.update);
votersRouter.delete(
  `${base}/issues/types/:issueId`,
  requireAuth,
  issues.remove,
);
votersRouter.get(`${base}/issues/summary`, requireAuth, issues.summary);
votersRouter.post(
  `${base}/voters/:voterId/visits`,
  requireAuth,
  controller.startVisit,
);
votersRouter.post(
  `${base}/voters/:voterId/visits/:visitId/feedback`,
  requireAuth,
  controller.feedback,
);
votersRouter.post(
  `${base}/voters/:voterId/visits/:visitId/conversion`,
  requireAuth,
  controller.conversion,
);
votersRouter.get(
  `${base}/voters/:voterId/visits`,
  requireAuth,
  controller.history,
);
