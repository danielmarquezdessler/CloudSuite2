import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authenticatedRequest, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import PageContainer from '../../../components/Shared/PageContainer';
import EmptyState from '../../../components/Shared/EmptyState';

type NotificationItem = { id: string; title: string; message: string; read: boolean; createdAt: string | null };

export default function Notifications() {
  const { user } = useAuth();
  const path = user ? `/api/users/${user.uid}/notifications` : null;
  const { data, error, loading, reload } = useAuthenticatedQuery<NotificationItem[]>(user, path, [user?.uid]);
  const [actionError, setActionError] = useState('');
  const items = data ?? [];
  const archive = async (id: string) => {
    if (!user) return;
    const result = await authenticatedRequest(user, `/api/users/${user.uid}/notifications/${id}`, { method: 'DELETE' });
    if (result.error) { setActionError(result.error.message); return; }
    await reload();
  };

  return <PageContainer><ContentPanel icon="clock" title="Notificaciones" subtitle="Tu historial reciente de actividad.">
    {error || actionError ? <EmptyState icon="info" title="No pudimos cargar las notificaciones" description={actionError || error?.message || 'Intentá nuevamente.'} ctaLabel="Reintentar" onCtaClick={() => { setActionError(''); void reload(); }} /> : loading ? <EmptyState icon="clock" title="Cargando notificaciones" description="Estamos consultando la actividad reciente." /> : items.length ? <div className="list-group">{items.map(item => <div className={`list-group-item d-flex justify-content-between gap-3 ${item.read ? '' : 'bg-light-primary'}`} key={item.id}><div><strong>{item.title}</strong><p className="mb-1">{item.message}</p><small className="text-muted">{item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : 'Recién'}</small></div><button className="btn btn-sm btn-outline-secondary align-self-center" onClick={() => void archive(item.id)}>Archivar</button></div>)}</div> : <EmptyState icon="clock" title="No hay notificaciones" description="Cuando haya actividad relevante en tu campaña aparecerá aquí." />}
  </ContentPanel></PageContainer>;
}
