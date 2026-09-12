import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as controller from '../controllers/map.controller.js';

export const mapRouter = Router();
const base = '/organizations/:orgId/campaigns/:campId/mapa';
mapRouter.get(`${base}/opportunity-zones`, requireAuth, controller.getOpportunityZones);
mapRouter.post(`${base}/snapshots`, requireAuth, controller.postSnapshot);
mapRouter.get(`${base}/snapshots`, requireAuth, controller.getSnapshots);
mapRouter.get(`${base}/snapshots/:date`, requireAuth, controller.getSnapshot);
