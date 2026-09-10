import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useActiveCampaign } from './CampaignContext';
import { SyncState, pendingVisitCount, subscribeToSync, syncPendingVisits } from '../lib/offlineVisits';

const initialState: SyncState = { online: navigator.onLine, syncing: false, pending: 0 };
const OfflineSyncContext = createContext<SyncState>(initialState);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCampaign } = useActiveCampaign();
  const [state, setState] = useState<SyncState>(initialState);

  useEffect(() => {
    const refresh = async () => {
      const pending = await pendingVisitCount();
      setState(current => ({ ...current, online: navigator.onLine, pending }));
    };
    const synchronize = () => { if (user && navigator.onLine) void syncPendingVisits(user); else void refresh(); };
    const unsubscribe = subscribeToSync(setState);
    const online = () => synchronize();
    const offline = () => void refresh();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    void refresh();
    synchronize();
    return () => { unsubscribe(); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [activeCampaign?.id, user]);

  return <OfflineSyncContext.Provider value={state}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}
