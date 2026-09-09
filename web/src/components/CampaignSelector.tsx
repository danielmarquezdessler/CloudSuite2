import { FormEvent, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { useActiveCampaign } from '../context/CampaignContext';
import Card from './Shared/Card';
import Inline from './Shared/Inline';
import Stack from './Shared/Stack';

export default function CampaignSelector() {
  const { activeCampaign, campaigns, loading, role, setActiveCampaignId, createCampaign } = useActiveCampaign();
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const select = (campaignId: string) => { setActiveCampaignId(campaignId); setShow(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try { await createCampaign(name); setName(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos crear la campaña.'); }
    finally { setSaving(false); }
  };

  return <>
    <button type="button" className="cs-campaign-selector" aria-label={`Cambiar campaña activa: ${activeCampaign?.nombre ?? 'Cargando campaña'}`} onClick={() => setShow(true)} disabled={loading || !activeCampaign}>
      <i className="ph-duotone ph-flag cs-campaign-selector__flag" />
      <span className="cs-campaign-selector__name">{activeCampaign?.nombre ?? 'Cargando campaña…'}</span>
      <i className="ph-duotone ph-caret-down cs-campaign-selector__chevron" aria-hidden="true" />
    </button>
    <Modal show={show} onHide={() => !saving && setShow(false)} centered aria-labelledby="campaign-selector-title" dialogClassName="cs-campaign-modal__dialog" contentClassName="cs-campaign-modal">
      <Modal.Header className="cs-campaign-modal__header">
        <Inline gap="lg" className="align-items-center">
          <span className="cs-campaign-modal__title-icon"><i className="ph-duotone ph-flag" /></span>
          <Modal.Title id="campaign-selector-title">Campaña activa</Modal.Title>
        </Inline>
        <button type="button" className="cs-campaign-modal__close" aria-label="Cerrar selector de campaña" onClick={() => setShow(false)} disabled={saving}><span aria-hidden="true">×</span></button>
      </Modal.Header>
      <Modal.Body className="cs-campaign-modal__body">
        <Card className="cs-campaign-modal__panel">
          <Stack gap="lg">
            <p className="cs-campaign-modal__description">Elegí la campaña cuyos datos querés consultar y administrar.</p>
            <Stack gap="sm">
              {campaigns.map((campaign) => <button type="button" key={campaign.id} className={`cs-campaign-option ${campaign.id === activeCampaign?.id ? 'is-active' : ''}`} onClick={() => select(campaign.id)}>
                <span className="cs-campaign-option__icon"><i className="ph-duotone ph-flag" /></span>
                <span className="cs-campaign-option__copy"><strong>{campaign.nombre}</strong><small>{campaign.memberCount} {campaign.memberCount === 1 ? 'miembro' : 'miembros'} · {campaign.voterCount} electores</small></span>
                {campaign.id === activeCampaign?.id && <span className="cs-campaign-option__active"><i className="ph-duotone ph-circle" />Activa</span>}
              </button>)}
            </Stack>
            {role === 'cliente' && <form className="cs-campaign-create" onSubmit={submit}>
              <label htmlFor="navbar-campaign-name">Nueva campaña</label>
              <input id="navbar-campaign-name" placeholder="Ingresá el nombre de la nueva campaña…" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
              {error && <p className="text-danger small mb-0" role="alert">{error}</p>}
              <Inline gap="md" wrap className="cs-campaign-create__actions"><Button className="cs-campaign-create__cancel" variant="outline-secondary" type="button" disabled={saving} onClick={() => { setName(''); setError(''); }}>Cancelar</Button><Button type="submit" disabled={saving}><span className="cs-campaign-create__plus" aria-hidden="true">+</span>{saving ? 'Creando…' : 'Crear campaña'}</Button></Inline>
            </form>}
          </Stack>
        </Card>
      </Modal.Body>
      <Modal.Footer className="cs-campaign-modal__footer"><Button className="cs-campaign-modal__dismiss" variant="outline-secondary" onClick={() => setShow(false)} disabled={saving}>Cerrar</Button></Modal.Footer>
    </Modal>
  </>;
}
