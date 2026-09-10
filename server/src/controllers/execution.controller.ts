import { Request, Response } from 'express';
import { ForbiddenError } from '../services/access.service.js';
import * as execution from '../services/execution.service.js';
import * as tasks from '../services/tasksService.js';
import { NotFoundError, ValidationError } from '../services/access.service.js';

const ids = (request: Request) => [String(request.params.orgId), String(request.params.campId)] as const;
const handle = (run: (request: Request) => Promise<unknown>) => async (request: Request, response: Response) => {
  try { response.json(await run(request)); }
  catch (error) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof ValidationError) return response.status(400).json({ message: error.message }); if (error instanceof NotFoundError) return response.status(404).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos cargar los datos de ejecución.' }); }
};
export const getHeatmapPoints = handle((request) => execution.heatmapPoints(request.user!, ...ids(request)));
export const getUndecided = handle((request) => execution.undecidedVoters(request.user!, ...ids(request)));
export const getTasks = handle((request) => tasks.listTasks(request.user!, ...ids(request), { assignedTo: typeof request.query.assignedTo === 'string' ? request.query.assignedTo : undefined, status: typeof request.query.status === 'string' ? request.query.status : undefined, teamId: typeof request.query.teamId === 'string' ? request.query.teamId : undefined }));
export const postTask = async (request: Request, response: Response) => { try { response.status(201).json(await tasks.createTask(request.user!, ...ids(request), request.body)); } catch (error) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof ValidationError) return response.status(400).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos crear la tarea.' }); } };
export const putTask = async (request: Request, response: Response) => { try { response.json(await tasks.updateTask(request.user!, ...ids(request), String(request.params.taskId), request.body)); } catch (error) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof ValidationError) return response.status(400).json({ message: error.message }); if (error instanceof NotFoundError) return response.status(404).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos actualizar la tarea.' }); } };
export const deleteTask = async (request: Request, response: Response) => { try { await tasks.deleteTask(request.user!, ...ids(request), String(request.params.taskId)); response.status(204).end(); } catch (error) { if (error instanceof ForbiddenError) return response.status(403).json({ message: error.message }); if (error instanceof NotFoundError) return response.status(404).json({ message: error.message }); console.error(error); return response.status(500).json({ message: 'No pudimos borrar la tarea.' }); } };
export const getProductivity = handle((request) => tasks.teamProductivity(request.user!, ...ids(request), { start: typeof request.query.start === 'string' ? request.query.start : undefined, end: typeof request.query.end === 'string' ? request.query.end : undefined, teamId: typeof request.query.teamId === 'string' ? request.query.teamId : undefined }));
