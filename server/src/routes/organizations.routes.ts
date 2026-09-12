import { Router } from 'express';
import { bootstrapOrganizationController, getMeController, setSmartPlannerAddonController } from '../controllers/organizations.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const organizationsRouter = Router();

organizationsRouter.post('/organizations/bootstrap', requireAuth, bootstrapOrganizationController);
organizationsRouter.get('/me', requireAuth, getMeController);
organizationsRouter.put('/organizations/:orgId/addons/smart-planner', requireAuth, setSmartPlannerAddonController);
