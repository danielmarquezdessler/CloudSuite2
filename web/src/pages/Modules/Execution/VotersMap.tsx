import { useEffect, useMemo, useState } from 'react';
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
import Inline from '../../../components/Shared/Inline';
import Stack from '../../../components/Shared/Stack';

type Voter = {
  id: string;
  name: string;
  address?: string;
  section?: string;
  lat?: number | null;
  lng?: number | null;
  state: string;
  createdAt?: string | { _seconds?: number; seconds?: number };
};
type LayerName = 'electors' | 'zones' | 'territories' | 'routes';

const timestamp = (value: Voter['createdAt']) => {
  if (typeof value === 'string') return new Date(value).getTime();
  if (value && typeof value === 'object') return Number(value._seconds ?? value.seconds ?? 0) * 1000;
  return 0;
};

const weeklyTrend = (voters: Voter[], metric: (item: Voter) => boolean) => {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const current = voters.filter((item) => metric(item) && timestamp(item.createdAt) >= now - week).length;
  const previous = voters.filter((item) => metric(item) && timestamp(item.createdAt) >= now - 2 * week && timestamp(item.createdAt) < now - week).length;
  if (!current && !previous) return 'Sin variación semanal';
  if (!previous) return `+${current} esta semana`;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? '+' : ''}${change}% vs. semana anterior`;
};

export default function VotersMap() {
  const { user, campaign, error: campaignError, reload: reloadCampaign } = useCampaign();
  const [search, setSearch] = useState('');
  const [layers, setLayers] = useState<Record<LayerName, boolean>>({ electors: true, zones: false, territories: false, routes: false });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters` : null;
  const { data, error, loading, reload } = useAuthenticatedQuery<Voter[]>(user, path, [campaign?.orgId, campaign?.campId]);
  const voters = data ?? [];

  useEffect(() => {
    if (data) setUpdatedAt(new Date());
  }, [data]);

  const points = useMemo(() => voters.filter((voter): voter is Voter & { lat: number; lng: number } => typeof voter.lat === 'number' && typeof voter.lng === 'number' && voter.name.toLowerCase().includes(search.toLowerCase())), [voters, search]);
  const zones = new Set(voters.map(voter => voter.section).filter(Boolean)).size;
  const coverage = voters.length ? Math.round(points.length / voters.length * 100) : 0;
  const activeLayers = Object.values(layers).filter(Boolean).length;
  const loadError = campaignError || error?.message;
  const mapPoints = layers.electors ? points : [];
  const toggleLayer = (layer: LayerName) => setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  const summary = coverage >= 80
    ? 'Excelente cobertura territorial en la zona seleccionada.'
    : coverage >= 50
      ? 'La cobertura es buena; completá las direcciones pendientes para mejorarla.'
      : 'Cobertura territorial inicial: priorizá geolocalizar las direcciones pendientes.';
  const summaryTone = coverage >= 80 ? 'is-success' : coverage >= 50 ? 'is-neutral' : 'is-warning';
  const lastUpdated = updatedAt ? `Hoy, ${updatedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Actualizando…';

  const mapChips = <Inline gap="sm" className="cs-map-quick-stats" role="region" aria-label="Resumen del mapa">
    <span><b>{points.length}</b> electores</span>
    <span><b>{coverage}%</b> geolocalizados</span>
    <span><b>{activeLayers}</b> capa{activeLayers === 1 ? '' : 's'} activa{activeLayers === 1 ? '' : 's'}</span>
  </Inline>;

  return <PageContainer>
    <Stack gap="lg" className="cs-voters-map">
      <HeroBanner
        eyebrow="INTELIGENCIA TERRITORIAL"
        icon="map"
        title="Mapa de electores"
        subtitle="Visualizá la distribución territorial de tus electores en Córdoba, Argentina."
        subtitleDetail="Identificá zonas de mayor oportunidad, planificá recorridos y tomá mejores decisiones en territorio."
        tags={[{ icon:'map-pin', label:'Córdoba, Argentina' }, { icon:'calendar', label:'Últimos 30 días' }, { icon:'users', label:'Todos los electores' }]}
        ctaLabel="Exportar mapa"
        ctaIcon="download"
      />
      <div className="cd-dashboard__kpis">
        <StatCard icon="users" value={voters.length} label="Total de electores" caption={weeklyTrend(voters, () => true)} captionColor="#16a34a" />
        <StatCard icon="map-pin" iconColor="green" value={points.length} label="Puntos en el mapa" caption={weeklyTrend(voters, item => typeof item.lat === 'number' && typeof item.lng === 'number')} captionColor="#16a34a" />
        <StatCard icon="map" iconColor="purple" value={zones} label="Zonas con electores" caption={zones ? `${zones} secciones activas` : 'Sin datos aún'} />
        <StatCard icon="target" iconColor="orange" value={`${coverage}%`} label="Cobertura territorial" caption={coverage ? 'Electores geolocalizados' : 'Sin información'} progress={coverage} />
      </div>
      {loadError ? <ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña"><EmptyState icon="map" title="No pudimos cargar el mapa" description={loadError} ctaLabel="Reintentar" onCtaClick={() => void (campaignError ? reloadCampaign() : reload())} /></ContentPanel> : <ContentPanel icon="map" title="Mapa de electores" subtitle="Distribución territorial de la campaña" headerAction={<Inline gap="xs" className="cs-map-live"><i aria-hidden="true" />Última actualización: {lastUpdated}</Inline>}><MapContainer floating={<SearchInput className="cs-map-stage__search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar en el mapa…" aria-label="Buscar una ubicación" />} sidebar={<Stack gap="md"><Stack gap="sm"><Inline gap="sm" className="cs-map-sidebar-title"><strong>Capas del mapa</strong><span>{activeLayers} activa{activeLayers === 1 ? '' : 's'}</span></Inline><div className="cd-map-layers"><label><input aria-label="Capa Electores" type="checkbox" checked={layers.electors} onChange={() => toggleLayer('electors')} />Electores <span>{points.length}</span></label><label><input aria-label="Capa Zonas y Barrios" type="checkbox" checked={layers.zones} onChange={() => toggleLayer('zones')} />Zonas / Barrios <span>{zones}</span></label><label><input aria-label="Capa Territorios" type="checkbox" checked={layers.territories} onChange={() => toggleLayer('territories')} />Territorios <span>0</span></label><label><input aria-label="Capa Rutas de visita" type="checkbox" checked={layers.routes} onChange={() => toggleLayer('routes')} />Rutas de visita <span>0</span></label></div></Stack><div className="cd-map-notice"><Stack gap="sm"><strong>Leyenda de estados</strong><p>Gris: sin visita · Azul: visitado · Verde: SI · Rojo: NO · Amarillo: indeciso.</p></Stack></div><section className="cs-territorial-summary" role="region" aria-label="Resumen territorial"><Stack gap="sm"><strong>Resumen territorial</strong><Inline gap="sm" className="cs-territorial-summary__metrics"><span><b>{zones}</b><small>secciones</small></span><span><b>{coverage}%</b><small>cobertura</small></span><span><b>{voters.length - points.length}</b><small>sin ubicar</small></span></Inline><p className={summaryTone}>{summary}</p></Stack></section></Stack>}>{loading ? <EmptyState icon="map" title="Cargando mapa" description="Estamos ubicando los electores de tu campaña." /> : points.length ? <GoogleMapCanvas points={mapPoints} overlay={mapChips} /> : <EmptyState icon="map" title="No hay puntos geolocalizados" description="Importá electores con direcciones válidas para ubicarlos en el mapa." />}</MapContainer></ContentPanel>}
    </Stack>
  </PageContainer>;
}
