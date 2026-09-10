import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedQuery } from '../../../lib/api';
import { useCampaign } from '../Organization/useCampaign';
import ImportVoters from '../Organization/Voters/ImportVoters';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import SearchInput from '../../../components/Shared/SearchInput';
import SelectControl from '../../../components/Shared/SelectControl';
import StatCard from '../../../components/Shared/StatCard';
import PageContainer from '../../../components/Shared/PageContainer';
import { cacheVoters, cachedVoters } from '../../../lib/offlineVisits';
import { useOfflineSync } from '../../../context/OfflineSyncContext';

type Voter = { id: string; name: string; phone?: string; address?: string; section?: string; state: string; teamName?: string; lastVisitAt?: string };
const labels: Record<string, string> = { unvisited: 'Listo para visitar', converted_yes: 'Favorable', converted_no: 'No favorable', undecided: 'Indeciso' };

export default function VotersList() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [offlineVoters, setOfflineVoters] = useState<Voter[]>([]);
  const { online } = useOfflineSync();
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters` : null;
  const { data, error, loading, reload: reloadVoters } = useAuthenticatedQuery<Voter[]>(user, path, [campaign?.orgId, campaign?.campId]);
  useEffect(() => { if (campaign) void cachedVoters(campaign.orgId, campaign.campId).then(setOfflineVoters); }, [campaign?.campId, campaign?.orgId]);
  useEffect(() => { if (campaign && data) void cacheVoters(campaign.orgId, campaign.campId, data).then(() => setOfflineVoters(data)); }, [campaign?.campId, campaign?.orgId, data]);
  const voters = (online ? data : offlineVoters) ?? data ?? offlineVoters;
  const visible = useMemo(() => voters.filter(voter => `${voter.name} ${voter.phone ?? ''} ${voter.address ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (!state || voter.state === state)), [voters, search, state]);
  const count = (value: string) => voters.filter(voter => voter.state === value).length;
  const percent = (value: string) => voters.length ? Math.round(count(value) / voters.length * 100) : 0;
  const loadError = online ? campaignError || error?.message : '';

  return <PageContainer>
    <HeroBanner icon="users" title="Electores" subtitle="Importa y prepara tu lista de electores para planificar y realizar visitas de campaña." subtitleDetail="Convierte datos en oportunidades. Organiza, segmenta y asigna electores a tu equipo." tags={[{ icon:'file', label:'Importa desde Excel o CSV' }, { icon:'users', label:'Segmenta y organiza' }, { icon:'user-check', label:'Asigna a tus equipos' }]} ctaLabel="Importar electores" ctaIcon="upload-cloud" onCtaClick={() => setImportOpen(true)} />
    <ImportVoters open={importOpen} onOpenChange={setImportOpen} showTrigger={false} onImported={() => void reloadVoters()} />

    <div className="cd-dashboard__kpis">
      <StatCard icon="users" value={voters.length} label="Total de electores" caption={voters.length ? `${voters.length} registros cargados` : 'Sin registros aún'} />
      <StatCard icon="check-circle" iconColor="green" value={count('unvisited')} label="Listos para visitar" caption={`${percent('unvisited')}% del total`} progress={percent('unvisited')} />
      <StatCard icon="help-circle" iconColor="orange" value={count('undecided')} label="Indecisos" caption={`${percent('undecided')}% del total`} progress={percent('undecided')} />
      <StatCard icon="user-x" iconColor="red" value={count('converted_no')} label="No favorables" caption={`${percent('converted_no')}% del total`} progress={percent('converted_no')} />
    </div>

    <div className="cd-page-controls" aria-label="Filtros de electores">
      <SearchInput value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar elector por nombre, teléfono, dirección o sección…" aria-label="Buscar elector" />
      <SelectControl ariaLabel="Estado" label={labels[state] ?? 'Todos los estados'} options={[{ value:'', label:'Todos los estados' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} value={state} onChange={setState} />
      <SelectControl icon="people" label="Todos los equipos" />
      <SelectControl icon="map" label="Todas las secciones" />
      <button className="cd-filter-more" type="button">Más filtros</button>
    </div>

    <ContentPanel icon="users" title="Lista de electores" subtitle="Gestiona tu base de electores, asigna segmentos y prepara tus visitas." headerAction={<span className="cd-panel-count">{voters.length} electores</span>}>
      {loadError ? <EmptyState icon="users" title="No pudimos cargar los electores" description={loadError} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : reloadVoters())} /> : loading && online ? <EmptyState icon="users" title="Cargando electores" description="Estamos preparando la lista de tu campaña." /> : visible.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>NOMBRE</th><th>TELÉFONO</th><th>DIRECCIÓN</th><th>SECCIÓN</th><th>ESTADO</th><th>EQUIPO</th><th>ÚLTIMA VISITA</th><th>ACCIONES</th></tr></thead><tbody>{visible.map(voter => <tr key={voter.id}><td>{voter.name}</td><td>{voter.phone || '—'}</td><td>{voter.address || '—'}</td><td>{voter.section || '—'}</td><td><span className="cd-state-pill">{labels[voter.state] ?? voter.state}</span></td><td>{voter.teamName || '—'}</td><td>{voter.lastVisitAt ? new Date(voter.lastVisitAt).toLocaleDateString('es-AR') : '—'}</td><td><button className="btn btn-sm btn-primary" onClick={() => navigate(`/visit/${voter.id}`)}>Visitar</button></td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="Aún no hay electores para mostrar" description="Importa tu lista de electores desde un archivo Excel o CSV para comenzar a organizar y planificar tus visitas de campaña." ctaLabel="Importar electores" onCtaClick={() => setImportOpen(true)} />}
      <footer className="cd-table-footer"><span>Mostrando {visible.length} de {voters.length} electores</span><span>Filas por página&nbsp;&nbsp; 10</span></footer>
    </ContentPanel>
  </PageContainer>;
}
