import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAddon } from '../middleware/requireAddon.js';
import * as c from '../controllers/treoFunding.controller.js';
export const treoFundingRouter = Router(); const base = '/organizations/:orgId/campaigns/:campId/treo'; const guarded = [requireAuth, requireAddon('finance')] as const;
treoFundingRouter.get(`${base}/funding/contributors`, ...guarded, c.contributors); treoFundingRouter.post(`${base}/funding/contributors`, ...guarded, c.saveContributor); treoFundingRouter.put(`${base}/funding/contributors/:contributorId`, ...guarded, c.saveContributor);
treoFundingRouter.get(`${base}/funding/contributions`, ...guarded, c.contributions); treoFundingRouter.post(`${base}/funding/contributions`, ...guarded, c.createContribution); treoFundingRouter.post(`${base}/funding/contributions/:contributionId/:action`, ...guarded, c.contributionAction);
treoFundingRouter.post(`${base}/funding/in-kind`, ...guarded, c.createInKind); treoFundingRouter.post(`${base}/funding/in-kind/:inKindId/approve`, ...guarded, c.approveInKind);
treoFundingRouter.get(`${base}/funding/sources`, ...guarded, c.sources); treoFundingRouter.post(`${base}/funding/sources`, ...guarded, c.createSource); treoFundingRouter.post(`${base}/funding/sources/:sourceId/disburse`, ...guarded, c.disburseSource);
