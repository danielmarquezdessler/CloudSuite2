import { CSSProperties, FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'react-apexcharts';
import { Modal } from 'react-bootstrap';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import KpiCard from '../../../components/Shared/KpiCard';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';
import PrimaryButton from '../../../components/Shared/PrimaryButton';

type Status = 'por_hacer' | 'en_progreso' | 'en_revision' | 'completada';
type Area = { id: string; name: string; description: string; color: string };
type Task = { id: string; title: string; description: string; areaId: string; assignedTo: string; status: Status; priority: 'baja' | 'media' | 'alta'; startDate: string; dueDate: string; cost: number };
type Member = { uid: string; displayName?: string; email: string; smartPlannerRole?: 'contador' | 'pm' | 'miembro' };
type NewTask = Omit<Task, 'id' | 'status'>;

const columns: Status[] = ['por_hacer', 'en_progreso', 'en_revision', 'completada'];
const labels: Record<Status, string> = { por_hacer: 'Por hacer', en_progreso: 'En progreso', en_revision: 'En revisión', completada: 'Completada' };
const emptyTask = (): NewTask => ({ title: '', description: '', areaId: '', assignedTo: '', priority: 'media', startDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), cost: 0 });

export default function SmartPlanner() {
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const { enabledAddons, role } = useActiveCampaign();
  const [areaId, setAreaId] = useState('');
  const [view, setView] = useState<'kanban' | 'gantt'>('kanban');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState<NewTask>(emptyTask());
  const [notice, setNotice] = useState('');
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const areasQ = useAuthenticatedQuery<Area[]>(user, base ? `${base}/areas` : null, [base]);
  const tasksQ = useAuthenticatedQuery<Task[]>(user, base ? `${base}/tasks` : null, [base]);
  const membersQ = useAuthenticatedQuery<Member[]>(user, base ? `${base}/members` : null, [base]);
  const financeQ = useAuthenticatedQuery<{ legalSpendingLimit: number; spent: number; exceeded: boolean }>(user, base ? `${base}/finance-overview` : null, [base]);
  const areas = areasQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const members = membersQ.data ?? [];
  const selectedAreaId = areaId || areas[0]?.id || '';
  const myMembership = members.find((member) => member.uid === user?.uid);
  const canManage = ['cliente', 'admin'].includes(role) || ['contador', 'pm'].includes(myMembership?.smartPlannerRole ?? 'miembro');
  const visibleTasks = tasks.filter((task) => !selectedAreaId || task.areaId === selectedAreaId);
  const memberName = (uid: string) => members.find((member) => member.uid === uid)?.displayName || members.find((member) => member.uid === uid)?.email || 'Sin asignar';
  const reload = () => Promise.all([areasQ.reload(), tasksQ.reload(), membersQ.reload()]);

  const gantt = useMemo(() => ({
    series: areas.map((area) => ({ name: area.name, data: visibleTasks.filter((task) => task.areaId === area.id && task.startDate && task.dueDate).map((task) => ({ x: task.title, y: [new Date(`${task.startDate}T00:00:00`).getTime(), new Date(`${task.dueDate}T23:59:59`).getTime()] })) })).filter((series) => series.data.length),
    options: { chart: { type: 'rangeBar' as const, toolbar: { show: false } }, plotOptions: { bar: { horizontal: true } }, xaxis: { type: 'datetime' as const }, colors: areas.map((area) => area.color), legend: { position: 'top' as const }, dataLabels: { enabled: false }, grid: { borderColor: '#e9eef7' } }
  }), [areas, visibleTasks]);

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!user || !base) return;
    try {
      await authenticatedFetch(user, `${base}/tasks`, { method: 'POST', body: JSON.stringify({ ...taskForm, areaId: taskForm.areaId || selectedAreaId, status: 'por_hacer' }) });
      setShowTaskModal(false); setTaskForm(emptyTask()); setNotice('Tarea creada en el cuartel.'); await reload();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No pudimos crear la tarea.'); }
  }

  async function moveTask(task: Task, status: Status) {
    if (!user || !base) return;
    try { await authenticatedFetch(user, `${base}/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ ...task, status }) }); await tasksQ.reload(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No pudimos mover la tarea.'); }
  }

  async function changeMemberRole(memberId: string, smartPlannerRole: string) {
    if (!user || !base) return;
    try { await authenticatedFetch(user, `${base}/members/${memberId}/role`, { method: 'PUT', body: JSON.stringify({ smartPlannerRole }) }); await membersQ.reload(); setNotice('Rol actualizado.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'No pudimos actualizar el rol.'); }
  }

  if (!enabledAddons.smartPlanner) return <PageContainer>
    <HeroBanner icon="settings" title="SmartPlanner" subtitle="Gestión profesional de proyectos para tu campaña." />
    <ContentPanel icon="settings" title="Add-on no habilitado"><EmptyState icon="award" title="Este addon no está habilitado en tu plan" description="Pedile a un administrador global que habilite SmartPlanner para esta organización." /></ContentPanel>
  </PageContainer>;

  return <PageContainer><div data-smartplanner="workspace">
    <HeroBanner icon="target" eyebrow="CUARTEL DE CAMPAÑA" title="SmartPlanner" subtitle="Gestión profesional de proyectos para tu campaña." subtitleDetail="Priorizá, asigná y seguí cada frente estratégico desde un solo lugar." ctaLabel={canManage ? 'Nueva tarea' : undefined} onCtaClick={() => { setTaskForm({ ...emptyTask(), areaId: selectedAreaId, assignedTo: user?.uid ?? '' }); setShowTaskModal(true); }} tags={[{ icon: 'users', label: 'Equipo conectado' }, { icon: 'check-circle', label: 'Flujo profesional' }]} />
    <div className="cd-dashboard__kpis sp-kpis">
      <KpiCard icon="list" value={tasks.length} label="Tareas activas" caption="En el cuartel" />
      <KpiCard icon="bars" iconColor="purple" value={tasks.filter((task) => task.status === 'en_progreso').length} label="En ejecución" caption="Trabajo en marcha" />
      <KpiCard icon="check" iconColor="green" value={tasks.filter((task) => task.status === 'completada').length} label="Completadas" caption="Resultados cerrados" />
      <KpiCard icon="clock" iconColor="orange" value={tasks.filter((task) => task.priority === 'alta' && task.status !== 'completada').length} label="Alta prioridad" caption="Foco inmediato" />
    </div>
    <ContentPanel icon="trend" title="Control de tope legal" subtitle={financeQ.data?.legalSpendingLimit ? `Gasto acumulado $${financeQ.data.spent.toLocaleString('es-AR')} de $${financeQ.data.legalSpendingLimit.toLocaleString('es-AR')}.` : 'Definí el límite legal para activar alertas de gasto.'} headerAction={canManage ? <button type="button" className="btn btn-sm btn-outline-primary" onClick={async () => { const value = window.prompt('Tope legal de gasto', String(financeQ.data?.legalSpendingLimit ?? '')); if (value !== null && user && base) { await authenticatedFetch(user, `${base}/finance-overview/legal-limit`, { method: 'PUT', body: JSON.stringify({ legalSpendingLimit: Number(value) }) }); await financeQ.reload(); } }}>Definir tope</button> : undefined}>{financeQ.data?.legalSpendingLimit ? <div className={`alert ${financeQ.data.exceeded ? 'alert-danger' : 'alert-info'} mb-0`} role="status">{financeQ.data.exceeded ? `Alerta: el gasto supera el tope legal.` : 'El gasto permanece dentro del tope legal.'}</div> : <EmptyState icon="trend" title="Sin tope legal configurado" description="El Contador o PM puede cargarlo desde este panel." />}</ContentPanel>
    <ContentPanel icon="target" title="Cuartel de campaña" subtitle="Elegí un frente para entrar a su tablero operativo." headerAction={<Inline gap="sm"><Link className="sp-tab" to="/smartplanner/contributors">Aportantes</Link><Link className="sp-tab" to="/smartplanner/providers">Proveedores</Link><Link className="sp-tab" to="/smartplanner/invoices">Facturación</Link><Link className="sp-tab" to="/smartplanner/contracts">Contratos</Link><Link className="sp-tab" to="/smartplanner/materials">Materiales</Link><button type="button" className={`sp-tab ${view === 'kanban' ? 'is-active' : ''}`} onClick={() => setView('kanban')}>Kanban</button><button type="button" className={`sp-tab ${view === 'gantt' ? 'is-active' : ''}`} onClick={() => setView('gantt')}>Gantt</button></Inline>}>
      <Stack gap="lg">
        <div className="sp-area-rail">{areas.map((area) => <button type="button" key={area.id} onClick={() => setAreaId(area.id)} className={`sp-area-card ${selectedAreaId === area.id ? 'is-active' : ''}`} style={{ '--sp-color': area.color } as CSSProperties}><span className="sp-area-card__dot" /><strong>{area.name}</strong><small>{tasks.filter((task) => task.areaId === area.id).length} tareas · {area.description}</small></button>)}</div>
        {areasQ.loading ? <EmptyState icon="target" title="Preparando el cuartel" description="Estamos sembrando las áreas estratégicas de la campaña." /> : view === 'gantt' ? <div className="sp-gantt">{gantt.series.length ? <Chart type="rangeBar" height={Math.max(270, gantt.series.length * 90)} options={gantt.options} series={gantt.series} /> : <EmptyState icon="calendar" title="Todavía no hay rangos para mostrar" description="Creá tareas con fechas de inicio y límite para visualizar el Gantt." />}</div> : <div className="sp-kanban">{columns.map((status) => <section className="sp-kanban__column" key={status}><header><span>{labels[status]}</span><b>{visibleTasks.filter((task) => task.status === status).length}</b></header><Stack gap="sm">{visibleTasks.filter((task) => task.status === status).map((task) => <article className="sp-task" key={task.id}><span className={`sp-task__priority ${task.priority}`} /><strong>{task.title}</strong><small>{memberName(task.assignedTo)} · vence {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('es-AR')}</small><SelectControl ariaLabel={`Mover ${task.title}`} label="Mover" value={task.status} onChange={(next) => void moveTask(task, next as Status)} options={columns.map((value) => ({ value, label: labels[value] }))} /></article>)}{!visibleTasks.filter((task) => task.status === status).length && <p className="sp-empty">Sin tareas en esta etapa.</p>}</Stack></section>)}</div>}
      </Stack>
    </ContentPanel>
    <ContentPanel icon="users" title="Roles SmartPlanner" subtitle="Contador y PM administran el cuartel; los miembros gestionan sus propias tareas."><div className="sp-roles">{members.map((member) => <Inline key={member.uid} gap="sm" className="sp-role"><span className="sp-avatar">{(member.displayName || member.email).slice(0, 2).toUpperCase()}</span><Stack gap="xs"><strong>{member.displayName || member.email}</strong><small>{member.email}</small></Stack><SelectControl ariaLabel={`Rol de ${member.displayName || member.email}`} label={member.smartPlannerRole || 'miembro'} value={member.smartPlannerRole || 'miembro'} disabled={!['cliente', 'admin'].includes(role)} onChange={(next) => void changeMemberRole(member.uid, next)} options={[{ value: 'miembro', label: 'Miembro' }, { value: 'pm', label: 'Project Manager' }, { value: 'contador', label: 'Contador' }]} /></Inline>)}</div></ContentPanel>
    <Modal show={showTaskModal} onHide={() => setShowTaskModal(false)}><form onSubmit={saveTask}><Modal.Header closeButton><Modal.Title>Nueva tarea estratégica</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><input aria-label="Título de tarea" className="form-control" placeholder="Definí el resultado a lograr…" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required /><textarea aria-label="Descripción de tarea" className="form-control" placeholder="Contexto y criterio de éxito" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} /><input aria-label="Costo estimado de tarea" type="number" min="0" className="form-control" placeholder="Costo estimado" value={taskForm.cost} onChange={(event) => setTaskForm({ ...taskForm, cost: Number(event.target.value) })} /><SelectControl ariaLabel="Área" label="Área estratégica" value={taskForm.areaId || selectedAreaId} onChange={(next) => setTaskForm({ ...taskForm, areaId: next })} options={areas.map((area) => ({ value: area.id, label: area.name }))} /><SelectControl ariaLabel="Responsable" label="Asignar responsable" value={taskForm.assignedTo} onChange={(next) => setTaskForm({ ...taskForm, assignedTo: next })} options={members.map((member) => ({ value: member.uid, label: member.displayName || member.email }))} /><Inline gap="md"><input aria-label="Inicio" type="date" className="form-control" value={taskForm.startDate} onChange={(event) => setTaskForm({ ...taskForm, startDate: event.target.value })} /><input aria-label="Fecha límite" type="date" className="form-control" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} /></Inline><SelectControl ariaLabel="Prioridad" label="Prioridad media" value={taskForm.priority} onChange={(next) => setTaskForm({ ...taskForm, priority: next as NewTask['priority'] })} options={[{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }]} /></Stack></Modal.Body><Modal.Footer><PrimaryButton icon="plus" type="submit">Crear tarea</PrimaryButton></Modal.Footer></form></Modal>
    {notice && <div className="sp-notice" role="status">{notice}</div>}
  </div></PageContainer>;
}
