import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { authenticatedRequest } from '../lib/api';
import { useLoadingBar } from './LoadingBarContext';

export type CampaignOption = { id: string; nombre: string; memberCount: number; voterCount: number };
export type EnabledAddons = { smartPlanner: boolean; voteStream: boolean };
type Me = { organization?: { id: string; nombre?: string; enabledAddons?: Partial<EnabledAddons> }; campaigns?: Array<{ id: string; nombre: string }>; role?: string };
type CampaignContextValue = {
  organizationId: string | null;
  role: string;
  enabledAddons: EnabledAddons;
  updateEnabledAddons: (addons: EnabledAddons) => void;
  campaigns: CampaignOption[];
  activeCampaign: CampaignOption | null;
  activeCampaignId: string | null;
  loading: boolean;
  error: string;
  setActiveCampaignId: (campaignId: string) => void;
  activateCampaign: (campaign: CampaignOption) => void;
  createCampaign: (nombre: string) => Promise<CampaignOption>;
  reload: () => Promise<void>;
};

const CampaignContext = createContext<CampaignContextValue | undefined>(undefined);
const storageKey = (uid: string) => `cloudsuite.activeCampaign.${uid}`;
const snapshotKey = (uid: string) => `cloudsuite.campaignSnapshot.${uid}`;
type CampaignSnapshot = { organizationId: string; role: string; campaigns: CampaignOption[]; enabledAddons?: EnabledAddons };
const defaultEnabledAddons: EnabledAddons = { smartPlanner: false, voteStream: false };

