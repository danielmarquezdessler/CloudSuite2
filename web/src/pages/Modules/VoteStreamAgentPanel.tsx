import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useActiveCampaign } from '../../context/CampaignContext';
import { authenticatedFetch, useAuthenticatedQuery } from '../../lib/api';
import { Toast } from '../../components/Toast';
import ContentPanel from '../../components/Shared/ContentPanel';
import EmptyState from '../../components/Shared/EmptyState';
import HeroBanner from '../../components/Shared/HeroBanner';
import Inline from '../../components/Shared/Inline';
import PageContainer from '../../components/Shared/PageContainer';
import PrimaryButton from '../../components/Shared/PrimaryButton';
import SelectControl from '../../components/Shared/SelectControl';
import Stack from '../../components/Shared/Stack';

type Option = { id: string; name: string };
type Candidate = { id: string; name: string; party?: string | null; photoUrl?: string | null };
type AgentVoteStream = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: 'activa' | 'pendiente' | 'cerrada';
  candidates: Candidate[];
  subLocations: Option[];
  genderOptions: Option[];
  ageRanges: Option[];
};
type Submission = {
  id: string;
  submittedAt?: string;
  createdAt?: string;
  votesByCandidate: Record<string, number>;
  subLocationId?: string;
  genderId?: string;
  ageRangeId?: string;
};
type Notice = { message: string; variant: 'success' | 'error' };

const statusCopy: Record<AgentVoteStream['status'], { title: string; description: string }> = {
  activa: { title: 'Activas', description: 'Podés enviar resultados en este momento.' },
  pendiente: { title: 'Pendientes', description: 'Esta Vote Stream aún no fue activada.' },
  cerrada: { title: 'Cerradas', description: 'La jornada terminó y solo conserva consulta.' }
};

function CandidateAvatar({ candidate }: { candidate: Candidate }) {
  if (candidate.photoUrl) return <img className="vote-avatar vote-avatar--large" src={candidate.photoUrl} alt="" />;
  return <span className="vote-avatar vote-avatar--large" aria-hidden>{candidate.name.slice(0, 2).toUpperCase() || '?'}</span>;
}

function StreamGroup({ status, streams, onSelect }: { status: AgentVoteStream['status']; streams: AgentVoteStream[]; onSelect: (stream: AgentVoteStream) => void }) {
  const copy = statusCopy[status];
  return <ContentPanel icon={status === 'activa' ? 'target' : 'calendar'} title={copy.title} subtitle={copy.description}>
    {streams.length === 0 ? <EmptyState icon="target" title={`No hay Vote Streams ${copy.title.toLowerCase()}`} description={status === 'activa' ? 'Cuando te asignen una jornada activa, vas a poder cargar resultados desde acá.' : copy.description} /> : <Stack gap="sm">
      {streams.map((stream) => <article className="vote-agent-stream" key={stream.id} data-card="true">
        <Inline gap="md" wrap className="justify-content-between align-items-center">
          <Stack gap="xs">
            <Inline gap="xs" wrap className="align-items-center"><strong>{stream.name}</strong><span className={`vote-status is-${stream.status}`}>{stream.status}</span></Inline>
            <small className="text-muted">{stream.location} · {stream.date} · {stream.candidates.length} candidatos</small>
          </Stack>
          {status === 'activa' ? <PrimaryButton icon="plus" onClick={() => onSelect(stream)}>Cargar resultados</PrimaryButton> : <small className="vote-agent-stream__hint">{copy.description}</small>}
        </Inline>
      </article>)}
    </Stack>}
  </ContentPanel>;
}

function optionItems(options: Option[]) { return [{ value: '', label: 'Sin especificar' }, ...options.map((option) => ({ value: option.id, label: option.name }))]; }

