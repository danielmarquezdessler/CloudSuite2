import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedQuery } from '../../../lib/api';
import { useCampaign } from '../Organization/useCampaign';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import SearchInput from '../../../components/Shared/SearchInput';
import StatCard from '../../../components/Shared/StatCard';

type Voter = { id: string; name: string; address?: string; section?: string; lat?: number | null; lng?: number | null; state: string };

export default function VotersMap() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters` : null;
  const { data, error, loading, reload } = useAuthenticatedQuery<Voter[]>(user, path, [campaign?.orgId, campaign?.campId]);
  const voters = data ?? [];
  const points = useMemo(() => voters.filter(voter => voter.lat != null && voter.lng != null && voter.name.toLowerCase().includes(search.toLowerCase())), [voters, search]);
  const zones = new Set(voters.map(voter => voter.section).filter(Boolean)).size;
  const coverage = voters.length ? Math.round(points.length / voters.length * 100) : 0;
  const loadError = campaignError || error?.message;

  return <section className="cd-page cs-page">
    <HeroBanner icon="map" title="Mapa de electores" subtitle="Visualizá la distribución territorial de tus electores en Córdoba, Argentina." subtitleDetail="Identificá zonas de mayor oportunidad, planificá recorridos y tomá mejores decisiones en territorio." tags={[{ icon:'map-pin', label:'Córdoba, Argentina' }, { icon:'calendar', label:'Últimos 30 días' }, { icon:'users', label:'Todos los electores' }]} ctaLabel="Exportar mapa" ctaIcon="download" />
    <div className="cd-dashboard__kpis">
      <StatCard icon="users" value={voters.length} label="Total de electores" caption={`${Math.max(0, voters.length - points.length)} sin geolocalizar`} />
      <StatCard icon="map-pin" iconColor="green" value={points.length} label="Puntos en el mapa" caption={`${coverage}% del total`} />
      <StatCard icon="grid" iconColor="purple" value={zones} label="Zonas con electores" caption={zones ? 'Secciones activas' : 'Sin datos aún'} />
      <StatCard icon="target" iconColor="orange" value={`${coverage}%`} label="Cobertura territorial" caption={coverage ? 'Electores ubicados' : 'Sin información'} />
    </div>
    {loadError ? <ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña"><EmptyState icon="map" title="No pudimos cargar el mapa" description={loadError} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : reload())} /></ContentPanel> : <div className="row g-3">
      <div className="col-xl-9"><ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña"><div className="cs-map-stage"><SearchInput className="cs-map-stage__search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar una ubicación en el mapa…" aria-label="Buscar una ubicación" /><div className="cs-map-stage__controls" aria-hidden="true">⊞<br />＋<br />−<br />◎</div>{loading ? <EmptyState icon="map" title="Cargando mapa" description="Estamos ubicando los electores de tu campaña." /> : points.length ? <>{points.map((voter, index) => <span className="cs-map-stage__point" key={voter.id} style={{ left:`${12 + index * 17 % 75}%`, top:`${17 + index * 23 % 65}%` }} title={voter.name} />)}<span className="cs-map-stage__label">Córdoba</span></> : <EmptyState icon="map" title="No hay puntos geolocalizados" description="Aún no se han registrado electores con ubicación. Para visualizarlos en el mapa es necesario configurar la API de Google Maps." ctaLabel="Configurar Google Maps" onCtaClick={() => navigate('/settings')} />}</div></ContentPanel></div>
      <div className="col-xl-3 d-grid gap-3"><ContentPanel icon="map" title="Capas del mapa"><div className="cd-map-layers"><label><input type="checkbox" defaultChecked />Electores <span>● {points.length}</span></label><label><input type="checkbox" />Zonas / Barrios <span>● {zones}</span></label><label><input type="checkbox" />Territorios <span>● 0</span></label><label><input type="checkbox" />Rutas de visita <span>● 0</span></label></div></ContentPanel><ContentPanel icon="pie-chart" title="Leyenda"><EmptyState icon="map" title="Sin datos para mostrar" description="Cuando tengas electores geolocalizados, aquí se mostrará la leyenda de colores y categorías." /></ContentPanel><ContentPanel icon="settings" title="Configuración requerida"><div className="cd-map-notice"><p>Para mostrar electores en el mapa, necesitás configurar la clave de Google Maps API en la configuración de la plataforma.</p><button type="button" className="btn btn-light btn-sm" onClick={() => navigate('/settings')}>Ir a configuración →</button></div></ContentPanel></div>
    </div>}
  </section>;
}
