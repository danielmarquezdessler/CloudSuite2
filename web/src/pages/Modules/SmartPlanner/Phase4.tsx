import { FormEvent, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import { firestore } from '../../../lib/firebase';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';
import PrimaryButton from '../../../components/Shared/PrimaryButton';

type Item = { id: string; name?: string; title?: string; description?: string; status?: string; time?: string; reason?: string; generatedTaskIds?: string[] };
type ProtocolTask = { title: string; areaId: string; assignedRole: string };
const blankTask = (): ProtocolTask => ({ title: '', areaId: '', assignedRole: 'operativo' });

export function WarRoom() {
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const { enabledAddons } = useActiveCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const protocols = useAuthenticatedQuery<Item[]>(user, base ? `${base}/crisis-protocols` : null, [base]);
  const activations = useAuthenticatedQuery<Item[]>(user, base ? `${base}/crisis-activations` : null, [base]);
  const areas = useAuthenticatedQuery<Item[]>(user, base ? `${base}/areas` : null, [base]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<ProtocolTask[]>([blankTask()]);
  const updateTask = (index: number, key: keyof ProtocolTask, value: string) => setTasks((current) => current.map((task, position) => position === index ? { ...task, [key]: value } : task));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !base) return;
    const validTasks = tasks.filter((task) => task.title.trim() && task.areaId);
    if (!validTasks.length) return;
    await authenticatedFetch(user, `${base}/crisis-protocols`, { method: 'POST', body: JSON.stringify({ name, description, taskTemplates: validTasks.map((task) => ({ ...task, assignedTo: user.uid, description: 'Tarea disparada por protocolo de crisis' })) }) });
    setName(''); setDescription(''); setTasks([blankTask()]); await protocols.reload();
  };
  const activate = async (item: Item) => {
    const reason = window.prompt('Motivo de activación');
    if (reason && user && base) { await authenticatedFetch(user, `${base}/crisis-protocols/${item.id}/activate`, { method: 'POST', body: JSON.stringify({ reason }) }); await activations.reload(); }
  };
  if (!enabledAddons.smartPlanner) return null;
  return <PageContainer><Stack gap="lg">
    <HeroBanner icon="alert" eyebrow="WAR ROOM" title="Motor de Crisis" subtitle="Activá protocolos y dispará tareas de alta prioridad en segundos." />
    <ContentPanel icon="alert" title="Nuevo protocolo" subtitle="Definí cada acción, el área responsable y el rol que debe ejecutarla.">
      <form onSubmit={save}><Stack gap="md">
        <input aria-label="Nombre del protocolo" className="form-control" value={name} onChange={(event) => setName(event.target.value)} placeholder="Protocolo Crisis X" required />
        <textarea aria-label="Descripción del protocolo" className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
        <Stack gap="sm">{tasks.map((task, index) => <Inline gap="sm" className="sp-protocol-task" key={index}>
          <input aria-label={`Tarea ${index + 1}`} className="form-control" value={task.title} onChange={(event) => updateTask(index, 'title', event.target.value)} placeholder="Acción a ejecutar" required />
          <select aria-label={`Área de tarea ${index + 1}`} className="form-select" value={task.areaId} onChange={(event) => updateTask(index, 'areaId', event.target.value)} required><option value="">Área responsable</option>{(areas.data ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
          <select aria-label={`Rol de tarea ${index + 1}`} className="form-select" value={task.assignedRole} onChange={(event) => updateTask(index, 'assignedRole', event.target.value)}><option value="operativo">Operativo</option><option value="legal">Jurídico</option><option value="prensa">Prensa</option><option value="diseño">Diseño</option><option value="coordinacion">Coordinación</option></select>
          {tasks.length > 1 && <button type="button" className="btn btn-outline-danger" aria-label={`Quitar tarea ${index + 1}`} onClick={() => setTasks((current) => current.filter((_, position) => position !== index))}>×</button>}
        </Inline>)}</Stack>
        <Inline gap="sm"><button type="button" className="btn btn-outline-primary" onClick={() => setTasks((current) => [...current, blankTask()])}>+ Agregar tarea</button><PrimaryButton type="submit" icon="plus">Crear protocolo</PrimaryButton></Inline>
      </Stack></form>
    </ContentPanel>
    <ContentPanel icon="alert" title="Protocolos configurados" subtitle="La activación genera tareas rastreables con prioridad alta."><Stack gap="sm">{(protocols.data ?? []).map((item) => <article className="sp-project" key={item.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{item.name}</strong><small>{item.description}</small></Stack><button className="btn btn-danger" onClick={() => void activate(item)}>🚨 Activar protocolo</button></Inline></article>)}</Stack></ContentPanel>
    <ContentPanel icon="clock" title="Activaciones recientes"><Stack gap="sm">{(activations.data ?? []).map((item) => <div key={item.id}><strong>{item.reason}</strong><small> · {item.generatedTaskIds?.length ?? 0} tareas generadas</small></div>)}</Stack></ContentPanel>
  </Stack></PageContainer>;
}

export function Promises() {
  const { user } = useAuth(); const { campaign } = useCampaign(); const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const promises = useAuthenticatedQuery<Item[]>(user, base ? `${base}/promises` : null, [base]); const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const call = async (item: Item, action: string) => { if (!user || !base) return; const reason = action === 'reject' ? window.prompt('Motivo del rechazo') : ''; await authenticatedFetch(user, `${base}/promises/${item.id}/${action}`, { method: 'POST', body: JSON.stringify(action === 'reject' ? { reason } : { createTask: true }) }); await promises.reload(); };
  return <PageContainer><Stack gap="lg"><HeroBanner icon="check" eyebrow="VIABILIDAD JURÍDICA" title="Propuestas de campaña" subtitle="Validá cada compromiso antes de comunicarlo." />
    <ContentPanel icon="plus" title="Nueva propuesta"><form onSubmit={async (event) => { event.preventDefault(); if (user && base) { await authenticatedFetch(user, `${base}/promises`, { method: 'POST', body: JSON.stringify({ title, description }) }); setTitle(''); setDescription(''); await promises.reload(); } }}><Stack gap="sm"><input aria-label="Título de propuesta" className="form-control" value={title} onChange={(event) => setTitle(event.target.value)} required /><textarea aria-label="Descripción de propuesta" className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} /><PrimaryButton type="submit">Guardar propuesta</PrimaryButton></Stack></form></ContentPanel>
    <ContentPanel icon="doc" title="Flujo legal"><Stack gap="sm">{(promises.data ?? []).map((item) => <article className="sp-project" key={item.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{item.title}</strong><small>{item.status}</small></Stack><Inline gap="xs">{item.status === 'propuesta' && <button className="btn btn-outline-primary" onClick={() => void call(item, 'submit-legal-review')}>Enviar a revisión</button>}{item.status === 'en_revision_legal' && <><button className="btn btn-success" onClick={() => void call(item, 'approve')}>Aprobar y difundir</button><button className="btn btn-outline-danger" onClick={() => void call(item, 'reject')}>Rechazar</button></>}</Inline></Inline></article>)}</Stack></ContentPanel>
  </Stack></PageContainer>;
}

export function ElectionDay() {
  const { user } = useAuth(); const { campaign } = useCampaign(); const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const initial = useAuthenticatedQuery<Item[]>(user, base ? `${base}/election-day-tasks` : null, [base]); const [live, setLive] = useState<Item[]>([]); const [liveError, setLiveError] = useState(false);
  useEffect(() => { if (!campaign) return; setLiveError(false); return onSnapshot(query(collection(firestore, 'organizations', campaign.orgId, 'campaigns', campaign.campId, 'spElectionDayTasks'), orderBy('time')), (snapshot) => { setLive(snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as Item))); setLiveError(false); }, () => setLiveError(true)); }, [campaign?.orgId, campaign?.campId]);
  const rows = live.length ? live : (initial.data ?? []); const done = async (item: Item) => { if (user && base) await authenticatedFetch(user, `${base}/election-day-tasks/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, status: item.status === 'completada' ? 'pendiente' : 'completada', category: 'otro' }) }); };
  return <PageContainer><Stack gap="lg"><HeroBanner icon="clock" eyebrow="DÍA D" title="Panel del Día D" subtitle="Línea operativa en tiempo real para la jornada electoral." tags={[{ icon: 'activity', label: liveError ? 'Reconectando actualización en vivo' : 'Actualización en vivo' }]} />{liveError && <div className="alert alert-warning mb-0" role="status">No pudimos conectar la actualización en vivo. El cronograma sigue disponible y se reintentará automáticamente.</div>}<ContentPanel icon="clock" title="Cronograma operativo" subtitle="Cada cambio se sincroniza automáticamente para todo el equipo."><Stack gap="md">{rows.map((item) => <article className={`sp-project ${item.status === 'completada' ? 'border-success' : ''}`} key={item.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{item.time} · {item.title}</strong><small>{item.status === 'completada' ? 'Completada' : 'Pendiente'}</small></Stack><button className="btn btn-outline-success" onClick={() => void done(item)}>{item.status === 'completada' ? 'Reabrir' : 'Marcar completada'}</button></Inline></article>)}</Stack></ContentPanel></Stack></PageContainer>;
}
