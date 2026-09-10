import { SyncState } from '../../lib/offlineVisits';

export default function OfflineVisitStatus({ state }: { state: SyncState }) {
  if (!state.online) return <div className="alert alert-info mb-0" role="status">Sin conexión — tu trabajo se guarda localmente.</div>;
  if (state.syncing) return <div className="alert alert-primary mb-0" role="status">{state.message ?? `Sincronizando ${state.pending} pendientes…`}</div>;
  if (state.pending) return <div className="alert alert-warning mb-0" role="status">{state.message ?? `${state.pending} visita(s) pendiente(s) de sincronización.`}</div>;
  return null;
}
