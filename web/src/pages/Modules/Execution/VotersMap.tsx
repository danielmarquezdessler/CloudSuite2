import { useMemo, useState } from 'react';
import { useAuthenticatedQuery } from '../../../lib/api';
import { useCampaign } from '../Organization/useCampaign';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import SearchInput from '../../../components/Shared/SearchInput';
import StatCard from '../../../components/Shared/StatCard';
import PageContainer from '../../../components/Shared/PageContainer';
import MapContainer from '../../../components/Planning/MapContainer';
import GoogleMapCanvas from '../../../components/Shared/GoogleMapCanvas';
import Stack from '../../../components/Shared/Stack';

type Voter = { id: string; name: string; address?: string; section?: string; lat?: number | null; lng?: number | null; state: string };

export default function VotersMap() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const [search, setSearch] = useState('');
  const [layers, setLayers] = useState({ electors: true, zones: false, territories: false, routes: false });
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters` : null;
  const { data, error, loading, reload } = useAuthenticatedQuery<Voter[]>(user, path, [campaign?.orgId, campaign?.campId]);
  const voters = data ?? [];
  const points = useMemo(() => voters.filter((voter): voter is Voter & { lat: number; lng: number } => typeof voter.lat === 'number' && typeof voter.lng === 'number' && voter.name.toLowerCase().includes(search.toLowerCase())), [voters, search]);
  const zones = new Set(voters.map(voter => voter.section).filter(Boolean)).size;
  const coverage = voters.length ? Math.round(points.length / voters.length * 100) : 0;
  const loadError = campaignError || error?.message;
  const mapPoints = layers.electors ? points : [];
  const toggleLayer = (layer: keyof typeof layers) => setLayers((current) => ({ ...current, [layer]: !current[layer] }));

  return <PageContainer>
    <HeroBanner icon="map" title="Mapa de electores" subtitle="Visualizá la distribución territorial de tus electores en Córdoba, Argentina." subtitleDetail="Identificá zonas de mayor oportunidad, planificá recorridos y tomá mejores decisiones en territorio." tags={[{ icon:'map-pin', label:'Córdoba, Argentina' }, { icon:'calendar', label:'Últimos 30 días' }, { icon:'users', label:'Todos los electores' }]} ctaLabel="Exportar mapa" ctaIcon="download" />
    <div className="cd-dashboard__kpis">
      <StatCard icon="users" value={voters.length} label="Total de electores" caption={`${Math.max(0, voters.length - points.length)} sin geolocalizar`} />
      <StatCard icon="map-pin" iconColor="green" value={points.length} label="Puntos en el mapa" caption={`${coverage}% del total`} />
      <StatCard icon="grid" iconColor="purple" value={zones} label="Zonas con electores" caption={zones ? 'Secciones activas' : 'Sin datos aún'} />
      <StatCard icon="target" iconColor="orange" value={`${coverage}%`} label="Cobertura territorial" caption={coverage ? 'Electores ubicados' : 'Sin información'} />
    </div>
    {loadError ? <ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña"><EmptyState icon="map" title="No pudimos cargar el mapa" description={loadError} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : reload())} /></ContentPanel> : <ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña"><MapContainer floating={<SearchInput className="cs-map-stage__search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar una ubicación en el mapa…" aria-label="Buscar una ubicación" />} sidebar={<Stack gap="md"><div><h2 className="h6">Capas del mapa</h2><div className="cd-map-layers"><label><input aria-label="Capa Electores" type="checkbox" checked={layers.electors} onChange={() => toggleLayer('electors')} />Electores <span>● {points.length}</span></label><label><input aria-label="Capa Zonas y Barrios" type="checkbox" checked={layers.zones} onChange={() => toggleLayer('zones')} />Zonas / Barrios <span>● {zones}</span></label><label><input aria-label="Capa Territorios" type="checkbox" checked={layers.territories} onChange={() => toggleLayer('territories')} />Territorios <span>● 0</span></label><label><input aria-label="Capa Rutas de visita" type="checkbox" checked={layers.routes} onChange={() => toggleLayer('routes')} />Rutas de visita <span>● 0</span></label></div></div><div className="cd-map-notice"><strong>Leyenda de estados</strong><p>Gris: sin visita · Azul: visitado · Verde: SI · Rojo: NO · Amarillo: indeciso.</p></div></Stack>}>{loading ? <EmptyState icon="map" title="Cargando mapa" description="Estamos ubicando los electores de tu campaña." /> : points.length ? <GoogleMapCanvas points={mapPoints} /> : <EmptyState icon="map" title="No hay puntos geolocalizados" description="Importá electores con direcciones válidas para ubicarlos en el mapa." />}</MapContainer></ContentPanel>}
  </PageContainer>;
}
