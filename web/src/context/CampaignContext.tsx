import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { authenticatedRequest } from '../lib/api';

export type CampaignOption = { id: string; nombre: string; memberCount: number; voterCount: number };
type Me = { organization?: { id: string; nombre?: string }; campaigns?: Array<{ id: string; nombre: string }>; role?: string };
type CampaignContextValue = {
  organizationId: string | null;
  role: string;
  campaigns: CampaignOption[];
  activeCampaign: CampaignOption | null;
  activeCampaignId: string | null;
  loading: boolean;
  error: string;
  setActiveCampaignId: (campaignId: string) => void;
  createCampaign: (nombre: string) => Promise<CampaignOption>;
  reload: () => Promise<void>;
};

const CampaignContext = createContext<CampaignContextValue | undefined>(undefined);
const storageKey = (uid: string) => `cloudsuite.activeCampaign.${uid}`;

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [activeCampaignId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!user) {
      setOrganizationId(null); setRole(''); setCampaigns([]); setActiveId(null); setError(''); setLoading(false);
      return;
    }
    setLoading(true);
    const me = await authenticatedRequest<Me>(user, '/api/me');
    if (me.error || !me.data?.organization?.id || !me.data.campaigns?.length) {
      setOrganizationId(null); setRole(''); setCampaigns([]); setActiveId(null);
      setError(me.error?.message ?? 'No hay una campaña disponible.'); setLoading(false);
      return;
    }
    const orgId = me.data.organization.id;
    const details = await authenticatedRequest<CampaignOption[]>(user, `/api/organizations/${orgId}/campaigns`);
    const available = details.data?.filter((item) => me.data!.campaigns!.some((campaign) => campaign.id === item.id))
      ?? me.data.campaigns.map((campaign) => ({ ...campaign, memberCount: 0, voterCount: 0 }));
    const storedId = localStorage.getItem(storageKey(user.uid));
    const nextId = available.some((campaign) => campaign.id === activeCampaignId)
      ? activeCampaignId
      : available.some((campaign) => campaign.id === storedId)
        ? storedId
        : available[0]?.id ?? null;
    setOrganizationId(orgId); setRole(me.data.role ?? ''); setCampaigns(available); setActiveId(nextId);
    if (nextId) localStorage.setItem(storageKey(user.uid), nextId);
    setError(details.error?.message ?? ''); setLoading(false);
  }, [activeCampaignId, user]);

  useEffect(() => { void reload(); }, [reload]);

  const setActiveCampaignId = useCallback((campaignId: string) => {
    if (!campaigns.some((campaign) => campaign.id === campaignId)) return;
    setActiveId(campaignId);
    if (user) localStorage.setItem(storageKey(user.uid), campaignId);
  }, [campaigns, user]);

  const createCampaign = useCallback(async (nombre: string) => {
    if (!user || !organizationId) throw new Error('No hay una organización activa.');
    const result = await authenticatedRequest<CampaignOption>(user, `/api/organizations/${organizationId}/campaigns`, { method: 'POST', body: JSON.stringify({ nombre }) });
    if (result.error || !result.data) throw result.error ?? new Error('No pudimos crear la campaña.');
    await user.getIdToken(true);
    const created = result.data;
    setCampaigns((current) => [...current, created]);
    // The newly created campaign is not yet in the closed-over campaigns array,
    // so select it directly instead of routing through the membership guard.
    setActiveId(created.id);
    localStorage.setItem(storageKey(user.uid), created.id);
    return created;
  }, [organizationId, user]);

  const activeCampaign = useMemo(() => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null, [activeCampaignId, campaigns]);
  const value = useMemo(() => ({ organizationId, role, campaigns, activeCampaign, activeCampaignId, loading, error, setActiveCampaignId, createCampaign, reload }), [organizationId, role, campaigns, activeCampaign, activeCampaignId, loading, error, setActiveCampaignId, createCampaign, reload]);
  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useActiveCampaign() {
  const context = useContext(CampaignContext);
  if (!context) throw new Error('useActiveCampaign debe usarse dentro de CampaignProvider.');
  return context;
}
