import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { loadGoogleMapsApi } from '../../../components/Shared/GoogleMapCanvas';
import Inline from '../../../components/Shared/Inline';
import Stack from '../../../components/Shared/Stack';
import TagInput from '../../../components/Shared/TagInput';

export type ManualVoterInput = { name: string; phone: string; email: string; address: string; lat: number | null; lng: number | null; tags: string[]; confirmSimilar?: boolean };
type ExistingVoter = { id: string; name: string; phone?: string; email?: string; address?: string; lat?: number | null; lng?: number | null; tags?: string[] };
type Props = { show: boolean; onHide: () => void; onCreate: (values: ManualVoterInput) => Promise<void>; onUpdate?: (voterId: string, values: ManualVoterInput) => Promise<void>; voter?: ExistingVoter | null; existingVoters: ExistingVoter[]; tagSuggestions?: string[] };

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const blank = (): ManualVoterInput => ({ name: '', phone: '', email: '', address: '', lat: null, lng: null, tags: [] });

export default function CreateVoterModal({ show, onHide, onCreate, onUpdate, voter = null, existingVoters, tagSuggestions = [] }: Props) {
  const addressInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ManualVoterInput>(blank);
  const [placesError, setPlacesError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [similar, setSimilar] = useState<ExistingVoter | null>(null);
  const editing = Boolean(voter);

  useEffect(() => {
    if (!show || !addressInput.current) return;
    setValues(voter ? { name: voter.name, phone: voter.phone ?? '', email: voter.email ?? '', address: voter.address ?? '', lat: voter.lat ?? null, lng: voter.lng ?? null, tags: voter.tags ?? [] } : blank());
    let listener: any;
    let cancelled = false;
    setPlacesError('');
    void loadGoogleMapsApi().then((maps) => {
      if (cancelled || !addressInput.current || !maps?.places?.Autocomplete) return;
      const autocomplete = new maps.places.Autocomplete(addressInput.current, {
        componentRestrictions: { country: 'ar' },
        fields: ['formatted_address', 'geometry'],
        types: ['address']
      });
      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const location = place?.geometry?.location;
        if (!place?.formatted_address || !location) {
          setPlacesError('Elegí una dirección de las sugerencias para ubicar al elector en el mapa.');
          return;
        }
        setValues((current) => ({ ...current, address: place.formatted_address, lat: location.lat(), lng: location.lng() }));
        setPlacesError('');
      });
    }).catch((reason: unknown) => {
      if (!cancelled) setPlacesError(reason instanceof Error ? reason.message : 'No pudimos iniciar Google Places.');
    });
    return () => { cancelled = true; listener?.remove?.(); };
  }, [show]);

  const close = () => { if (!saving) { setValues(blank()); setError(''); setSimilar(null); onHide(); } };
  const submit = async (confirmed = false) => {
    setError('');
    if (!values.name.trim() || !values.address.trim()) { setError('Completá el nombre y la dirección.'); return; }
    if (values.lat === null || values.lng === null) { setError('Elegí una dirección de las sugerencias de Google Maps antes de guardar.'); return; }
    const found = existingVoters.find((item) => item.id !== voter?.id && normalize(item.name) === normalize(values.name) && normalize(item.address ?? '') === normalize(values.address));
    if (found && !confirmed) { setSimilar(found); return; }
    setSaving(true);
    try { if (editing && voter && onUpdate) await onUpdate(voter.id, { ...values, confirmSimilar: confirmed }); else await onCreate({ ...values, confirmSimilar: confirmed }); setValues(blank()); setSimilar(null); onHide(); } catch (caught) { setError(caught instanceof Error ? caught.message : `No pudimos ${editing ? 'actualizar' : 'crear'} el elector.`); } finally { setSaving(false); }
  };

  // Google Places mounts its suggestion list under document.body; Bootstrap's
  // default focus trap would immediately hide that external list.
  return <Modal show={show} onHide={close} centered enforceFocus={false} aria-labelledby="create-voter-title">
    <Modal.Header closeButton><Modal.Title id="create-voter-title">{editing ? 'Editar elector' : 'Crear elector'}</Modal.Title></Modal.Header>
    <Modal.Body><Stack gap="md">
      <p className="text-muted mb-0">Registrá un elector y seleccioná su dirección para ubicarlo con precisión en el mapa.</p>
      {error && <div className="alert alert-danger mb-0" role="alert">{error}</div>}
      {similar ? <div className="alert alert-warning mb-0"><Stack gap="sm"><span>Ya existe un elector similar: <strong>{similar.name}</strong>. ¿Confirmás que es una persona distinta?</span><Inline gap="sm" wrap><Button variant="outline-secondary" type="button" onClick={() => setSimilar(null)} disabled={saving}>Revisar datos</Button><Button type="button" onClick={() => void submit(true)} disabled={saving}>{saving ? 'Guardando…' : 'Crear igualmente'}</Button></Inline></Stack></div> : <>
        <div><label className="form-label" htmlFor="voter-name">Nombre completo</label><input id="voter-name" className="form-control" value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} autoComplete="name" required autoFocus /></div>
        <div><label className="form-label" htmlFor="voter-address">Dirección</label><input ref={addressInput} id="voter-address" className="form-control" value={values.address} onChange={(event) => { const address = event.target.value; setValues((current) => ({ ...current, address, lat: null, lng: null })); }} placeholder="Empezá a escribir una dirección de Córdoba" autoComplete="off" required /><small className={placesError ? 'text-danger' : 'text-muted'}>{placesError || (values.lat !== null ? 'Dirección verificada y lista para el mapa.' : 'Elegí una sugerencia de Google Places para confirmar la ubicación.')}</small></div>
        <div className="row g-3"><div className="col-md-6"><label className="form-label" htmlFor="voter-phone">Teléfono <span className="text-muted">(opcional)</span></label><input id="voter-phone" className="form-control" value={values.phone} onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" /></div><div className="col-md-6"><label className="form-label" htmlFor="voter-email">Email <span className="text-muted">(opcional)</span></label><input id="voter-email" type="email" className="form-control" value={values.email} onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))} autoComplete="email" /></div></div>
        <TagInput id="voter-tags" value={values.tags} onChange={(tags) => setValues((current) => ({ ...current, tags }))} suggestions={tagSuggestions} />
      </>}
    </Stack></Modal.Body>
    <Modal.Footer><Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>{!similar && <Button onClick={() => void submit()} disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear elector'}</Button>}</Modal.Footer>
  </Modal>;
}
