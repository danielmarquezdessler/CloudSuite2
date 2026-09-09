import { FormEvent, useMemo, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import KpiCard from '../../../components/Shared/KpiCard';
import PageContainer from '../../../components/Shared/PageContainer';
import Inline from '../../../components/Shared/Inline';
import { Toast } from '../../../components/Toast';
import { useCampaign } from './useCampaign';

type Campaign = { id: string; nombre: string; createdAt: string | null; memberCount: number; voterCount: number };

function dateLabel(value: string | null) {
  if (!value) return 'Recién creada';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value));
}

export default function Campaigns() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns` : null;
  const campaignsQuery = useAuthenticatedQuery<Campaign[]>(user, path, [campaign?.orgId]);
  const campaigns = campaignsQuery.data ?? [];
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'danger' } | null>(null);

  const busiest = useMemo(() => [...campaigns].sort((left, right) => right.voterCount - left.voterCount || right.memberCount - left.memberCount)[0], [campaigns]);
  const totalMembers = campaigns.reduce((sum, item) => sum + item.memberCount, 0);
  const totalVoters = campaigns.reduce((sum, item) => sum + item.voterCount, 0);
  const failure = campaignError || campaignsQuery.error?.message;

  const openCreate = () => { setEditing(null); setName(''); setShowEditor(true); };
  const openRename = (item: Campaign) => { setEditing(item); setName(item.nombre); setShowEditor(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !path || saving) return;
    setSaving(true);
    try {
      const item = await authenticatedFetch<Campaign>(user, editing ? `${path}/${editing.id}` : path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ nombre: name }) });
      if (!editing) await user.getIdToken(true);
      await Promise.all([campaignsQuery.reload(), reloadCampaign()]);
      setShowEditor(false);
      setNotice({ message: editing ? `La campaña “${item.nombre}” fue renombrada.` : `La campaña “${item.nombre}” fue creada.`, variant: 'success' });
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos guardar la campaña.', variant: 'danger' });
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!user || !path || !deleting || confirmation !== deleting.nombre || saving) return;
    setSaving(true);
    try {
      await authenticatedFetch(user, `${path}/${deleting.id}`, { method: 'DELETE' });
      await user.getIdToken(true);
      await Promise.all([campaignsQuery.reload(), reloadCampaign()]);
      setNotice({ message: `La campaña “${deleting.nombre}” y sus datos fueron eliminados.`, variant: 'success' });
      setDeleting(null); setConfirmation('');
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos eliminar la campaña.', variant: 'danger' });
    } finally { setSaving(false); }
  };

  return <PageContainer>
    <HeroBanner icon="target" title="Gestión de Campañas" subtitle="Creá y organizá las campañas de tu organización." subtitleDetail="Cada campaña mantiene sus equipos, electores, planificación y actividad completamente aislados." tags={[{ icon: 'target', label: 'Datos aislados' }, { icon: 'users', label: 'Equipos por campaña' }, { icon: 'bars', label: 'Control centralizado' }]} ctaLabel="Crear nueva campaña" onCtaClick={openCreate} />
    <div className="cd-dashboard__kpis">
      <KpiCard icon="target" value={campaigns.length} label="Total de campañas" caption={campaigns.length === 1 ? 'Una campaña activa' : 'Campañas de la organización'} />
      <KpiCard icon="people" iconColor="green" value={totalMembers} label="Miembros asignados" caption="Vínculos entre todas las campañas" />
      <KpiCard icon="people" iconColor="purple" value={totalVoters} label="Electores registrados" caption="Bases de electores aisladas" />
      <KpiCard icon="trend" iconColor="orange" value={busiest?.nombre ?? '—'} label="Campaña más activa" caption={busiest ? `${busiest.voterCount} electores · ${busiest.memberCount} miembros` : 'Sin actividad todavía'} />
    </div>
    <ContentPanel icon="target" title="Campañas de la organización" subtitle="Administrá cada campaña sin mezclar sus equipos, electores ni planificación." headerAction={<Button size="sm" onClick={openCreate}>Crear nueva campaña</Button>}>
      {failure ? <EmptyState icon="target" title="No pudimos cargar las campañas" description={failure} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : campaignsQuery.reload())} /> : campaignsQuery.loading ? <EmptyState icon="target" title="Cargando campañas" description="Estamos preparando la organización." /> : campaigns.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>CAMPAÑA</th><th>CREADA</th><th>MIEMBROS</th><th>ELECTORES</th><th>ACCIONES</th></tr></thead><tbody>{campaigns.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong></td><td>{dateLabel(item.createdAt)}</td><td>{item.memberCount}</td><td>{item.voterCount}</td><td><Inline gap="sm" wrap><Button size="sm" variant="outline-primary" onClick={() => openRename(item)}>Editar</Button><Button size="sm" variant="outline-danger" onClick={() => { setDeleting(item); setConfirmation(''); }}>Eliminar</Button></Inline></td></tr>)}</tbody></table></div> : <EmptyState icon="target" title="Todavía no hay campañas" description="Creá la primera campaña para comenzar a organizar tu operación." ctaLabel="Crear nueva campaña" onCtaClick={openCreate} />}
    </ContentPanel>
    <Modal show={showEditor} onHide={() => !saving && setShowEditor(false)}><form onSubmit={submit}><Modal.Header closeButton><Modal.Title>{editing ? 'Renombrar campaña' : 'Crear nueva campaña'}</Modal.Title></Modal.Header><Modal.Body><label className="form-label" htmlFor="campaign-name">Nombre de la campaña</label><input id="campaign-name" className="form-control" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoFocus /><p className="small text-muted mt-2 mb-0">La campaña tendrá sus propios miembros, electores, equipos y planificación.</p></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar nombre' : 'Crear campaña'}</Button></Modal.Footer></form></Modal>
    <Modal show={Boolean(deleting)} onHide={() => !saving && setDeleting(null)}><Modal.Header closeButton><Modal.Title>Eliminar campaña</Modal.Title></Modal.Header><Modal.Body><p>Esta acción eliminará definitivamente los equipos, electores, visitas, planificación, auditoría y demás datos propios de la campaña. Las cuentas de usuario se conservarán.</p><label className="form-label" htmlFor="campaign-delete-confirmation">Para confirmar, escribí exactamente: <strong>{deleting?.nombre}</strong></label><input id="campaign-delete-confirmation" className="form-control" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setDeleting(null)} disabled={saving}>Cancelar</Button><Button variant="danger" onClick={() => void remove()} disabled={saving || confirmation !== deleting?.nombre}>{saving ? 'Eliminando…' : 'Eliminar campaña'}</Button></Modal.Footer></Modal>
    {notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}
  </PageContainer>;
}