function storedSnapshot(uid: string): CampaignSnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(snapshotKey(uid)) ?? 'null') as CampaignSnapshot | null;
    return value?.organizationId && Array.isArray(value.campaigns) && value.campaigns.length ? value : null;
  } catch { return null; }
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { beginLoading } = useLoadingBar();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [enabledAddons, setEnabledAddonsState] = useState<EnabledAddons>(defaultEnabledAddons);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [activeCampaignId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');
  const latestReload = useRef(0);
  const activeCampaignIdRef = useRef<string | null>(null);

  useEffect(() => loading ? beginLoading() : undefined, [beginLoading, loading]);

  useEffect(() => { activeCampaignIdRef.current = activeCampaignId; }, [activeCampaignId]);

  const reload = useCallback(async () => {
    const reloadId = ++latestReload.current;
    const isCurrent = () => latestReload.current === reloadId;
    if (!user) {
      if (!isCurrent()) return;
      setOrganizationId(null); setRole(''); setEnabledAddonsState(defaultEnabledAddons); setCampaigns([]); setActiveId(null); setError(''); setLoading(false);
      return;
    }
    setLoading(true);
    const me = await authenticatedRequest<Me>(user, '/api/me');
    if (!isCurrent()) return;
    if (me.error || !me.data?.organization?.id || !me.data.campaigns?.length) {
      const cached = storedSnapshot(user.uid);
      // A local API restart or a transient network timeout must not turn a
      // previously enabled add-on into “Próximamente”. The backend remains the
      // authorization authority; this only preserves the last verified UI
      // state while the live profile is retried.
      if (cached) {
        const storedId = localStorage.getItem(storageKey(user.uid));
        const currentActiveId = activeCampaignIdRef.current;
        const nextId = cached.campaigns.some(campaign => campaign.id === currentActiveId)
          ? currentActiveId
          : cached.campaigns.some(campaign => campaign.id === storedId)
            ? storedId
            : cached.campaigns[0].id;
        setOrganizationId(cached.organizationId); setRole(cached.role); setEnabledAddonsState(cached.enabledAddons ?? defaultEnabledAddons); setCampaigns(cached.campaigns); setActiveId(nextId); setError(me.error?.message ?? 'No pudimos actualizar la campaña; se conserva el último estado verificado.'); setLoading(false);
        return;
      }
      setOrganizationId(null); setRole(''); setEnabledAddonsState(defaultEnabledAddons); setCampaigns([]); setActiveId(null);
      setError(me.error?.message ?? 'No hay una campaña disponible.'); setLoading(false);
      return;
    }
    const orgId = me.data.organization.id;
    const nextEnabledAddons: EnabledAddons = { smartPlanner: me.data.organization.enabledAddons?.smartPlanner === true, voteStream: me.data.organization.enabledAddons?.voteStream === true };
    // El acceso a add-ons depende exclusivamente de /api/me. Aplicarlo antes de
    // la consulta secundaria evita mostrar un estado de plan obsoleto mientras
    // se actualiza el detalle de campañas.
    setOrganizationId(orgId);
    setRole(me.data.role ?? '');
    setEnabledAddonsState(nextEnabledAddons);
    const details = await authenticatedRequest<CampaignOption[]>(user, `/api/organizations/${orgId}/campaigns`);
    if (!isCurrent()) return;
    const available = details.data?.filter((item) => me.data!.campaigns!.some((campaign) => campaign.id === item.id))
      ?? me.data.campaigns.map((campaign) => ({ ...campaign, memberCount: 0, voterCount: 0 }));
    const storedId = localStorage.getItem(storageKey(user.uid));
    const currentActiveId = activeCampaignIdRef.current;
    const nextId = available.some((campaign) => campaign.id === currentActiveId)
      ? currentActiveId
      : available.some((campaign) => campaign.id === storedId)
        ? storedId
        : available[0]?.id ?? null;
    setCampaigns(available); setActiveId(nextId);
    localStorage.setItem(snapshotKey(user.uid), JSON.stringify({ organizationId: orgId, role: me.data.role ?? '', campaigns: available, enabledAddons: nextEnabledAddons }));
    if (nextId) localStorage.setItem(storageKey(user.uid), nextId);
    setError(details.error?.message ?? ''); setLoading(false);
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const refreshWhenOnline = () => { void reload(); };
    window.addEventListener('online', refreshWhenOnline);
    return () => window.removeEventListener('online', refreshWhenOnline);
  }, [reload]);

  const setActiveCampaignId = useCallback((campaignId: string) => {
    if (!campaigns.some((campaign) => campaign.id === campaignId)) return;
    setActiveId(campaignId);
    if (user) localStorage.setItem(storageKey(user.uid), campaignId);
  }, [campaigns, user]);

  const activateCampaign = useCallback((campaign: CampaignOption) => {
    setCampaigns((current) => current.some((item) => item.id === campaign.id)
      ? current.map((item) => item.id === campaign.id ? { ...item, ...campaign } : item)
      : [...current, campaign]);
    setActiveId(campaign.id);
    if (user) localStorage.setItem(storageKey(user.uid), campaign.id);
  }, [user]);

  const updateEnabledAddons = useCallback((addons: EnabledAddons) => {
    setEnabledAddonsState(addons);
    if (user && organizationId) {
      const snapshot = storedSnapshot(user.uid);
      if (snapshot) localStorage.setItem(snapshotKey(user.uid), JSON.stringify({ ...snapshot, enabledAddons: addons }));
    }
  }, [organizationId, user]);

  const createCampaign = useCallback(async (nombre: string) => {
    if (!user || !organizationId) throw new Error('No hay una organización activa.');
    const result = await authenticatedRequest<CampaignOption>(user, `/api/organizations/${organizationId}/campaigns`, { method: 'POST', body: JSON.stringify({ nombre }) });
    if (result.error || !result.data) throw result.error ?? new Error('No pudimos crear la campaña.');
    await user.getIdToken(true);
    const created = result.data;
    activateCampaign(created);
    return created;
  }, [activateCampaign, organizationId, user]);

  const activeCampaign = useMemo(() => campaigns.find((campaign) => campaign.id === activeCampaignId) ?? null, [activeCampaignId, campaigns]);
  const value = useMemo(() => ({ organizationId, role, enabledAddons, updateEnabledAddons, campaigns, activeCampaign, activeCampaignId, loading, error, setActiveCampaignId, activateCampaign, createCampaign, reload }), [organizationId, role, enabledAddons, updateEnabledAddons, campaigns, activeCampaign, activeCampaignId, loading, error, setActiveCampaignId, activateCampaign, createCampaign, reload]);
  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useActiveCampaign() {
  const context = useContext(CampaignContext);
  if (!context) throw new Error('useActiveCampaign debe usarse dentro de CampaignProvider.');
  return context;
}
