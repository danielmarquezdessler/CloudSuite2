import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { loadGoogleMapsApi } from '../../../components/Shared/GoogleMapCanvas';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';
import Stack from '../../../components/Shared/Stack';
import TagInput from '../../../components/Shared/TagInput';

export type ManualVoterInput = { name: string; phone: string; email: string; address: string; lat: number | null; lng: number | null; barrio: string; dni: string; sexo: string; fechaNacimiento: string; edadAproximada: string; observaciones: string; tags: string[]; householdId: string; confirmSimilar?: boolean };
type ExistingVoter = { id: string; name: string; phone?: string; email?: string; address?: string; lat?: number | null; lng?: number | null; barrio?: string; dni?: string; sexo?: string; fechaNacimiento?: string; edadAproximada?: number | string; observaciones?: string; tags?: string[]; householdId?: string | null };
type Props = { show: boolean; onHide: () => void; onCreate: (values: ManualVoterInput) => Promise<void>; onUpdate?: (voterId: string, values: ManualVoterInput) => Promise<void>; voter?: ExistingVoter | null; existingVoters: ExistingVoter[]; tagSuggestions?: string[] };

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const blank = (): ManualVoterInput => ({ name: '', phone: '', email: '', address: '', lat: null, lng: null, barrio: '', dni: '', sexo: '', fechaNacimiento: '', edadAproximada: '', observaciones: '', tags: [], householdId: '' });
const ageFromDate = (date: string) => {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00`); if (Number.isNaN(birth.getTime())) return null;
  const today = new Date(); let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
};

export default function CreateVoterModal({ show, onHide, onCreate, onUpdate, voter = null, existingVoters, tagSuggestions = [] }: Props) {
  const addressInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ManualVoterInput>(blank);
  const [placesError, setPlacesError] = useState('');
  const [placesReady, setPlacesReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [similar, setSimilar] = useState<ExistingVoter | null>(null);
  const [ageMode, setAgeMode] = useState<'date' | 'approximate'>('date');
  const editing = Boolean(voter);
  const derivedAge = ageFromDate(values.fechaNacimiento);

  useEffect(() => {
    if (!show) return;
    const next = voter ? { name: voter.name, phone: voter.phone ?? '', email: voter.email ?? '', address: voter.address ?? '', lat: voter.lat ?? null, lng: voter.lng ?? null, barrio: voter.barrio ?? '', dni: voter.dni ?? '', sexo: voter.sexo ?? '', fechaNacimiento: voter.fechaNacimiento ?? '', edadAproximada: voter.edadAproximada === undefined || voter.edadAproximada === null ? '' : String(voter.edadAproximada), observaciones: voter.observaciones ?? '', tags: voter.tags ?? [], householdId: voter.householdId ?? '' } : blank();
    setValues(next); setAgeMode(next.edadAproximada ? 'approximate' : 'date'); setPlacesError(''); setPlacesReady(false); setError(''); setSimilar(null);
  }, [show, voter?.id]);

  useEffect(() => {
    if (!show) return;
    let listener: any;
    let cancelled = false;
    let frame = 0;
    // React-Bootstrap mounts the modal content after the render that changes `show`.
    // Deferring one frame ensures the input exists before Google Places is attached.
    frame = window.requestAnimationFrame(() => {
      void loadGoogleMapsApi().then((maps) => {
        if (cancelled || !addressInput.current || !maps?.places?.Autocomplete) return;
        const autocomplete = new maps.places.Autocomplete(addressInput.current, { componentRestrictions: { country: 'ar' }, fields: ['formatted_address', 'geometry'], types: ['address'] });
        setPlacesReady(true);
        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace(); const location = place?.geometry?.location;
          if (!place?.formatted_address || !location) { setPlacesError('No pudimos ubicar esa sugerencia. Podés guardar la dirección manualmente.'); return; }
          setValues((current) => ({ ...current, address: place.formatted_address, lat: location.lat(), lng: location.lng() })); setPlacesError('');
        });
      }).catch((reason: unknown) => {
        if (!cancelled) setPlacesError(reason instanceof Error ? `${reason.message} Podés guardar la dirección manualmente.` : 'Google Places no está disponible. Podés guardar la dirección manualmente.');
      });
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); listener?.remove?.(); };
  }, [show]);

  const close = () => { if (!saving) { setValues(blank()); setError(''); setSimilar(null); onHide(); } };
  const submit = async (confirmed = false) => {
    setError('');
    if (!values.name.trim() || !values.address.trim()) { setError('Completá el nombre y la dirección.'); return; }
    const found = existingVoters.find((item) => item.id !== voter?.id && normalize(item.name) === normalize(values.name) && normalize(item.address ?? '') === normalize(values.address));
    if (found && !confirmed) { setSimilar(found); return; }
    setSaving(true);
    try { if (editing && voter && onUpdate) await onUpdate(voter.id, { ...values, confirmSimilar: confirmed }); else await onCreate({ ...values, confirmSimilar: confirmed }); setValues(blank()); setSimilar(null); onHide(); } catch (caught) { setError(caught instanceof Error ? caught.message : `No pudimos ${editing ? 'actualizar' : 'crear'} el elector.`); } finally { setSaving(false); }
  };

  // Google Places inserts .pac-container under document.body. Disabling Bootstrap's
  // focus trap lets that external suggestion list receive pointer and keyboard input.
  return <Modal show={show} onHide={close} centered enforceFocus={false} aria-labelledby="create-voter-title">
    <Modal.Header closeButton><Modal.Title id="create-voter-title">{editing ? 'Editar elector' : 'Crear elector'}</Modal.Title></Modal.Header>
    <Modal.Body><Stack gap="md">
      <p className="text-muted mb-0">Registrá los datos del elector. La dirección puede guardarse manualmente aunque Google Maps no encuentre una sugerencia.</p>
      {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
      {similar ? <div className="alert alert-warning mb-0"><Stack gap="sm"><span>Ya existe un elector similar: <strong>{similar.name}</strong>. ¿Confirmás que es una persona distinta?</span><Inline gap="sm" wrap><Button variant="outline-secondary" type="button" onClick={() => setSimilar(null)} disabled={saving}>Revisar datos</Button><Button type="button" onClick={() => void submit(true)} disabled={saving}>{saving ? 'Guardando…' : 'Guardar igualmente'}</Button></Inline></Stack></div> : <>
        <div><label className="form-label" htmlFor="voter-name">Nombre completo</label><input id="voter-name" className="form-control" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} autoComplete="name" required autoFocus /></div>
        <div><label className="form-label" htmlFor="voter-address">Dirección</label><input ref={addressInput} id="voter-address" className="form-control" value={values.address} onChange={(event) => { const address = event.target.value; setValues((current) => ({ ...current, address, lat: null, lng: null })); }} placeholder="Empezá a escribir una dirección de Córdoba" autoComplete="off" required /><small className={placesError ? 'text-danger' : 'text-muted'} data-places-status={placesReady ? 'ready' : 'loading'}>{placesError || (values.lat !== null ? 'Dirección verificada y lista para el mapa.' : placesReady ? 'Elegí una sugerencia o guardá esta dirección como texto libre.' : 'Iniciando sugerencias de Google…')}</small></div>
        <div><label className="form-label" htmlFor="voter-neighborhood">Barrio <span className="text-muted">(opcional)</span></label><input id="voter-neighborhood" className="form-control" value={values.barrio} onChange={(event) => setValues((current) => ({ ...current, barrio: event.target.value }))} /></div>
        <div className="row g-3"><div className="col-md-6"><label className="form-label" htmlFor="voter-dni">DNI <span className="text-muted">(opcional)</span></label><input id="voter-dni" className="form-control" value={values.dni} onChange={(event) => setValues((current) => ({ ...current, dni: event.target.value }))} inputMode="numeric" /></div><div className="col-md-6"><label className="form-label" htmlFor="voter-sex">Sexo <span className="text-muted">(opcional)</span></label><SelectControl id="voter-sex" ariaLabel="Sexo" label="Seleccionar" value={values.sexo} options={[{ value:'', label:'Seleccionar' }, { value:'M', label:'Masculino' }, { value:'F', label:'Femenino' }, { value:'X', label:'X' }, { value:'Prefiero no decir', label:'Prefiero no decir' }]} onChange={(sexo) => setValues((current) => ({ ...current, sexo }))} /></div></div>
        <Stack gap="xs"><Inline gap="sm" wrap><span className="form-label mb-0">Edad <span className="text-muted">(opcional)</span></span><button type="button" className={`btn btn-sm ${ageMode === 'date' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => { setAgeMode('date'); setValues((current) => ({ ...current, edadAproximada: '' })); }}>Sé la fecha exacta</button><button type="button" className={`btn btn-sm ${ageMode === 'approximate' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => { setAgeMode('approximate'); setValues((current) => ({ ...current, fechaNacimiento: '' })); }}>Solo sé la edad</button></Inline>{ageMode === 'date' ? <div><label className="form-label" htmlFor="voter-birthdate">Fecha de nacimiento</label><input id="voter-birthdate" type="date" className="form-control" value={values.fechaNacimiento} onChange={(event) => setValues((current) => ({ ...current, fechaNacimiento: event.target.value }))} />{derivedAge !== null && <small className="text-muted">Edad calculada: {derivedAge} años.</small>}</div> : <div><label className="form-label" htmlFor="voter-approximate-age">Edad aproximada</label><input id="voter-approximate-age" type="number" min="0" max="130" className="form-control" value={values.edadAproximada} onChange={(event) => setValues((current) => ({ ...current, edadAproximada: event.target.value }))} /></div>}</Stack>
        <div className="row g-3"><div className="col-md-6"><label className="form-label" htmlFor="voter-phone">Teléfono <span className="text-muted">(opcional)</span></label><input id="voter-phone" className="form-control" value={values.phone} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" /></div><div className="col-md-6"><label className="form-label" htmlFor="voter-email">Email <span className="text-muted">(opcional)</span></label><input id="voter-email" type="email" className="form-control" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></div></div>
        <div><label className="form-label" htmlFor="voter-observations">Observaciones <span className="text-muted">(opcional)</span></label><textarea id="voter-observations" className="form-control" rows={3} value={values.observaciones} onChange={(event) => setValues((current) => ({ ...current, observaciones: event.target.value }))} /></div>
        <TagInput id="voter-tags" value={values.tags} onChange={(tags) => setValues((current) => ({ ...current, tags }))} suggestions={tagSuggestions} />
        {editing && <div><label className="form-label" htmlFor="voter-household">Identificador de hogar <span className="text-muted">(opcional)</span></label><input id="voter-household" className="form-control" value={values.householdId} onChange={(event) => setValues((current) => ({ ...current, householdId: event.target.value }))} placeholder="Automático según la dirección" /><small className="text-muted">Dejalo vacío para que el sistema lo agrupe automáticamente por dirección.</small></div>}
      </>}
    </Stack></Modal.Body>
    <Modal.Footer><Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>{!similar && <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear elector'}</Button>}</Modal.Footer>
  </Modal>;
}
