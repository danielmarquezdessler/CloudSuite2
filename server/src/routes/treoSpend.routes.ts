import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAddon } from '../middleware/requireAddon.js';
import { ForbiddenError } from '../services/access.service.js';
import * as s from '../services/treoSpend.service.js';

export const treoSpendRouter = Router();
const base = '/organizations/:orgId/campaigns/:campId/treo/spend';
const guarded = [requireAuth, requireAddon('finance')] as const;
const ids = (request: any) => [request.user!, String(request.params.orgId), String(request.params.campId)] as const;
const run = (call: any, status = 200) => async (request: any, response: any) => { try { response.status(status).json(await call(request)); } catch (error) { response.status(error instanceof ForbiddenError ? 403 : error instanceof Error ? 400 : 500).json({ message: error instanceof Error ? error.message : 'Error Treo' }); } };

treoSpendRouter.post(`${base}/migrate`, ...guarded, run((request: any) => s.migrate(...ids(request))));
treoSpendRouter.get(`${base}/budgets`, ...guarded, run((request: any) => s.budgets(...ids(request))));
treoSpendRouter.post(`${base}/budgets`, ...guarded, run((request: any) => s.saveBudgetFull(...ids(request), request.body), 201));
treoSpendRouter.put(`${base}/budgets/:id`, ...guarded, run((request: any) => s.updateBudgetFull(...ids(request), String(request.params.id), request.body)));
treoSpendRouter.post(`${base}/budget-changes`, ...guarded, run((request: any) => s.requestBudgetChange(...ids(request), request.body), 201));
treoSpendRouter.post(`${base}/budget-changes/:id/approve`, ...guarded, run((request: any) => s.approveBudgetChange(...ids(request), String(request.params.id))));
treoSpendRouter.get(`${base}/vendors`, ...guarded, run((request: any) => s.vendors(...ids(request))));
treoSpendRouter.post(`${base}/vendors`, ...guarded, run((request: any) => s.saveVendor(...ids(request), request.body), 201));
treoSpendRouter.post(`${base}/orders`, ...guarded, run((request: any) => s.createOrderFull(...ids(request), request.body), 201));
treoSpendRouter.put(`${base}/orders/:id`, ...guarded, run((request: any) => s.updateOrder(...ids(request), String(request.params.id), request.body)));
treoSpendRouter.post(`${base}/orders/:id/receive`, ...guarded, run((request: any) => s.receive(...ids(request), String(request.params.id), request.body)));
treoSpendRouter.post(`${base}/orders/:id/recognize`, ...guarded, run((request: any) => s.recognize(...ids(request), String(request.params.id), request.body)));
treoSpendRouter.get(`${base}/queue`, ...guarded, run((request: any) => s.queue(...ids(request))));
treoSpendRouter.post(`${base}/payments`, ...guarded, run((request: any) => s.preparePayment(...ids(request), request.body), 201));
treoSpendRouter.post(`${base}/payments/:id/:action`, ...guarded, run((request: any) => s.paymentAction(...ids(request), String(request.params.id), String(request.params.action))));
treoSpendRouter.post(`${base}/advances`, ...guarded, run((request: any) => s.createAdvance(...ids(request), request.body), 201));
treoSpendRouter.post(`${base}/advances/:id/settle`, ...guarded, run((request: any) => s.settleAdvance(...ids(request), String(request.params.id), request.body)));
