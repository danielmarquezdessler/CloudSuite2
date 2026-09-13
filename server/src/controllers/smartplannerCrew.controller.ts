import { Request, Response } from 'express';
import * as service from '../services/smartplannerCrew.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';
const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => response.status(error instanceof ForbiddenError ? 403 : error instanceof NotFoundError ? 404 : error instanceof ValidationError || error instanceof Error ? 400 : 500).json({ message: error instanceof Error ? error.message : 'No pudimos completar la operación.' });
export const suggestions = async (request: Request, response: Response) => { try { response.json(await service.suggestions(request.user!, ...ids(request))); } catch (error) { fail(response, error); } };
export const assign = async (request: Request, response: Response) => { try { response.json(await service.assign(request.user!, ...ids(request), String(request.params.zoneId), String(request.body.teamId ?? ''))); } catch (error) { fail(response, error); } };
