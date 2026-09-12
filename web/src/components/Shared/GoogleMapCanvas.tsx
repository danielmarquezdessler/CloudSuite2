import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';

export type GoogleMapPoint = { id: string; lat: number; lng: number; name?: string; address?: string; state?: string };
export type GoogleMapPolygon = { id: string; name: string; polygon: Array<{ lat: number; lng: number }>; highlighted?: boolean };
export type GoogleMapOpportunity = { id: string; lat: number; lng: number; radiusMeters: number; total: number; score: number; highlighted?: boolean };
type GoogleMapCanvasProps = {
  points: GoogleMapPoint[];
  polygons?: GoogleMapPolygon[];
  opportunities?: GoogleMapOpportunity[];
  focusPolygonId?: string | null;
  focusOpportunityId?: string | null;
  mode?: 'markers' | 'heatmap';
  compact?: boolean;
  ariaLabel?: string;
  overlay?: ReactNode;
  drawing?: { enabled: boolean; onPolygonComplete: (polygon: Array<{ lat: number; lng: number }>) => void };
};
type MapsWindow = Window & { google?: any; gm_authFailure?: () => void; __cloudSuiteGoogleMapsReady?: () => void };
let mapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string) {
  const mapsWindow = window as MapsWindow;
  if (mapsWindow.google?.maps) return Promise.resolve(mapsWindow.google.maps);
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__cloudSuiteGoogleMapsReady';
    const timeout = window.setTimeout(() => reject(new Error('Google Maps tardó demasiado en responder.')), 15000);
    const previousAuthFailure = mapsWindow.gm_authFailure;
    (mapsWindow as any)[callbackName] = () => { window.clearTimeout(timeout); resolve(mapsWindow.google?.maps); };
    mapsWindow.gm_authFailure = () => { window.clearTimeout(timeout); reject(new Error('Google Maps rechazó la clave o su restricción de origen.')); previousAuthFailure?.(); };
    const script = document.createElement('script');
    script.id = 'cloudsuite-google-maps'; script.async = true; script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('No se pudo descargar Google Maps. Revisá la red o la configuración de la API.')); };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

/** Loads the Maps JavaScript API used by the map widgets, including Places. */
export function loadGoogleMapsApi() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) return Promise.reject(new Error('Configurá VITE_GOOGLE_MAPS_API_KEY para usar Google Places.'));
  return loadGoogleMaps(apiKey);
}

function markerColor(state?: string) {
  if (state === 'converted_yes') return '#16a34a';
  if (state === 'converted_no') return '#dc2626';
  if (state === 'undecided') return '#eab308';
  if (state && state !== 'unvisited') return '#2563eb';
  return '#94a3b8';
}

