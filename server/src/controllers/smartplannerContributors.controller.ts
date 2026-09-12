import { Request, Response } from 'express';
import * as service from '../services/smartplannerContributors.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';
const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof NotFoundError) return response.status(404).json({ message: error.message }); if (error instanceof ValidationError || error instanceof Error) return response.status(400).json({ message: error.message }); return response.status(500).json({ message: 'No pudimos completar la operación.' }); };
export const list = async (request: Request, response: Response) => { try { response.json(await service.list(request.user!, ...ids(request))); } catch (error) { fail(response, error); } };
export const create = async (request: Request, response: Response) => { try { response.status(201).json(await service.save(request.user!, ...ids(request), null, request.body)); } catch (error) { fail(response, error); } };
export const update = async (request: Request, response: Response) => { try { response.json(await service.save(request.user!, ...ids(request), String(request.params.contributorId), request.body)); } catch (error) { fail(response, error); } };
export const remove = async (request: Request, response: Response) => { try { await service.remove(request.user!, ...ids(request), String(request.params.contributorId)); response.status(204).end(); } catch (error) { fail(response, error); } };
