import { Request, Response } from 'express';
import * as service from '../services/smartplannerProviders.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';

const identifiers = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => response.status(error instanceof ForbiddenError ? 403 : error instanceof NotFoundError ? 404 : error instanceof ValidationError || error instanceof Error ? 400 : 500).json({ message: error instanceof Error ? error.message : 'No pudimos completar la operación.' });

export const providers = async (request: Request, response: Response) => { try { response.json(await service.listProviders(request.user!, ...identifiers(request))); } catch (error) { fail(response, error); } };
export const saveProvider = async (request: Request, response: Response) => { try { response.status(request.params.providerId ? 200 : 201).json(await service.saveProvider(request.user!, ...identifiers(request), request.params.providerId ? String(request.params.providerId) : null, request.body)); } catch (error) { fail(response, error); } };
export const removeProvider = async (request: Request, response: Response) => { try { await service.removeProvider(request.user!, ...identifiers(request), String(request.params.providerId)); response.status(204).end(); } catch (error) { fail(response, error); } };
export const projects = async (request: Request, response: Response) => { try { response.json(await service.listProjects(request.user!, ...identifiers(request))); } catch (error) { fail(response, error); } };
export const saveProject = async (request: Request, response: Response) => { try { response.status(request.params.projectId ? 200 : 201).json(await service.saveProject(request.user!, ...identifiers(request), request.params.projectId ? String(request.params.projectId) : null, request.body)); } catch (error) { fail(response, error); } };
export const removeProject = async (request: Request, response: Response) => { try { await service.removeProject(request.user!, ...identifiers(request), String(request.params.projectId)); response.status(204).end(); } catch (error) { fail(response, error); } };
