import { Request, Response } from 'express';
import { ConflictError, ForbiddenError, NotFoundError, bootstrapOrganization, getCurrentUserData, setSmartPlannerEnabled } from '../services/organizations.service.js';

export async function bootstrapOrganizationController(request: Request, response: Response) {
  try {
    const result = await bootstrapOrganization(request.user!, request.body);
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof ConflictError) {
      response.status(409).json({ message: error.message });
      return;
    }
    if (error instanceof Error) {
      response.status(400).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: 'No pudimos inicializar la organización.' });
  }
}

export async function getMeController(request: Request, response: Response) {
  try {
    response.json(await getCurrentUserData(request.user!));
  } catch (error) {
    if (error instanceof NotFoundError) {
      response.status(404).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: 'No pudimos obtener el perfil.' });
  }
}

export async function setSmartPlannerAddonController(request: Request, response: Response) {
  try {
    const orgId = Array.isArray(request.params.orgId) ? request.params.orgId[0] : request.params.orgId;
    response.json(await setSmartPlannerEnabled(request.user!, orgId, request.body?.enabled));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      response.status(403).json({ message: error.message });
      return;
    }
    if (error instanceof NotFoundError) {
      response.status(404).json({ message: error.message });
      return;
    }
    if (error instanceof Error) {
      response.status(400).json({ message: error.message });
      return;
    }
    response.status(500).json({ message: 'No pudimos actualizar el add-on.' });
  }
}