export default function VoteStreamAgentPanel() {
  const { user } = useAuth();
  const { organizationId, activeCampaignId, enabledAddons } = useActiveCampaign();
  const base = organizationId && activeCampaignId ? `/api/organizations/${organizationId}/campaigns/${activeCampaignId}/vote-stream` : null;
  const streamsQ = useAuthenticatedQuery<AgentVoteStream[]>(user, enabledAddons.voteStream && base ? `${base}/mine` : null, [base, enabledAddons.voteStream]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => streamsQ.data?.find((stream) => stream.id === selectedId) ?? null, [selectedId, streamsQ.data]);
  const submissionsQ = useAuthenticatedQuery<Submission[]>(user, selected && base ? `${base}/${selected.id}/my-submissions` : null, [base, selected?.id]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [subLocationId, setSubLocationId] = useState('');
  const [genderId, setGenderId] = useState('');
  const [ageRangeId, setAgeRangeId] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!selected) return;
    setVotes(Object.fromEntries(selected.candidates.map((candidate) => [candidate.id, ''])));
    setSubLocationId('');
    setGenderId('');
    setAgeRangeId('');
  }, [selected]);

  const streams = streamsQ.data ?? [];
  const grouped = (status: AgentVoteStream['status']) => streams.filter((stream) => stream.status === status);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !base || !selected) return;
    const votesByCandidate = Object.fromEntries(Object.entries(votes).map(([candidateId, value]) => [candidateId, Number(value || 0)]).filter(([, value]) => Number(value) > 0)) as Record<string, number>;
    if (Object.keys(votesByCandidate).length === 0) {
      setNotice({ message: 'Ingresá al menos un resultado mayor a 0 antes de enviar.', variant: 'error' });
      return;
    }
    setSending(true);
    try {
      await authenticatedFetch(user, `${base}/${selected.id}/submissions`, { method: 'POST', body: JSON.stringify({ votesByCandidate, subLocationId: subLocationId || undefined, genderId: genderId || undefined, ageRangeId: ageRangeId || undefined }) });
      const summary = Object.entries(votesByCandidate).map(([candidateId, value]) => `${selected.candidates.find((candidate) => candidate.id === candidateId)?.name ?? 'Candidato'}: ${value}`).join(' · ');
      setVotes(Object.fromEntries(selected.candidates.map((candidate) => [candidate.id, ''])));
      setSubLocationId('');
      setGenderId('');
      setAgeRangeId('');
      await submissionsQ.reload();
      setNotice({ message: `Envío registrado: ${summary}. Podés cargar una nueva tanda.`, variant: 'success' });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : 'No pudimos enviar los resultados.', variant: 'error' });
    } finally { setSending(false); }
  };

  if (!enabledAddons.voteStream) return <PageContainer><EmptyState icon="target" title="Vote Stream no está habilitado" description="Pedile a un administrador global que habilite este add-on." /></PageContainer>;
  if (streamsQ.loading) return <PageContainer aria-busy="true" aria-label="Panel de Sondeo" />;

  return <PageContainer><Stack gap="lg">
    <HeroBanner icon="target" eyebrow="AGENTE DE SONDEO" title="Mi panel de Sondeo" subtitle="Cargá resultados de las jornadas donde estás asignado y consultá tus propios envíos." tags={[{ icon: 'target', label: `${grouped('activa').length} activas` }, { icon: 'calendar', label: `${streams.length} asignadas` }]} />
    {!streams.length ? <EmptyState icon="target" title="Todavía no tenés Vote Streams asignadas" description="Cuando te asignen como agente de sondeo, las jornadas aparecerán aquí." /> : <Stack gap="lg">
      <StreamGroup status="activa" streams={grouped('activa')} onSelect={(stream) => setSelectedId(stream.id)} />
      <StreamGroup status="pendiente" streams={grouped('pendiente')} onSelect={(stream) => setSelectedId(stream.id)} />
      <StreamGroup status="cerrada" streams={grouped('cerrada')} onSelect={(stream) => setSelectedId(stream.id)} />
    </Stack>}
    {selected && <Stack gap="lg" data-agent-vote-stream-form>
      <ContentPanel icon="bar-chart-2" title={`Cargar resultados · ${selected.name}`} subtitle="Cada envío queda registrado a tu nombre y podés enviar tantas tandas como necesites.">
        <form onSubmit={send}><Stack gap="lg">
          <div className="vote-agent-candidate-grid">{selected.candidates.map((candidate) => <Inline gap="sm" className="vote-agent-candidate" key={candidate.id}>
            <CandidateAvatar candidate={candidate} />
            <Stack gap="xs" className="vote-agent-candidate__copy"><strong>{candidate.name}</strong><small className="text-muted">{candidate.party || 'Partido no informado'}</small></Stack>
            <input aria-label={`Votos para ${candidate.name}`} type="number" min="0" inputMode="numeric" className="form-control vote-agent-candidate__input" value={votes[candidate.id] ?? ''} onChange={(event) => setVotes((current) => ({ ...current, [candidate.id]: event.target.value }))} placeholder="0" />
          </Inline>)}</div>
          <Inline gap="md" wrap className="vote-agent-segments">
            {selected.subLocations.length > 0 && <Stack gap="xs"><label className="form-label mb-0">Sub-ubicación</label><SelectControl ariaLabel="Sub-ubicación" label="Sub-ubicación" value={subLocationId} onChange={setSubLocationId} options={optionItems(selected.subLocations)} /></Stack>}
            {selected.genderOptions.length > 0 && <Stack gap="xs"><label className="form-label mb-0">Género</label><SelectControl ariaLabel="Género" label="Género" value={genderId} onChange={setGenderId} options={optionItems(selected.genderOptions)} /></Stack>}
            {selected.ageRanges.length > 0 && <Stack gap="xs"><label className="form-label mb-0">Rango de edad</label><SelectControl ariaLabel="Rango de edad" label="Rango de edad" value={ageRangeId} onChange={setAgeRangeId} options={optionItems(selected.ageRanges)} /></Stack>}
          </Inline>
          <Inline gap="sm" wrap className="align-items-center"><PrimaryButton icon="check" type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Confirmar y enviar'}</PrimaryButton><button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedId(null)} disabled={sending}>Cerrar formulario</button></Inline>
        </Stack></form>
      </ContentPanel>
      <ContentPanel icon="calendar" title="Mis envíos" subtitle="Solo vos podés consultar este historial de carga.">
        {submissionsQ.loading ? <div aria-busy="true" /> : submissionsQ.data?.length ? <Stack gap="sm">{submissionsQ.data.map((submission) => <article className="vote-agent-submission" key={submission.id} data-card="true"><Stack gap="xs"><small className="text-muted">{new Date(submission.submittedAt ?? submission.createdAt ?? '').toLocaleString('es-AR')}</small><Inline gap="xs" wrap>{Object.entries(submission.votesByCandidate ?? {}).map(([candidateId, amount]) => <span className="vote-agent-submission__vote" key={candidateId}>{selected.candidates.find((candidate) => candidate.id === candidateId)?.name ?? 'Candidato'}: <strong>{amount}</strong></span>)}</Inline><small className="text-muted">{[selected.subLocations.find((option) => option.id === submission.subLocationId)?.name, selected.genderOptions.find((option) => option.id === submission.genderId)?.name, selected.ageRanges.find((option) => option.id === submission.ageRangeId)?.name].filter(Boolean).join(' · ') || 'Sin segmentación adicional'}</small></Stack></article>)}</Stack> : <EmptyState icon="calendar" title="Todavía no enviaste resultados" description="Tu historial aparecerá aquí después del primer envío." />}
      </ContentPanel>
    </Stack>}
    {notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}
  </Stack></PageContainer>;
}
