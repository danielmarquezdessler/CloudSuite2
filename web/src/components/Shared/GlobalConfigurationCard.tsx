import { FormEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useActiveCampaign } from '../../context/CampaignContext';
import { authenticatedFetch, useAuthenticatedQuery } from '../../lib/api';
import { loadGoogleMapsApi } from './GoogleMapCanvas';
import ContentPanel from './ContentPanel';
import Inline from './Inline';
import PrimaryButton from './PrimaryButton';
import Stack from './Stack';

export type GlobalConfiguration = {
  partyName: string;
  partyAcronym: string;
  partyLogoUrl: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
};

const emptyConfiguration: GlobalConfiguration = { partyName: '', partyAcronym: '', partyLogoUrl: null, address: '', lat: null, lng: null };

function publishGlobalConfiguration(configuration: GlobalConfiguration) {
  window.dispatchEvent(new CustomEvent<GlobalConfiguration>('cloudsuite:global-configuration', { detail: configuration }));
}

/** Organization-wide identity and location. It intentionally lives outside SmartPlanner. */
export default function GlobalConfigurationCard() {
  const { user } = useAuth();
  const { organizationId } = useActiveCampaign();
  const globalPath = organizationId ? `/api/organizations/${organizationId}/global-configuration` : null;
  const globalQ = useAuthenticatedQuery<GlobalConfiguration>(user, globalPath, [globalPath]);
  const [global, setGlobal] = useState<GlobalConfiguration>(emptyConfiguration);
  const [notice, setNotice] = useState('');
  const [placesNotice, setPlacesNotice] = useState('');
  const [placesReady, setPlacesReady] = useState(false);
  const addressInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (globalQ.data) setGlobal(globalQ.data); }, [globalQ.data]);

  useEffect(() => {
    if (!globalPath) return undefined;
    let listener: { remove?: () => void } | undefined;
    let cancelled = false;
    setPlacesReady(false);
    setPlacesNotice('Iniciando sugerencias de Google…');
    const frame = window.requestAnimationFrame(() => {
      void loadGoogleMapsApi().then((maps) => {
        if (cancelled || !addressInput.current) return;
        if (!maps?.places?.Autocomplete) throw new Error('Google Places no terminó de cargar.');
        const autocomplete = new maps.places.Autocomplete(addressInput.current, {
          componentRestrictions: { country: 'ar' }, fields: ['formatted_address', 'geometry'], types: ['address']
        });
        setPlacesReady(true);
        setPlacesNotice('Elegí una sugerencia de Google Maps para fijar la ubicación.');
        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const location = place?.geometry?.location;
          if (!place?.formatted_address || !location) {
            setPlacesNotice('Elegí una sugerencia válida de Google Maps para ubicar el pin.');
            return;
          }
          setGlobal((current) => ({ ...current, address: place.formatted_address, lat: location.lat(), lng: location.lng() }));
          setPlacesNotice('Dirección verificada para el globo.');
        });
      }).catch((reason: unknown) => {
        if (!cancelled) setPlacesNotice(reason instanceof Error ? `${reason.message} Podés guardar la dirección y seleccionar su ubicación más tarde.` : 'Google Places no está disponible ahora. Podés guardar la dirección y seleccionar su ubicación más tarde.');
      });
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); listener?.remove?.(); };
  }, [globalPath]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !globalPath) return;
    setNotice('');
    try {
      const saved = await authenticatedFetch<GlobalConfiguration>(user, globalPath, { method: 'PUT', body: JSON.stringify(global) });
      setGlobal(saved);
      publishGlobalConfiguration(saved);
      setNotice('Configuración global guardada.');
      await globalQ.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No pudimos guardar la configuración global.');
    }
  }

  async function uploadLogo(logo?: File) {
    if (!logo || !user || !globalPath) return;
    setNotice('');
    try {
      const body = new FormData();
      body.set('logo', logo);
      const saved = await authenticatedFetch<{ partyLogoUrl: string }>(user, `${globalPath}/party-logo`, { method: 'POST', body });
      setGlobal((current) => {
        const next = { ...current, partyLogoUrl: saved.partyLogoUrl };
        publishGlobalConfiguration(next);
        return next;
      });
      setNotice('Logo del partido actualizado.');
      await globalQ.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No pudimos subir el logo.');
    }
  }

  return <ContentPanel icon="target" title="Configuración Global" subtitle="Identidad del partido y ubicación principal de la campaña.">
    <form onSubmit={save}>
      <Stack gap="md">
        {notice && <div className={notice.includes('guardada') || notice.includes('actualizado') ? 'alert alert-success mb-0' : 'alert alert-danger mb-0'} role="status">{notice}</div>}
        <Inline gap="sm" wrap>
          <label className="form-label mb-0 flex-grow-1">Partido político<input aria-label="Partido político" className="form-control mt-1" value={global.partyName} onChange={(event) => setGlobal((current) => ({ ...current, partyName: event.target.value }))} placeholder="Nombre del partido" maxLength={120} /></label>
          <label className="form-label mb-0">Sigla<input aria-label="Sigla del partido" className="form-control mt-1" value={global.partyAcronym} onChange={(event) => setGlobal((current) => ({ ...current, partyAcronym: event.target.value }))} placeholder="Ej. PJ" maxLength={24} /></label>
        </Inline>
        <Inline gap="sm" wrap>
          <label className="form-label mb-0 flex-grow-1">Dirección principal<input ref={addressInput} aria-label="Dirección principal" className="form-control mt-1" value={global.address} onChange={(event) => { setGlobal((current) => ({ ...current, address: event.target.value, lat: null, lng: null })); setPlacesNotice('Elegí una sugerencia de Google Maps para fijar la ubicación.'); }} placeholder="Escribí y elegí la dirección en Google Maps" /></label>
          <label className="form-label mb-0">Latitud<input aria-label="Latitud del partido" className="form-control mt-1" type="number" step="any" value={global.lat ?? ''} onChange={(event) => setGlobal((current) => ({ ...current, lat: event.target.value ? Number(event.target.value) : null }))} /></label>
          <label className="form-label mb-0">Longitud<input aria-label="Longitud del partido" className="form-control mt-1" type="number" step="any" value={global.lng ?? ''} onChange={(event) => setGlobal((current) => ({ ...current, lng: event.target.value ? Number(event.target.value) : null }))} /></label>
        </Inline>
        {placesNotice && <small className={placesReady ? 'text-muted' : 'text-danger'} data-places-status={placesReady ? 'ready' : 'loading'}>{placesNotice}</small>}
        <Inline gap="sm" wrap>
          <label className="btn btn-outline-primary mb-0">Subir logo del partido<input className="d-none" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { const logo = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void uploadLogo(logo); }} /></label>
          {global.partyLogoUrl && <img className="sp-global-config__logo" src={global.partyLogoUrl} alt="Logo actual del partido" />}
          <PrimaryButton type="submit">Guardar configuración global</PrimaryButton>
        </Inline>
      </Stack>
    </form>
  </ContentPanel>;
}
