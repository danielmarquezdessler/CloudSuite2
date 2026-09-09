import { FormEvent, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import SearchInput from '../../../components/Shared/SearchInput';
import StatCard from '../../../components/Shared/StatCard';
import PageContainer from '../../../components/Shared/PageContainer';
import { useCampaign } from './useCampaign';

type Team = { id: string; name: string; description?: string; leaderId?: string | null; memberCount?: number; territoryCount?: number };
type Member = { uid: string; displayName?: string; email: string };
const suggestedStructures = [
  ['Equipo por territorio', 'Organizá colaboradores por zonas geográficas.'],
  ['Equipo por tarea', 'Creá equipos enfocados en visitas, encuestas o logística.'],
  ['Equipo mixto', 'Combiná territorios y tareas según tus necesidades.'],
];

export default function Teams() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const [form, setForm] = useState({ name: '', description: '', leaderId: '' });
  const [editing, setEditing] = useState<Team | null>(null); const [show, setShow] = useState(false); const [actionError, setActionError] = useState(''); const [search, setSearch] = useState('');
  const basePath = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}` : null;
  const teamsQuery = useAuthenticatedQuery<Team[]>(user, basePath ? `${basePath}/teams` : null, [campaign?.orgId, campaign?.campId]);
  const membersQuery = useAuthenticatedQuery<Member[]>(user, basePath ? `${basePath}/members` : null, [campaign?.orgId, campaign?.campId]);
  const teams = teamsQuery.data ?? []; const members = membersQuery.data ?? [];
  const filtered = teams.filter(team => `${team.name} ${team.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const failure = campaignError || teamsQuery.error?.message || membersQuery.error?.message || actionError;
  const reload = async () => { await Promise.all([teamsQuery.reload(), membersQuery.reload()]); };
  const open = (team?: Team) => { setActionError(''); setEditing(team ?? null); setForm(team ? { name: team.name, description: team.description ?? '', leaderId: team.leaderId ?? '' } : { name: '', description: '', leaderId: '' }); setShow(true); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!user || !basePath) return; try { await authenticatedFetch(user, editing ? `${basePath}/teams/${editing.id}` : `${basePath}/teams`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, leaderId: form.leaderId || null }) }); setShow(false); setActionError(''); await reload(); } catch (caught) { setActionError(caught instanceof Error ? caught.message : 'No pudimos guardar el equipo.'); } };
  const remove = async (team: Team) => { if (!user || !basePath || !confirm(`¿Borrar ${team.name}?`)) return; try { await authenticatedFetch(user, `${basePath}/teams/${team.id}`, { method: 'DELETE' }); setActionError(''); await reload(); } catch (caught) { setActionError(caught instanceof Error ? caught.message : 'No pudimos borrar el equipo.'); } };
  const totalMembers = teams.reduce((total, team) => total + (team.memberCount ?? 0), 0);
  const territories = teams.reduce((total, team) => total + (team.territoryCount ?? 0), 0);
  return <PageContainer>
    <HeroBanner icon="users" title="Equipos" subtitle="Organizá a tus colaboradores por territorio o tarea." subtitleDetail="Creá equipos, asigná miembros, definí responsabilidades y potenciá el trabajo en campo." tags={[{ icon:'map-pin', label:'Trabajo en equipo' }, { icon:'trending-up', label:'Mejores resultados' }, { icon:'bars', label:'Campañas más fuertes' }]} ctaLabel="Crear nuevo equipo" onCtaClick={() => open()} />
    <div className="cd-dashboard__kpis"><StatCard icon="users" value={teams.length} label="Total de equipos" caption={teams.length ? 'Equipos activos en campaña' : 'Aún no hay equipos'} /><StatCard icon="users" iconColor="green" value={totalMembers} label="Miembros totales" caption="Colaboradores organizados" /><StatCard icon="map" iconColor="purple" value={territories} label="Territorios asignados" caption="Zonas de trabajo" /><StatCard icon="target" iconColor="orange" value={teams.length ? 1 : 0} label="Metas con equipos" caption="Campañas activas" /></div>
    {failure ? <ContentPanel icon="users" title="Tus equipos de campaña" subtitle="Gestioná el trabajo de tus colaboradores."><EmptyState icon="users" title="No pudimos cargar los equipos" description={failure} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : reload())} /></ContentPanel> : <div className="row g-3"><div className="col-xl-8"><ContentPanel icon="users" title="Tus equipos de campaña" subtitle="Gestioná, visualizá y coordiná el trabajo de tus colaboradores." headerAction={<SearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar equipo…" aria-label="Buscar equipo" />}>
      {teamsQuery.loading || membersQuery.loading ? <EmptyState icon="users" title="Cargando equipos" description="Estamos preparando la organización de tu campaña." /> : filtered.length ? <div className="row g-3">{filtered.map(team => <div className="col-md-6" key={team.id}><article className="cd-team-card h-100"><div><h3>{team.name}</h3><p>{team.description || 'Sin descripción todavía.'}</p><small>Líder: {members.find(member => member.uid === team.leaderId)?.displayName || members.find(member => member.uid === team.leaderId)?.email || 'Sin asignar'}</small></div><div className="d-flex justify-content-between align-items-center gap-2 mt-3"><span className="cd-state-pill">{team.memberCount ?? 0} miembros</span><span><Button size="sm" variant="outline-primary" onClick={() => open(team)}>Editar</Button>{' '}<Button size="sm" variant="outline-danger" onClick={() => void remove(team)}>Borrar</Button></span></div></article></div>)}</div> : <EmptyState icon="users" title="Aún no tenés equipos creados" description="Organizá a tus colaboradores por territorio o tarea para comenzar a trabajar de forma más eficiente." ctaLabel="Crear nuevo equipo" onCtaClick={() => open()} />}
    </ContentPanel></div><div className="col-xl-4 d-grid gap-3"><ContentPanel icon="award" title="Estructuras sugeridas" subtitle="Modelos comunes de organización para tu campaña."><div className="d-grid gap-2">{suggestedStructures.map(([name, description]) => <button className="cd-suggestion" type="button" key={name} onClick={() => { setForm({ name, description:'', leaderId:'' }); setEditing(null); setShow(true); }}><strong>{name}</strong><small>{description}</small></button>)}</div></ContentPanel><ContentPanel icon="map" title="Gestión de territorios" subtitle="Asigná equipos a territorios para una mejor cobertura."><div className="cd-map-notice"><p>{teams.length ? 'Seleccioná un equipo para organizar su cobertura territorial.' : 'Primero creá tus equipos. Después podrás asignarles territorios y visualizar su cobertura en el mapa.'}</p></div></ContentPanel></div></div>}
    <Modal show={show} onHide={() => setShow(false)}><form onSubmit={submit}><Modal.Header closeButton><Modal.Title>{editing ? 'Editar equipo' : 'Crear nuevo equipo'}</Modal.Title></Modal.Header><Modal.Body><label className="form-label">Nombre</label><input className="form-control mb-3" value={form.name} onChange={event => setForm({ ...form, name:event.target.value })} required /><label className="form-label">Descripción</label><textarea className="form-control mb-3" value={form.description} onChange={event => setForm({ ...form, description:event.target.value })} /><label className="form-label">Líder</label><select className="form-select" value={form.leaderId} onChange={event => setForm({ ...form, leaderId:event.target.value })}><option value="">Sin asignar</option>{members.map(member => <option key={member.uid} value={member.uid}>{member.displayName || member.email}</option>)}</select></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setShow(false)}>Cancelar</Button><Button type="submit">Guardar</Button></Modal.Footer></form></Modal>
  </PageContainer>;
}
