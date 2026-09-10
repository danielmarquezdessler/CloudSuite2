import { FormEvent, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { Button, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import KpiCard from '../../../components/Shared/KpiCard';
import PageContainer from '../../../components/Shared/PageContainer';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';
import Stack from '../../../components/Shared/Stack';
import Timeline, { TimelineEvent } from '../../../components/Planning/Timeline';
import { Toast } from '../../../components/Toast';
import { useCampaign } from './useCampaign';
import { useActiveCampaign } from '../../../context/CampaignContext';

type Campaign = { id: string; nombre: string; createdAt: string | null; memberCount: number; voterCount: number };
type CampaignTemplate = { id: string; nombre: string; createdAt: string | null; functionCount: number; teamCount: number; questionSetCount: number };
type Comparison = Campaign & { totalVoters: number; totalVisits: number; coveragePercent: number; principal: { name: string; type: string } | null; conversion: { yes: { count: number; percent: number }; no: { count: number; percent: number }; undecided: { count: number; percent: number } } };
type CampaignTimelineEvent = TimelineEvent;

function dateLabel(value: string | null) {
  if (!value) return 'Recién creada';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value));
}

function comparisonValue(item: Comparison, metric: 'principal' | 'voters' | 'visits' | 'yes' | 'no' | 'undecided' | 'coverage' | 'members' | 'created') {
  if (metric === 'principal') return item.principal ? `${item.principal.name} · ${item.principal.type}` : 'Sin definir';
  if (metric === 'voters') return item.totalVoters;
  if (metric === 'visits') return item.totalVisits;
  if (metric === 'yes') return `${item.conversion.yes.count} · ${item.conversion.yes.percent}%`;
  if (metric === 'no') return `${item.conversion.no.count} · ${item.conversion.no.percent}%`;
  if (metric === 'undecided') return `${item.conversion.undecided.count} · ${item.conversion.undecided.percent}%`;
  if (metric === 'coverage') return `${item.coveragePercent}%`;
  if (metric === 'members') return item.memberCount;
  return dateLabel(item.createdAt);
}

