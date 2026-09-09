import { Request, Response } from 'express';
import { ForbiddenError } from '../services/access.service.js';
import * as execution from '../services/execution.service.js';

const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const handle = (run: (request: Request) => Promise<unknown>) => async (request: Request, response: Response) => {
  try { response.json(await run(request)); }
  catch (error) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos cargar los datos de ejecución.' }); }
};
export const getHeatmapPoints = handle((request) => execution.heatmapPoints(request.user!, ...ids(request)));
export const getUndecided = handle((request) => execution.undecidedVoters(request.user!, ...ids(request)));
