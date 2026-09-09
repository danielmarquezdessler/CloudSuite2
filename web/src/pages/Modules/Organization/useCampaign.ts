import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authenticatedRequest } from '../../../lib/api';

export type CampaignContext = { orgId: string; campId: string; role: string };
type Me = { organization?: { id: string }; campaigns?: { id: string }[]; role?: string };

export function useCampaign() {
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<CampaignContext | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(user));

  const reload = useCallback(async () => {
    if (!user) { setCampaign(null); setError(''); setLoading(false); return; }
    setLoading(true);
    const result = await authenticatedRequest<Me>(user, '/api/me');
    if (result.error || !result.data?.organization || !result.data.campaigns?.[0]?.id) {
      setCampaign(null);
      setError(result.error?.message ?? 'No hay una campaña disponible.');
      setLoading(false);
      return;
    }
    setCampaign({ orgId: result.data.organization.id, campId: result.data.campaigns[0].id, role: result.data.role ?? '' });
    setError('');
    setLoading(false);
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);
  return { user, campaign, error, loading, reload };
}
