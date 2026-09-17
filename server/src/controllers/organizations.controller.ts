import { Request, Response } from 'express';
import { ConflictError, ForbiddenError, NotFoundError, bootstrapOrganization, getCurrentUserData, getGlobalConfiguration, setSmartPlannerEnabled, setVoteStreamEnabled, updateGlobalConfiguration, uploadPartyLogo } from '../services/organizations.service.js';

const orgId = (request: Request) => Array.isArray(request.params.orgId) ? request.params.orgId[0] : request.params.orgId;
const fail = (response: Response, error: unknown, fallback: string) => {
  if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message });
  if (error instanceof NotFoundError) return response.status(404).json({ message: error.message });
  if (error instanceof Error) return response.status(400).json({ message: error.message });
  return response.status(500).json({ message: fallback });
};

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

export async function setVoteStreamAddonController(request: Request, response: Response) {
  try {
    const orgId = Array.isArray(request.params.orgId) ? request.params.orgId[0] : request.params.orgId;
    response.json(await setVoteStreamEnabled(request.user!, orgId, request.body?.enabled));
  } catch (error) { return fail(response, error, 'No pudimos actualizar el add-on.'); }
}

export async function getGlobalConfigurationController(request: Request, response: Response) {
  try { response.json(await getGlobalConfiguration(request.user!, orgId(request))); }
  catch (error) { fail(response, error, 'No pudimos obtener la configuración global.'); }
}

export async function updateGlobalConfigurationController(request: Request, response: Response) {
  try { response.json(await updateGlobalConfiguration(request.user!, orgId(request), request.body ?? {})); }
  catch (error) { fail(response, error, 'No pudimos guardar la configuración global.'); }
}

export async function uploadPartyLogoController(request: Request, response: Response) {
  try { response.status(201).json(await uploadPartyLogo(request.user!, orgId(request), request.file)); }
  catch (error) { fail(response, error, 'No pudimos subir el logo del partido.'); }
}
