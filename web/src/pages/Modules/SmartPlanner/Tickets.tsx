import { FormEvent, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useAuth } from '../../../context/AuthContext';
import { useCampaign } from '../Organization/useCampaign';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';
import PrimaryButton from '../../../components/Shared/PrimaryButton';
import SelectControl from '../../../components/Shared/SelectControl';

type Ticket = { id: string; title: string; description: string; status: string; priority: string; assignedArea: string };
type Area = { id: string; name: string };
const initialForm = { title: '', description: '', assignedArea: '', priority: 'media' };

export default function Tickets() {
  const { user } = useAuth(); const { campaign } = useCampaign(); const { enabledAddons } = useActiveCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const ticketsQ = useAuthenticatedQuery<Ticket[]>(user, base ? `${base}/tickets` : null, [base]);
  const areasQ = useAuthenticatedQuery<Area[]>(user, base ? `${base}/areas` : null, [base]);
  const [form, setForm] = useState(initialForm); const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('todos'); const [areaFilter, setAreaFilter] = useState('todos'); const [notice, setNotice] = useState('');
  const reload = () => ticketsQ.reload();
  async function save(event: FormEvent) { event.preventDefault(); if (!user || !base) return; try { await authenticatedFetch(user, `${base}/tickets`, { method: 'POST', body: JSON.stringify({ ...form, status: 'abierto' }) }); setForm(initialForm); setShowCreate(false); setNotice('Ticket creado.'); await reload(); } catch (error) { setNotice(error instanceof Error ? error.message : 'No pudimos crear el ticket.'); } }
  async function move(ticket: Ticket, status: string) { if (!user || !base) return; await authenticatedFetch(user, `${base}/tickets/${ticket.id}`, { method: 'PUT', body: JSON.stringify({ ...ticket, status }) }); await reload(); }
  async function remove(ticket: Ticket) { if (!user || !base || !window.confirm(`¿Eliminar el ticket “${ticket.title}”?`)) return; await authenticatedFetch(user, `${base}/tickets/${ticket.id}`, { method: 'DELETE' }); await reload(); }
  if (!enabledAddons.smartPlanner) return null;
  const rows = (ticketsQ.data ?? []).filter((ticket) => (filter === 'todos' || ticket.status === filter) && (areaFilter === 'todos' || ticket.assignedArea === areaFilter));
  return <PageContainer><Stack gap="lg"><HeroBanner icon="doc" eyebrow="SOPORTE INTERNO" title="Tickets" subtitle="Ordená solicitudes y seguimiento entre áreas." ctaLabel="Nuevo ticket" onCtaClick={() => setShowCreate(true)} />
    <ContentPanel icon="list" title="Solicitudes" subtitle="Filtrá y actualizá cada pedido del cuartel."><Stack gap="sm"><Inline gap="sm"><SelectControl ariaLabel="Filtrar por estado" label="Todos los estados" value={filter} onChange={setFilter} options={[{ value: 'todos', label: 'Todos los estados' }, { value: 'abierto', label: 'Abiertos' }, { value: 'en_progreso', label: 'En progreso' }, { value: 'resuelto', label: 'Resueltos' }]} /><SelectControl ariaLabel="Filtrar por área" label="Todas las áreas" value={areaFilter} onChange={setAreaFilter} options={[{ value: 'todos', label: 'Todas las áreas' }, ...(areasQ.data ?? []).map((area) => ({ value: area.id, label: area.name }))]} /></Inline>{rows.map((ticket) => <article className="sp-project" key={ticket.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{ticket.title}</strong><small>{ticket.description || 'Sin descripción'} · {ticket.status}</small></Stack><Inline gap="xs" wrap><button type="button" className="btn btn-outline-primary" onClick={() => void move(ticket, 'en_progreso')}>En progreso</button><button type="button" className="btn btn-outline-success" onClick={() => void move(ticket, 'resuelto')}>Resolver</button><button type="button" className="btn btn-outline-danger" onClick={() => void remove(ticket)}>Eliminar</button></Inline></Inline></article>)}{!rows.length && <small className="text-muted">No hay tickets para los filtros elegidos.</small>}{notice && <div className="alert alert-info mb-0" role="status">{notice}</div>}</Stack></ContentPanel>
    <Modal show={showCreate} onHide={() => setShowCreate(false)}><form onSubmit={save}><Modal.Header closeButton><Modal.Title>Nuevo ticket</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><input aria-label="Título de ticket" className="form-control" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Título de la solicitud" required /><textarea aria-label="Descripción de ticket" className="form-control" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Contexto y detalle" /><SelectControl ariaLabel="Área asignada" label="Área asignada" value={form.assignedArea} onChange={(assignedArea) => setForm({ ...form, assignedArea })} options={[{ value: '', label: 'Área asignada', disabled: true }, ...(areasQ.data ?? []).map((area) => ({ value: area.id, label: area.name }))]} /><SelectControl ariaLabel="Prioridad del ticket" label="Prioridad media" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} options={[{ value: 'baja', label: 'Prioridad baja' }, { value: 'media', label: 'Prioridad media' }, { value: 'alta', label: 'Prioridad alta' }]} /></Stack></Modal.Body><Modal.Footer><PrimaryButton type="submit" icon="plus">Crear ticket</PrimaryButton></Modal.Footer></form></Modal>
  </Stack></PageContainer>;
}
