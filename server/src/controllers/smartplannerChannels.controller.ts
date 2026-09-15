import { Request, Response } from 'express';
import * as channels from '../services/smartplannerChannels.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';
const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => {
  const status = error instanceof ForbiddenError ? 403 : error instanceof NotFoundError ? 404 : error instanceof ValidationError || error instanceof Error ? 400 : 500;
  response.status(status).json({ message: error instanceof Error ? error.message : 'No pudimos completar la operación.' });
};
export const list = async (request: Request, response: Response) => { try { response.json(await channels.listChannels(request.user!, ...ids(request))); } catch (error) { fail(response, error); } };
export const create = async (request: Request, response: Response) => { try { response.status(201).json(await channels.createChannel(request.user!, ...ids(request), request.body)); } catch (error) { fail(response, error); } };
export const messages = async (request: Request, response: Response) => { try { response.json(await channels.listMessages(request.user!, ...ids(request), String(request.params.channelId))); } catch (error) { fail(response, error); } };
export const send = async (request: Request, response: Response) => { try { response.status(201).json(await channels.sendMessage(request.user!, ...ids(request), String(request.params.channelId), request.body?.text, request.file)); } catch (error) { fail(response, error); } };
