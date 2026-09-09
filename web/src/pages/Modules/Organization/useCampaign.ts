import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';

export type CampaignContext = { orgId: string; campId: string; role: string };

export function useCampaign() {
  const { user } = useAuth();
  const { organizationId, activeCampaign, role, error, loading, reload } = useActiveCampaign();
  const campaign = organizationId && activeCampaign ? { orgId: organizationId, campId: activeCampaign.id, role } : null;
  return { user, campaign, error, loading, reload };
}
