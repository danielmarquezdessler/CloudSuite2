import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as controller from '../controllers/system.controller.js';

export const systemRouter = Router();
const base = '/organizations/:orgId/campaigns/:campId';
systemRouter.get(`${base}/analytics/summary`, requireAuth, controller.getSummary);
systemRouter.get(`${base}/analytics/timeline`, requireAuth, controller.getTimeline);
systemRouter.get(`${base}/analytics/heatmap`, requireAuth, controller.getHeatmap);
systemRouter.get(`${base}/audit-log`, requireAuth, controller.getAuditLog);
systemRouter.get(`${base}/question-sets/active`, requireAuth, controller.getActiveQuestionSet);
systemRouter.get(`${base}/question-sets`, requireAuth, controller.getQuestionSets);
systemRouter.post(`${base}/question-sets`, requireAuth, controller.postQuestionSet);
systemRouter.put(`${base}/question-sets/:setId`, requireAuth, controller.putQuestionSet);
systemRouter.get('/users/:uid/notifications', requireAuth, controller.getNotifications);
systemRouter.put('/users/:uid/notifications/:notificationId/read', requireAuth, controller.markNotificationRead);
systemRouter.delete('/users/:uid/notifications/:notificationId', requireAuth, controller.archiveNotification);
systemRouter.post('/notifications', requireAuth, controller.postNotification);

