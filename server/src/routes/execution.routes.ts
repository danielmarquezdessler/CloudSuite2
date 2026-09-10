import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as controller from '../controllers/execution.controller.js';

export const executionRouter = Router();
const base = '/organizations/:orgId/campaigns/:campId/execution';
const campaignBase = '/organizations/:orgId/campaigns/:campId';
executionRouter.get(`${base}/heatmap-points`, requireAuth, controller.getHeatmapPoints);
executionRouter.get(`${base}/undecided`, requireAuth, controller.getUndecided);
executionRouter.get(`${campaignBase}/tasks`, requireAuth, controller.getTasks);
executionRouter.post(`${campaignBase}/tasks`, requireAuth, controller.postTask);
executionRouter.put(`${campaignBase}/tasks/:taskId`, requireAuth, controller.putTask);
executionRouter.delete(`${campaignBase}/tasks/:taskId`, requireAuth, controller.deleteTask);
executionRouter.get(`${base}/productivity`, requireAuth, controller.getProductivity);
