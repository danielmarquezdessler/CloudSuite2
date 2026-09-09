import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as controller from '../controllers/execution.controller.js';

export const executionRouter = Router();
const base = '/organizations/:orgId/campaigns/:campId/execution';
executionRouter.get(`${base}/heatmap-points`, requireAuth, controller.getHeatmapPoints);
executionRouter.get(`${base}/undecided`, requireAuth, controller.getUndecided);
