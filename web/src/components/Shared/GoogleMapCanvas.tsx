import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

export type GoogleMapPoint = {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  state?: string;
};

type GoogleMapCanvasProps = {
  points: GoogleMapPoint[];
  mode?: 'markers' | 'heatmap';
  compact?: boolean;
  ariaLabel?: string;
  overlay?: ReactNode;
};

type MapsWindow = Window & {
  google?: any;
  gm_authFailure?: () => void;
  __cloudSuiteGoogleMapsReady?: () => void;
};

let mapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string) {
  const mapsWindow = window as MapsWindow;
  if (mapsWindow.google?.maps) return Promise.resolve(mapsWindow.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__cloudSuiteGoogleMapsReady';
    const timeout = window.setTimeout(() => reject(new Error('Google Maps tardó demasiado en responder.')), 15000);
    const previousAuthFailure = mapsWindow.gm_authFailure;
    (mapsWindow as any)[callbackName] = () => {
      window.clearTimeout(timeout);
      resolve(mapsWindow.google?.maps);
    };
    mapsWindow.gm_authFailure = () => {
      window.clearTimeout(timeout);
      reject(new Error('Google Maps rechazó la clave o su restricción de origen.'));
      previousAuthFailure?.();
    };

    const script = document.createElement('script');
    script.id = 'cloudsuite-google-maps';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('No se pudo descargar Google Maps. Revisá la red o la configuración de la API.'));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

/** Loads the same Maps JavaScript API used by the map widgets, including Places. */
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

function markerIcon(maps: any, color: string) {
  return {
    path: "M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z",
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
    scale: 1.25,
    anchor: new maps.Point(12, 32),
  };
}

export default function GoogleMapCanvas({ points, mode = 'markers', compact = false, ariaLabel = 'Mapa de electores', overlay }: GoogleMapCanvasProps) {
  const element = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing'>('loading');
  const [error, setError] = useState('');
  const [renderedMarkerCount, setRenderedMarkerCount] = useState(0);
  const dataKey = useMemo(() => points.map((point) => `${point.id}:${point.lat}:${point.lng}:${point.state ?? ''}`).join('|'), [points]);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey) {
      setStatus('missing');
      return;
    }

    let cancelled = false;
    let overlayInstances: any[] = [];
    let tilesListener: any;
    setStatus('loading');
    setError('');
    setRenderedMarkerCount(0);

    void loadGoogleMaps(apiKey).then((maps) => {
      if (cancelled || !element.current || !maps) return;
      const validPoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      const fallbackCenter = { lat: -31.4167, lng: -64.1833 };
      const map = new maps.Map(element.current, {
        center: validPoints[0] ? { lat: validPoints[0].lat, lng: validPoints[0].lng } : fallbackCenter,
        zoom: validPoints.length === 1 ? 14 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });
      tilesListener = maps.event.addListenerOnce(map, 'tilesloaded', () => {
        if (!cancelled) setStatus('ready');
      });
      const bounds = new maps.LatLngBounds();
      validPoints.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }));

      if (mode === 'heatmap') {
        // Google retiró HeatmapLayer en Maps JavaScript API v3.65. Estas capas
        // nativas de círculos preservan una lectura de densidad sobre datos reales
        // sin depender de una API eliminada: puntos cercanos se superponen e
        // intensifican visualmente la zona con mayor actividad.
        overlayInstances = validPoints.flatMap((point) => {
          const color = markerColor(point.state);
          return [420, 250, 120].map((radius, index) => new maps.Circle({
            map,
            center: { lat: point.lat, lng: point.lng },
            radius,
            fillColor: color,
            fillOpacity: [0.08, 0.14, 0.24][index],
            strokeOpacity: 0,
            clickable: false
          }));
        });
      } else {
        overlayInstances = validPoints.map((point) => new maps.Marker({
          map,
          position: { lat: point.lat, lng: point.lng },
          title: point.name ?? 'Elector',
          icon: markerIcon(maps, markerColor(point.state)),
          zIndex: 1000
        }));
        setRenderedMarkerCount(overlayInstances.length);
      }

      if (validPoints.length > 1) map.fitBounds(bounds, 32);
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'No se pudo iniciar Google Maps.');
      }
    });

    return () => {
      cancelled = true;
      tilesListener?.remove?.();
      overlayInstances.forEach((overlay) => overlay.setMap(null));
      setRenderedMarkerCount(0);
    };
  }, [apiKey, dataKey, mode]);

  const message = status === 'missing'
    ? 'Configurá VITE_GOOGLE_MAPS_API_KEY para visualizar el mapa.'
    : status === 'error' ? error : status === 'loading' ? 'Cargando Google Maps…' : '';

  return <div className={`cs-google-map-shell${compact ? ' cs-google-map-shell--compact' : ''}`}>
    <div ref={element} className="cs-google-map" aria-label={ariaLabel} data-google-map-status={status} data-google-map-marker-count={mode === 'markers' ? renderedMarkerCount : undefined} />
    {overlay && <div className="cs-google-map__overlay">{overlay}</div>}
    {message && <div className="cs-google-map__state" role={status === 'error' ? 'alert' : 'status'}>{message}</div>}
  </div>;
}
