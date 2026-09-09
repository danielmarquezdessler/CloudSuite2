import { FormEvent, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { useActiveCampaign } from '../context/CampaignContext';
import Card from './Shared/Card';
import Inline from './Shared/Inline';
import Stack from './Shared/Stack';

export default function CampaignSelector() {
  const { activeCampaign, campaigns, loading, role, setActiveCampaignId, createCampaign } = useActiveCampaign();
  const [show, setShow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const select = (campaignId: string) => { setActiveCampaignId(campaignId); setShow(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try { await createCampaign(name); setName(''); setCreating(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos crear la campaña.'); }
    finally { setSaving(false); }
  };

  return <>
    <button type="button" className="btn btn-sm btn-outline-primary d-none d-md-inline-flex align-items-center gap-2" aria-label={`Cambiar campaña activa: ${activeCampaign?.nombre ?? 'Cargando campaña'}`} onClick={() => setShow(true)} disabled={loading || !activeCampaign}>
      <i className="ph-duotone ph-flag" />
      <span className="text-truncate" style={{ maxWidth: 180 }}>{activeCampaign?.nombre ?? 'Cargando campaña…'}</span>
    </button>
    <Modal show={show} onHide={() => !saving && setShow(false)} centered aria-labelledby="campaign-selector-title">
      <Modal.Header closeButton><Modal.Title id="campaign-selector-title">Campaña activa</Modal.Title></Modal.Header>
      <Modal.Body>
        <Card className="border-0 shadow-none">
          <Stack gap="md">
            <p className="text-muted mb-0">Elegí la campaña cuyos datos querés consultar y administrar.</p>
            {campaigns.map((campaign) => <button type="button" key={campaign.id} className={`list-group-item list-group-item-action rounded border ${campaign.id === activeCampaign?.id ? 'border-primary bg-primary-subtle' : ''}`} onClick={() => select(campaign.id)}>
              <Inline gap="md" className="align-items-center justify-content-between w-100">
                <Stack gap="xs"><strong>{campaign.nombre}</strong><small className="text-muted">{campaign.memberCount} miembros · {campaign.voterCount} electores</small></Stack>
                {campaign.id === activeCampaign?.id && <span className="badge text-bg-primary">Activa</span>}
              </Inline>
            </button>)}
          </Stack>
          {creating && <form className="border-top mt-3 pt-3" onSubmit={submit}>
            <label className="form-label" htmlFor="navbar-campaign-name">Nueva campaña</label>
            <input id="navbar-campaign-name" className="form-control" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus />
            {error && <p className="text-danger small mt-2 mb-0">{error}</p>}
            <Inline gap="sm" className="mt-3"><Button variant="secondary" type="button" disabled={saving} onClick={() => { setCreating(false); setError(''); }}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Creando…' : 'Crear campaña'}</Button></Inline>
          </form>}
        </Card>
      </Modal.Body>
      <Modal.Footer>
        {!creating && role === 'cliente' && <Button variant="outline-primary" onClick={() => setCreating(true)}><i className="ph-duotone ph-plus me-1" />Nueva campaña</Button>}
        <Button variant="secondary" onClick={() => setShow(false)} disabled={saving}>Cerrar</Button>
      </Modal.Footer>
    </Modal>
  </>;
}
