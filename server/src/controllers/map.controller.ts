import { Request, Response } from 'express';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';
import * as maps from '../services/map.service.js';

const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const send = (action: (request: Request) => Promise<unknown>, status = 200) => async (request: Request, response: Response) => {
  try { response.status(status).json(await action(request)); }
  catch (error) {
    if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message });
    if (error instanceof ValidationError) return response.status(400).json({ message: error.message });
    if (error instanceof NotFoundError) return response.status(404).json({ message: error.message });
    console.error(error); return response.status(500).json({ message: 'No pudimos procesar los datos del mapa.' });
  }
};

export const getOpportunityZones = send((request) => maps.opportunityZones(request.user!, ...ids(request)));
export const postSnapshot = send((request) => maps.createSnapshot(request.user!, ...ids(request), request.body ?? {}), 201);
export const getSnapshots = send((request) => maps.listSnapshots(request.user!, ...ids(request)));
export const getSnapshot = send((request) => maps.getSnapshot(request.user!, ...ids(request), String(request.params.date)));
