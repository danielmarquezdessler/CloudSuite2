import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { bootstrapOrganizationController, getGlobalConfigurationController, getMeController, setFinanceAddonController, setSmartPlannerAddonController, setVoteStreamAddonController, updateGlobalConfigurationController, uploadPartyLogoController } from '../controllers/organizations.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const organizationsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const partyLogoUpload = (request: Request, response: Response, next: NextFunction) => upload.single('logo')(request, response, (error) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ message: 'El logo no puede superar los 5 MB.' });
  return next(error);
});

organizationsRouter.post('/organizations/bootstrap', requireAuth, bootstrapOrganizationController);
organizationsRouter.get('/me', requireAuth, getMeController);
organizationsRouter.put('/organizations/:orgId/addons/smart-planner', requireAuth, setSmartPlannerAddonController);
organizationsRouter.put('/organizations/:orgId/addons/vote-stream', requireAuth, setVoteStreamAddonController);
organizationsRouter.put('/organizations/:orgId/addons/finance', requireAuth, setFinanceAddonController);
organizationsRouter.get('/organizations/:orgId/global-configuration', requireAuth, getGlobalConfigurationController);
organizationsRouter.put('/organizations/:orgId/global-configuration', requireAuth, updateGlobalConfigurationController);
organizationsRouter.post('/organizations/:orgId/global-configuration/party-logo', requireAuth, partyLogoUpload, uploadPartyLogoController);
