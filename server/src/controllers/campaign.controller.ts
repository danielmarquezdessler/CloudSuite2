import { Request, Response } from 'express';
import { ForbiddenError, NotFoundError, ValidationError } from '../services/access.service.js';
import * as functions from '../services/functions.service.js';
import * as teams from '../services/teams.service.js';
import * as invitations from '../services/invitations.service.js';

const params = (request: Request) => ({ orgId: request.params.orgId, campId: request.params.campId });
const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
function fail(response: Response, error: unknown) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof ValidationError) return response.status(400).json({ message: error.message }); if (error instanceof NotFoundError) return response.status(404).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos completar la operación.' }); }
export const getFunctions = async (r: Request, s: Response) => { try { s.json(await functions.listFunctions(...ids(r))); } catch (e) { fail(s, e); } };
export const postFunction = async (r: Request, s: Response) => { try { s.status(201).json(await functions.createFunction(r.user!, ...ids(r), r.body)); } catch (e) { fail(s, e); } };
export const putFunction = async (r: Request, s: Response) => { try { s.json(await functions.updateFunction(r.user!, ...ids(r), String(r.params.funcId), r.body)); } catch (e) { fail(s, e); } };
export const removeFunction = async (r: Request, s: Response) => { try { await functions.deleteFunction(r.user!, ...ids(r), String(r.params.funcId)); s.status(204).end(); } catch (e) { fail(s, e); } };
export const getTeams = async (r: Request, s: Response) => { try { s.json(await teams.listTeams(r.user!, ...ids(r))); } catch (e) { fail(s, e); } };
export const postTeam = async (r: Request, s: Response) => { try { s.status(201).json(await teams.createTeam(r.user!, ...ids(r), r.body)); } catch (e) { fail(s, e); } };
export const putTeam = async (r: Request, s: Response) => { try { s.json(await teams.updateTeam(r.user!, ...ids(r), String(r.params.teamId), r.body)); } catch (e) { fail(s, e); } };
export const removeTeam = async (r: Request, s: Response) => { try { await teams.deleteTeam(r.user!, ...ids(r), String(r.params.teamId)); s.status(204).end(); } catch (e) { fail(s, e); } };
export const getTeamMembers = async (r: Request, s: Response) => { try { s.json(await teams.listTeamMembers(r.user!, ...ids(r), String(r.params.teamId))); } catch (e) { fail(s, e); } };
export const getMembers = async (r: Request, s: Response) => { try { s.json(await invitations.listMembers(r.user!, ...ids(r))); } catch (e) { fail(s, e); } };
export const getInvitations = async (r: Request, s: Response) => { try { s.json(await invitations.listInvitations(r.user!, ...ids(r))); } catch (e) { fail(s, e); } };
export const postInvitation = async (r: Request, s: Response) => { try { s.status(201).json(await invitations.createInvitation(r.user!, ...ids(r), r.body)); } catch (e) { fail(s, e); } };
export const removeInvitation = async (r: Request, s: Response) => { try { await invitations.revokeInvitation(r.user!, ...ids(r), String(r.params.invId)); s.status(204).end(); } catch (e) { fail(s, e); } };
export const getInvitationPreview = async (r: Request, s: Response) => { try { s.json(await invitations.previewInvitation(String(r.query.token ?? ''))); } catch (e) { fail(s, e); } };
export const acceptInvitation = async (r: Request, s: Response) => { try { s.json(await invitations.acceptInvitation(r.user!, String(r.body.token ?? ''))); } catch (e) { fail(s, e); } };