export default function GoogleMapCanvas({ points, polygons = [], opportunities = [], focusPolygonId, focusOpportunityId, mode = 'markers', compact = false, ariaLabel = 'Mapa de electores', overlay, drawing }: GoogleMapCanvasProps) {
  const element = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [renderedMarkerCount, setRenderedMarkerCount] = useState(0);
  const dataKey = useMemo(() => points.map(point => `${point.id}:${point.lat}:${point.lng}:${point.name ?? ''}:${point.address ?? ''}:${point.state ?? ''}`).join('|'), [points]);
  const polygonKey = useMemo(() => polygons.map(polygon => `${polygon.id}:${polygon.highlighted}:${polygon.polygon.map(point => `${point.lat},${point.lng}`).join(';')}`).join('|'), [polygons]);
  const opportunityKey = useMemo(() => opportunities.map(opportunity => `${opportunity.id}:${opportunity.lat}:${opportunity.lng}:${opportunity.radiusMeters}:${opportunity.highlighted}`).join('|'), [opportunities]);
  const stateSummary = useMemo(() => Object.entries(points.reduce<Record<string, number>>((states, point) => ({ ...states, [point.state ?? 'unvisited']: (states[point.state ?? 'unvisited'] ?? 0) + 1 }), {})).map(([state, count]) => `${state}:${count}`).join(','), [points]);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey) { setStatus('missing'); return; }
    let cancelled = false;
    let overlays: any[] = [];
    let tilesListener: any;
    let idleListener: any;
    let projectionListener: any;
    let terraDraw: TerraDraw | null = null;
    setStatus('loading'); setError(''); setRenderedMarkerCount(0);

    void loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !element.current || !maps) return;
      const validPoints = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      const map = new maps.Map(element.current, { center: validPoints[0] ? { lat: validPoints[0].lat, lng: validPoints[0].lng } : { lat: -31.4167, lng: -64.1833 }, zoom: validPoints.length === 1 ? 14 : 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      // `tilesloaded` does not fire consistently when tiles are restored from the browser cache.
      // `idle` is emitted when the map has finished its initial render in both cached and cold loads.
      const markReady = () => { if (!cancelled) setStatus('ready'); };
      tilesListener = maps.event.addListenerOnce(map, 'tilesloaded', markReady);
      idleListener = maps.event.addListenerOnce(map, 'idle', markReady);
      const bounds = new maps.LatLngBounds();
      validPoints.forEach(point => bounds.extend({ lat: point.lat, lng: point.lng }));

      if (mode === 'heatmap') {
        // HeatmapLayer fue retirado por Google; círculos concéntricos conservan una lectura de densidad sin una dependencia pesada.
        overlays = validPoints.flatMap(point => [420, 250, 120].map((radius, index) => new maps.Circle({ map, center: { lat: point.lat, lng: point.lng }, radius, fillColor: markerColor(point.state), fillOpacity: [0.08, 0.14, 0.24][index], strokeOpacity: 0, clickable: false })));
      } else {
        const infoWindow = new maps.InfoWindow();
        overlays = validPoints.flatMap(point => {
          const marker = new maps.Marker({ map, position: { lat: point.lat, lng: point.lng }, title: point.name ?? 'Elector', icon: { url: '/img/pin.webp', scaledSize: new maps.Size(48, 48), anchor: new maps.Point(24, 47) }, animation: maps.Animation?.DROP, zIndex: 1000 });
          const stateBadge = new maps.Marker({ map, position: { lat: point.lat, lng: point.lng }, clickable: false, icon: { path: maps.SymbolPath.CIRCLE, fillColor: markerColor(point.state), fillOpacity: 1, strokeColor: '#ffffff', strokeOpacity: 1, strokeWeight: 2, scale: 7, anchor: new maps.Point(0, 28) }, zIndex: 1001 });
          const content = document.createElement('div'); content.className = 'cs-map-elector-tooltip';
          const name = document.createElement('strong'); name.textContent = point.name ?? 'Elector';
          const address = document.createElement('span'); address.textContent = point.address ?? 'Dirección no informada';
          content.append(name, address);
          marker.addListener('click', () => { infoWindow.setContent(content); infoWindow.open(map, marker); });
          return [marker, stateBadge];
        });
        setRenderedMarkerCount(validPoints.length);
      }

      polygons.forEach(item => {
        if (item.polygon.length < 3) return;
        const polygon = new maps.Polygon({ map, paths: item.polygon, fillColor: item.highlighted ? '#0060f0' : '#4b83e6', fillOpacity: item.highlighted ? 0.26 : 0.14, strokeColor: item.highlighted ? '#0049bd' : '#4b83e6', strokeOpacity: 0.95, strokeWeight: item.highlighted ? 3 : 2, clickable: false, zIndex: item.highlighted ? 600 : 400 });
        overlays.push(polygon);
      });
      opportunities.forEach((item) => {
        const circle = new maps.Circle({ map, center: { lat: item.lat, lng: item.lng }, radius: item.radiusMeters, fillColor: item.highlighted ? '#f97316' : '#ef4444', fillOpacity: item.highlighted ? 0.28 : 0.16, strokeColor: item.highlighted ? '#c2410c' : '#dc2626', strokeOpacity: 0.9, strokeWeight: item.highlighted ? 3 : 2, clickable: false, zIndex: item.highlighted ? 650 : 450 });
        overlays.push(circle);
      });
      const focused = polygons.find(item => item.id === focusPolygonId);
      if (focused?.polygon.length) focused.polygon.forEach(point => bounds.extend(point));
      if (!bounds.isEmpty()) map.fitBounds(bounds, 32);
      const focusedOpportunity = opportunities.find(item => item.id === focusOpportunityId);
      if (focusedOpportunity) { map.panTo({ lat: focusedOpportunity.lat, lng: focusedOpportunity.lng }); map.setZoom(15); }

      if (drawing?.enabled) {
        let drawingStarted = false;
        const startTerraDraw = () => {
          // Depending on whether Maps restored its tiles from cache, `projection_changed`
          // can happen before this listener is registered.  `idle` is the reliable
          // fallback after a map is interactive; keep the guard because either event
          // may win on a cold load.
          if (cancelled || drawingStarted) return;
          drawingStarted = true;
          terraDraw = new TerraDraw({
            // Google Maps only emits Data-layer clicks when an existing feature was
            // hit.  A fresh selection starts on the empty canvas, so forward the
            // map element pointer events to Terra Draw as required by its adapter.
            adapter: new TerraDrawGoogleMapsAdapter({ lib: maps, map, coordinatePrecision: 8, forwardMapElementEvents: true }),
            modes: [new TerraDrawPolygonMode({ styles: { fillColor: '#0060f0', fillOpacity: 0.14, outlineColor: '#0060f0', outlineWidth: 3 } })]
          });
          terraDraw.on('finish', (id) => {
            const feature = terraDraw?.getSnapshotFeature(id);
            if (cancelled || feature?.geometry.type !== 'Polygon') return;
            const ring = feature.geometry.coordinates[0] ?? [];
            const coordinates = ring.slice(0, -1).map((position: number[]) => ({ lat: position[1], lng: position[0] }));
            if (coordinates.length >= 3) drawing.onPolygonComplete(coordinates);
          });
          terraDraw.start();
          // `ready` may be emitted synchronously by the adapter, before a listener
          // registered after `start()` can observe it.  Selecting the polygon mode
          // immediately after start is supported by Terra Draw and makes the control
          // usable on both cached and cold Google Maps loads.
          terraDraw.setMode('polygon');
        };
        projectionListener = maps.event.addListenerOnce(map, 'projection_changed', startTerraDraw);
        maps.event.addListenerOnce(map, 'idle', startTerraDraw);
      }
    }).catch((reason: unknown) => { if (!cancelled) { setStatus('error'); setError(reason instanceof Error ? reason.message : 'No se pudo iniciar Google Maps.'); } });

    return () => { cancelled = true; tilesListener?.remove?.(); idleListener?.remove?.(); projectionListener?.remove?.(); terraDraw?.stop(); overlays.forEach(overlay => overlay.setMap?.(null)); setRenderedMarkerCount(0); };
  }, [apiKey, dataKey, polygonKey, opportunityKey, focusPolygonId, focusOpportunityId, mode, drawing?.enabled]);

  const message = status === 'missing' ? 'Configurá VITE_GOOGLE_MAPS_API_KEY para visualizar el mapa.' : status === 'error' ? error : status === 'loading' ? 'Cargando Google Maps…' : '';
  return <div className={`cs-google-map-shell${compact ? ' cs-google-map-shell--compact' : ''}`}>
    <div id="cloudsuite-google-map" ref={element} className="cs-google-map" aria-label={ariaLabel} data-google-map-status={status} data-google-map-marker-count={mode === 'markers' ? renderedMarkerCount : undefined} data-google-map-polygon-count={polygons.length} data-google-map-opportunity-count={opportunities.length} data-google-map-states={stateSummary} />
    {overlay && <div className="cs-google-map__overlay">{overlay}</div>}
    {message && <div className="cs-google-map__state" role={status === 'error' ? 'alert' : 'status'}>{message}</div>}
  </div>;
}
