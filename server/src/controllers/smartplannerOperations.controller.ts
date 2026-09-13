import { Request, Response } from 'express';
import * as service from '../services/smartplannerOperations.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';

const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => response.status(error instanceof ForbiddenError ? 403 : error instanceof NotFoundError ? 404 : error instanceof ValidationError || error instanceof Error ? 400 : 500).json({ message: error instanceof Error ? error.message : 'No pudimos completar la operación.' });
export const list = async (request: Request, response: Response) => { try { response.json(await service.listOperations(request.user!, ...ids(request))); } catch (error) { fail(response, error); } };
export const save = async (request: Request, response: Response) => { try { response.status(request.params.operationId ? 200 : 201).json(await service.saveOperation(request.user!, ...ids(request), request.params.operationId ? String(request.params.operationId) : null, request.body)); } catch (error) { fail(response, error); } };
export const remove = async (request: Request, response: Response) => { try { await service.removeOperation(request.user!, ...ids(request), String(request.params.operationId)); response.status(204).end(); } catch (error) { fail(response, error); } };
export const requirements = async (request: Request, response: Response) => { try { response.json(await service.saveRequirements(request.user!, ...ids(request), String(request.params.operationId), request.body)); } catch (error) { fail(response, error); } };
export const workOrder = async (request: Request, response: Response) => { try { response.status(201).json(await service.generateWorkOrder(request.user!, ...ids(request), String(request.params.operationId))); } catch (error) { fail(response, error); } };