export default function Campaigns() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const { activateCampaign, organizationId } = useActiveCampaign();
  const navigate = useNavigate();
  const orgId = campaign?.orgId ?? organizationId;
  const path = orgId ? `/api/organizations/${orgId}/campaigns` : null;
  const templatePath = orgId ? `/api/organizations/${orgId}/campaign-templates` : null;
  const timelinePath = campaign ? `${path}/${campaign.campId}/timeline` : null;
  const campaignsQuery = useAuthenticatedQuery<Campaign[]>(user, path, [orgId]);
  const templatesQuery = useAuthenticatedQuery<CampaignTemplate[]>(user, templatePath, [orgId]);
  const timelineQuery = useAuthenticatedQuery<CampaignTimelineEvent[]>(user, timelinePath, [orgId, campaign?.campId]);
  const campaigns = campaignsQuery.data ?? [];
  const [view, setView] = useState<'campaigns' | 'compare' | 'templates' | 'history'>('campaigns');
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [cloning, setCloning] = useState<Campaign | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [copyOptions, setCopyOptions] = useState({ equipos: true, funciones: true, preguntas: true, candidatos: true });
  const [templating, setTemplating] = useState<Campaign | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [deletingTemplate, setDeletingTemplate] = useState<CampaignTemplate | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'danger' } | null>(null);

  const busiest = useMemo(() => [...campaigns].sort((left, right) => right.voterCount - left.voterCount || right.memberCount - left.memberCount)[0], [campaigns]);
  const totalMembers = campaigns.reduce((sum, item) => sum + item.memberCount, 0);
  const totalVoters = campaigns.reduce((sum, item) => sum + item.voterCount, 0);
  const failure = campaignError || campaignsQuery.error?.message;
  const comparisonChart = useMemo(() => comparison ? ({ options: { chart: { toolbar: { show: false } }, xaxis: { categories: comparison.map((item) => item.nombre) }, colors: ['#0060F0'], dataLabels: { enabled: false }, grid: { borderColor: '#eef2f8' }, yaxis: { min: 0, max: 100, labels: { formatter: (value: number) => `${value}%` } } }, series: [{ name: 'Conversión SI', data: comparison.map((item) => item.conversion.yes.percent) }] }) : null, [comparison]);

  const openCreate = () => { setEditing(null); setName(''); setTemplateId(''); setShowEditor(true); };
  const openRename = (item: Campaign) => { setEditing(item); setName(item.nombre); setTemplateId(''); setShowEditor(true); };
  const openClone = (item: Campaign) => { setCloning(item); setCloneName(`${item.nombre} (copia)`); setCopyOptions({ equipos: true, funciones: true, preguntas: true, candidatos: true }); };
  const toggleSelected = (id: string) => { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); setComparison(null); };
  const compare = async () => {
    if (!user || !path || selected.length < 2 || comparing) return;
    setComparing(true);
    try { setComparison(await authenticatedFetch<Comparison[]>(user, `${path}/compare?ids=${encodeURIComponent(selected.join(','))}`)); }
    catch (caught) { setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos comparar las campañas.', variant: 'danger' }); }
    finally { setComparing(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !path || saving) return;
    setSaving(true);
    try {
      const item = await authenticatedFetch<Campaign>(user, editing ? `${path}/${editing.id}` : path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(editing ? { nombre: name } : { nombre: name, ...(templateId ? { templateId } : {}) }) });
      if (!editing) {
        await user.getIdToken(true);
        await Promise.all([campaignsQuery.reload(), reloadCampaign()]);
        activateCampaign(item);
      } else {
        await Promise.all([campaignsQuery.reload(), reloadCampaign()]);
      }
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
  const clone = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !path || !cloning || saving) return;
    setSaving(true);
    try {
      const created = await authenticatedFetch<Campaign>(user, `${path}/${cloning.id}/clone`, { method: 'POST', body: JSON.stringify({ nombre: cloneName, copiar: copyOptions }) });
      await user.getIdToken(true);
      activateCampaign(created);
      setCloning(null);
      setNotice({ message: `La campaña “${created.nombre}” fue duplicada y ahora está activa.`, variant: 'success' });
      navigate('/dashboard');
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos duplicar la campaña.', variant: 'danger' });
    } finally { setSaving(false); }
  };
  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !templatePath || !templating || saving) return;
    setSaving(true);
    try {
      const created = await authenticatedFetch<CampaignTemplate>(user, templatePath, { method: 'POST', body: JSON.stringify({ nombre: templateName, campId: templating.id }) });
      await templatesQuery.reload();
      setTemplating(null);
      setNotice({ message: `La plantilla “${created.nombre}” fue guardada.`, variant: 'success' });
    } catch (caught) { setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos guardar la plantilla.', variant: 'danger' }); }
    finally { setSaving(false); }
  };
  const removeTemplate = async () => {
    if (!user || !templatePath || !deletingTemplate || saving) return;
    setSaving(true);
    try {
      await authenticatedFetch(user, `${templatePath}/${deletingTemplate.id}`, { method: 'DELETE' });
      await templatesQuery.reload();
      setNotice({ message: `La plantilla “${deletingTemplate.nombre}” fue eliminada.`, variant: 'success' });
      setDeletingTemplate(null);
    } catch (caught) { setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos eliminar la plantilla.', variant: 'danger' }); }
    finally { setSaving(false); }
  };

  return <PageContainer><Stack gap="lg">
    <HeroBanner icon={view === 'compare' ? 'bars' : view === 'templates' ? 'copy' : view === 'history' ? 'clock' : 'target'} title={view === 'compare' ? 'Comparador entre Campañas' : view === 'templates' ? 'Plantillas de Campaña' : view === 'history' ? 'Historial de Campaña' : 'Gestión de Campañas'} subtitle={view === 'compare' ? 'Contrastá resultados y cobertura de dos o más campañas.' : view === 'templates' ? 'Reutilizá estructuras de equipos, funciones y preguntas.' : view === 'history' ? 'Consultá los hitos principales de la campaña activa.' : 'Creá y organizá las campañas de tu organización.'} subtitleDetail={view === 'compare' ? 'Las métricas usan exclusivamente los datos vigentes de cada campaña.' : view === 'templates' ? 'Una plantilla nunca transporta personas, electores ni actividad operativa.' : view === 'history' ? 'Incluye creación, candidatura principal, metas, volumen y reinicios de métricas.' : 'Cada campaña mantiene sus equipos, electores, planificación y actividad completamente aislados.'} tags={view === 'compare' ? [{ icon: 'bars', label: 'Comparación real' }, { icon: 'target', label: 'Métricas vigentes' }] : view === 'templates' ? [{ icon: 'copy', label: 'Estructuras reutilizables' }, { icon: 'target', label: 'Datos aislados' }] : view === 'history' ? [{ icon: 'clock', label: 'Hitos cronológicos' }, { icon: 'target', label: 'Campaña activa' }] : [{ icon: 'target', label: 'Datos aislados' }, { icon: 'users', label: 'Equipos por campaña' }, { icon: 'bars', label: 'Control centralizado' }]} ctaLabel={view === 'campaigns' ? 'Crear nueva campaña' : undefined} onCtaClick={openCreate} />
    <Inline gap="sm" wrap><Button variant={view === 'campaigns' ? 'primary' : 'outline-primary'} onClick={() => setView('campaigns')}>Campañas</Button><Button variant={view === 'compare' ? 'primary' : 'outline-primary'} onClick={() => setView('compare')}>Comparar campañas</Button><Button variant={view === 'templates' ? 'primary' : 'outline-primary'} onClick={() => setView('templates')}>Plantillas</Button><Button variant={view === 'history' ? 'primary' : 'outline-primary'} onClick={() => setView('history')}>Historial</Button></Inline>
    {view === 'compare' ? <Stack gap="lg">
      <ContentPanel icon="target" title="Elegí las campañas" subtitle="Seleccioná dos o más campañas de tu organización para contrastar resultados." headerAction={<Button size="sm" disabled={selected.length < 2 || comparing} onClick={() => void compare()}>{comparing ? 'Comparando…' : 'Comparar'}</Button>}>
        <Stack gap="md"><p className="mb-0 text-muted">{selected.length < 2 ? 'Elegí al menos dos campañas para habilitar el comparador.' : `${selected.length} campañas seleccionadas.`}</p><div className="row g-3">{campaigns.map((item) => <div className="col-md-6 col-xl-4" key={item.id}><label className="form-check border rounded p-3 h-100"><input className="form-check-input" type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Comparar ${item.nombre}`} /><span className="form-check-label ms-2"><strong>{item.nombre}</strong><small className="d-block text-muted">{item.voterCount} electores · {item.memberCount} miembros</small></span></label></div>)}</div></Stack>
      </ContentPanel>
      {comparison && comparisonChart && <ContentPanel icon="bars" title="Resultados comparados" subtitle="Cada columna representa una campaña y sus datos aislados."><Stack gap="lg"><div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>MÉTRICA</th>{comparison.map((item) => <th key={item.id}>{item.nombre}</th>)}</tr></thead><tbody>{([['Candidato Principal', 'principal'], ['Electores', 'voters'], ['Visitas totales', 'visits'], ['Conversión SI', 'yes'], ['Conversión NO', 'no'], ['Indecisos', 'undecided'], ['Cobertura', 'coverage'], ['Miembros', 'members'], ['Fecha de creación', 'created']] as const).map(([label, metric]) => <tr key={metric}><th>{label}</th>{comparison.map((item) => <td key={item.id}>{comparisonValue(item, metric)}</td>)}</tr>)}</tbody></table></div><Chart type="bar" height={280} options={comparisonChart.options} series={comparisonChart.series} /></Stack></ContentPanel>}
    </Stack> : view === 'templates' ? <ContentPanel icon="copy" title="Plantillas guardadas" subtitle="Usalas al crear campañas para partir de una estructura que ya conocés.">
      {templatesQuery.loading ? <EmptyState icon="copy" title="Cargando plantillas" description="Estamos preparando las estructuras de tu organización." /> : templatesQuery.error ? <EmptyState icon="copy" title="No pudimos cargar las plantillas" description={templatesQuery.error.message} ctaLabel="Reintentar" onCtaClick={() => void templatesQuery.reload()} /> : templatesQuery.data?.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>PLANTILLA</th><th>FUNCIONES</th><th>EQUIPOS</th><th>PREGUNTAS</th><th>CREADA</th><th>ACCIONES</th></tr></thead><tbody>{templatesQuery.data.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong></td><td>{item.functionCount}</td><td>{item.teamCount}</td><td>{item.questionSetCount}</td><td>{dateLabel(item.createdAt)}</td><td><Button size="sm" variant="outline-danger" onClick={() => setDeletingTemplate(item)}>Eliminar</Button></td></tr>)}</tbody></table></div> : <EmptyState icon="copy" title="Todavía no hay plantillas" description="Guardá la estructura de una campaña desde la pestaña Campañas para reutilizarla después." />}
    </ContentPanel> : view === 'history' ? <ContentPanel icon="clock" title="Línea de tiempo" subtitle="Eventos relevantes y hitos calculados de la campaña activa.">
      {timelineQuery.loading ? <EmptyState icon="clock" title="Cargando historial" description="Estamos reuniendo los hitos de la campaña." /> : timelineQuery.error ? <EmptyState icon="clock" title="No pudimos cargar el historial" description={timelineQuery.error.message} ctaLabel="Reintentar" onCtaClick={() => void timelineQuery.reload()} /> : <Timeline events={timelineQuery.data ?? []} />}
    </ContentPanel> : <Stack gap="lg">
      <div className="cd-dashboard__kpis"><KpiCard icon="target" value={campaigns.length} label="Total de campañas" caption={campaigns.length === 1 ? 'Una campaña activa' : 'Campañas de la organización'} /><KpiCard icon="people" iconColor="green" value={totalMembers} label="Miembros asignados" caption="Vínculos entre todas las campañas" /><KpiCard icon="people" iconColor="purple" value={totalVoters} label="Electores registrados" caption="Bases de electores aisladas" /><KpiCard icon="trend" iconColor="orange" value={busiest?.nombre ?? '—'} label="Campaña más activa" caption={busiest ? `${busiest.voterCount} electores · ${busiest.memberCount} miembros` : 'Sin actividad todavía'} /></div>
      <ContentPanel icon="target" title="Campañas de la organización" subtitle="Administrá cada campaña sin mezclar sus equipos, electores ni planificación." headerAction={<Button size="sm" onClick={openCreate}>Crear nueva campaña</Button>}>
        {failure ? <EmptyState icon="target" title="No pudimos cargar las campañas" description={failure} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : campaignsQuery.reload())} /> : campaignsQuery.loading ? <EmptyState icon="target" title="Cargando campañas" description="Estamos preparando la organización." /> : campaigns.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>CAMPAÑA</th><th>CREADA</th><th>MIEMBROS</th><th>ELECTORES</th><th>ACCIONES</th></tr></thead><tbody>{campaigns.map((item) => <tr key={item.id}><td><strong>{item.nombre}</strong></td><td>{dateLabel(item.createdAt)}</td><td>{item.memberCount}</td><td>{item.voterCount}</td><td><Inline gap="sm" wrap><Button size="sm" variant="outline-primary" onClick={() => openRename(item)}>Editar</Button><Button size="sm" variant="outline-primary" onClick={() => openClone(item)}>Duplicar</Button><Button size="sm" variant="outline-primary" onClick={() => { setTemplating(item); setTemplateName(`${item.nombre} — plantilla`); }}>Guardar plantilla</Button><Button size="sm" variant="outline-danger" onClick={() => { setDeleting(item); setConfirmation(''); }}>Eliminar</Button></Inline></td></tr>)}</tbody></table></div> : <EmptyState icon="target" title="Todavía no hay campañas" description="Creá la primera campaña para comenzar a organizar tu operación." ctaLabel="Crear nueva campaña" onCtaClick={openCreate} />}
      </ContentPanel>
    </Stack>}
    <Modal show={showEditor} onHide={() => !saving && setShowEditor(false)}><form onSubmit={submit}><Modal.Header closeButton><Modal.Title>{editing ? 'Renombrar campaña' : 'Crear nueva campaña'}</Modal.Title></Modal.Header><Modal.Body><Stack gap="sm"><div><label className="form-label" htmlFor="campaign-name">Nombre de la campaña</label><input id="campaign-name" className="form-control" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoFocus /></div>{!editing && <div><label className="form-label" htmlFor="campaign-template">Empezar desde plantilla</label><SelectControl id="campaign-template" label="Sin plantilla" ariaLabel="Empezar desde plantilla" options={[{ value: '', label: 'Sin plantilla' }, ...(templatesQuery.data ?? []).map((item) => ({ value: item.id, label: item.nombre }))]} value={templateId} onChange={setTemplateId} /></div>}<p className="small text-muted mb-0">{editing ? 'El nombre cambiará sin modificar la estructura de esta campaña.' : templateId ? 'Se copiarán equipos sin miembros, funciones y preguntas de la plantilla elegida.' : 'La campaña tendrá sus propios miembros, electores, equipos y planificación.'}</p></Stack></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setShowEditor(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar nombre' : 'Crear campaña'}</Button></Modal.Footer></form></Modal>
    <Modal show={Boolean(templating)} onHide={() => !saving && setTemplating(null)}><form onSubmit={saveTemplate}><Modal.Header closeButton><Modal.Title>Guardar como plantilla</Modal.Title></Modal.Header><Modal.Body><Stack gap="sm"><p className="mb-0 text-muted">Se guardarán las funciones, equipos sin personas y conjuntos de preguntas de “{templating?.nombre}”.</p><div><label className="form-label" htmlFor="campaign-template-name">Nombre de la plantilla</label><input id="campaign-template-name" className="form-control" value={templateName} onChange={(event) => setTemplateName(event.target.value)} required maxLength={120} autoFocus /></div></Stack></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setTemplating(null)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar plantilla'}</Button></Modal.Footer></form></Modal>
    <Modal show={Boolean(cloning)} onHide={() => !saving && setCloning(null)}><form onSubmit={clone}><Modal.Header closeButton><Modal.Title>Duplicar campaña</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><p className="mb-0 text-muted">La nueva campaña conservará solo la estructura que selecciones. Sus electores, visitas, tareas, incidentes y auditoría comenzarán vacíos.</p><div><label className="form-label" htmlFor="campaign-clone-name">Nombre de la nueva campaña</label><input id="campaign-clone-name" className="form-control" value={cloneName} onChange={(event) => setCloneName(event.target.value)} required maxLength={120} autoFocus /></div><fieldset><legend className="fs-6 mb-2">Copiar estructura</legend><Stack gap="sm">{([{ key: 'equipos', label: 'Equipos (sin miembros ni líder)' }, { key: 'funciones', label: 'Funciones' }, { key: 'preguntas', label: 'Preguntas de visita' }, { key: 'candidatos', label: 'Candidatos (sin Principal)' }] as const).map(({ key, label }) => <label className="form-check" key={key}><input className="form-check-input" type="checkbox" checked={copyOptions[key]} onChange={(event) => setCopyOptions((current) => ({ ...current, [key]: event.target.checked }))} /><span className="form-check-label">{label}</span></label>)}</Stack></fieldset></Stack></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setCloning(null)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Duplicando…' : 'Duplicar campaña'}</Button></Modal.Footer></form></Modal>
    <Modal show={Boolean(deleting)} onHide={() => !saving && setDeleting(null)}><Modal.Header closeButton><Modal.Title>Eliminar campaña</Modal.Title></Modal.Header><Modal.Body><Stack gap="sm"><p className="mb-0">Esta acción eliminará definitivamente los equipos, electores, visitas, planificación, auditoría y demás datos propios de la campaña. Las cuentas de usuario se conservarán.</p><div><label className="form-label" htmlFor="campaign-delete-confirmation">Para confirmar, escribí exactamente: <strong>{deleting?.nombre}</strong></label><input id="campaign-delete-confirmation" className="form-control" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div></Stack></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setDeleting(null)} disabled={saving}>Cancelar</Button><Button variant="danger" onClick={() => void remove()} disabled={saving || confirmation !== deleting?.nombre}>{saving ? 'Eliminando…' : 'Eliminar campaña'}</Button></Modal.Footer></Modal>
    <Modal show={Boolean(deletingTemplate)} onHide={() => !saving && setDeletingTemplate(null)}><Modal.Header closeButton><Modal.Title>Eliminar plantilla</Modal.Title></Modal.Header><Modal.Body><p className="mb-0">¿Querés eliminar la plantilla “{deletingTemplate?.nombre}”? Esto no modificará ninguna campaña existente.</p></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setDeletingTemplate(null)} disabled={saving}>Cancelar</Button><Button variant="danger" onClick={() => void removeTemplate()} disabled={saving}>{saving ? 'Eliminando…' : 'Eliminar plantilla'}</Button></Modal.Footer></Modal>
    {notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}
  </Stack></PageContainer>;
}
