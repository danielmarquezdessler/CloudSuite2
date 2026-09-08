import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authenticatedFetch } from '../../../lib/api';

export type CampaignContext = { orgId: string; campId: string; role: string };
export function useCampaign() {
  const { user } = useAuth(); const [campaign, setCampaign] = useState<CampaignContext | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!user) return; void (async () => { try { const me = await authenticatedFetch(user, '/api/me') as { organization?: { id: string }; campaigns?: { id: string }[]; role?: string }; const campId = me.campaigns?.[0]?.id; if (!me.organization || !campId) throw new Error('No hay una campaña disponible.'); setCampaign({ orgId: me.organization.id, campId, role: me.role ?? '' }); } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos cargar la campaña.'); } })(); }, [user]);
  return { user, campaign, error };
}
