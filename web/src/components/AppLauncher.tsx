import { Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useActiveCampaign } from '../context/CampaignContext';
import Card from './Shared/Card';
import Inline from './Shared/Inline';
import Stack from './Shared/Stack';

type Addon = { label: string; subtitle: string; icon: string; accent: string; path?: string; href?: string; comingSoon?: boolean; gated?: 'smartPlanner' | 'voteStream' };

const addons: Addon[] = [
  { label: 'SmartPlanner', subtitle: 'Planificación profesional', icon: 'ph-sparkle', accent: 'var(--bs-primary)', path: '/smartplanner', gated: 'smartPlanner' },
  { label: 'Vote Stream', subtitle: 'Resultados electorales en tiempo real', icon: 'ph-ballot', accent: 'var(--bs-secondary)', path: '/vote-stream', gated: 'voteStream' },
  { label: 'Civica Pulse', subtitle: 'Software de Inteligencia Política profesional', icon: 'ph-activity', accent: 'var(--bs-success)', href: 'https://civicapulse.com/' },
  { label: 'Governo Hub', subtitle: 'Sistema de gestión de gobiernos locales', icon: 'ph-buildings', accent: 'var(--bs-primary)', href: 'http://governohub.com/' },
  { label: 'Termómetro Comunitario', subtitle: 'Sistema de medición de opinión pública y focus group', icon: 'ph-thermometer', accent: 'var(--bs-warning)', href: 'https://termometrocomunitario.programascomunitarios.org' },
  { label: 'Apolo', subtitle: 'Estudio de entrenamiento y comunicación política', icon: 'ph-microphone-stage', accent: 'var(--bs-danger)', href: 'http://apolo.politicfy.com/' },
  { label: 'Lazzarus', subtitle: 'Empleados digitales autónomos para gobierno y campañas electorales', icon: 'ph-robot', accent: 'var(--bs-info)', href: 'https://lazzarusapp.com/' }
];

export default function AppLauncher() {
  const navigate = useNavigate();
  const { enabledAddons } = useActiveCampaign();
  return <Dropdown as="li" className="pc-h-item cloudsuite-launcher">
    <Dropdown.Toggle as="button" type="button" className="pc-head-link arrow-none me-0 border-0 bg-transparent" aria-label="Abrir addons"><i className="ph-duotone ph-squares-four" /></Dropdown.Toggle>
    <Dropdown.Menu className="dropdown-menu-end pc-h-dropdown p-2 cloudsuite-launcher-menu">
      <Inline gap="sm" className="cloudsuite-launcher__header justify-content-between align-items-center"><strong>Addons</strong><small className="text-muted">Productos Politicfy</small></Inline>
      <div className="cloudsuite-launcher-grid d-grid gap-2">{addons.map((addon) => {
        const comingSoon = addon.gated ? !enabledAddons[addon.gated] : Boolean(addon.comingSoon);
        const content = <Stack gap="xs" className="cloudsuite-launcher-item__content"><span className="cloudsuite-launcher-icon" style={{ color: addon.accent }}><i className={`ph-duotone ${addon.icon}`} /></span><Stack gap="xs" className="cloudsuite-launcher-item__copy"><Inline gap="xs" className="align-items-center cloudsuite-launcher-item__title"><span>{addon.label}</span>{addon.href && <i className="ph-duotone ph-arrow-square-out" aria-label="Abre en una pestaña nueva" />}</Inline><small className="text-muted">{addon.subtitle}</small></Stack></Stack>;
        return <Card key={addon.label} className={`cloudsuite-launcher-card h-100 ${comingSoon ? 'is-disabled' : ''}`}>{comingSoon ? <button type="button" disabled aria-disabled="true" className="cloudsuite-launcher-item" title={`${addon.label} estará disponible próximamente.`}>{content}<small className="badge text-bg-secondary">Próximamente</small></button> : addon.href ? <a className="cloudsuite-launcher-item" href={addon.href} target="_blank" rel="noopener noreferrer">{content}</a> : <button type="button" className="cloudsuite-launcher-item" onClick={() => addon.path && navigate(addon.path)}>{content}</button>}</Card>;
      })}</div>
      <style>{`.cloudsuite-launcher-menu{width:min(980px,calc(100vw - 28px));background:var(--bs-body-bg);border-color:rgba(var(--bs-primary-rgb),.18)}.cloudsuite-launcher__header{padding:.25rem .5rem .75rem}.cloudsuite-launcher-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.cloudsuite-launcher-card{min-width:0}.cloudsuite-launcher-card .cd-card__body{height:100%;padding:0}.cloudsuite-launcher-item{position:relative;width:100%;height:100%;min-height:112px;border:0;border-radius:inherit;background:transparent;color:var(--bs-body-color);display:block;padding:1rem;text-align:left;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.cloudsuite-launcher-item:hover:not(:disabled){background:var(--bs-tertiary-bg);box-shadow:0 .35rem .8rem rgba(var(--bs-primary-rgb),.12);transform:translateY(-2px);color:var(--bs-body-color)}.cloudsuite-launcher-item:focus-visible{outline:2px solid var(--bs-primary);outline-offset:2px}.cloudsuite-launcher-item__content{height:100%;align-items:flex-start}.cloudsuite-launcher-icon{font-size:1.65rem;line-height:1}.cloudsuite-launcher-item__copy{min-width:0}.cloudsuite-launcher-item__title{font-size:.86rem;font-weight:700;line-height:1.2}.cloudsuite-launcher-item__title i{font-size:.78rem;color:var(--bs-gray-600)}.cloudsuite-launcher-item__copy small{font-size:.7rem;line-height:1.35}.cloudsuite-launcher-item .badge{position:absolute;top:.5rem;right:.5rem;font-size:.55rem}.cloudsuite-launcher-card.is-disabled{opacity:.62}.cloudsuite-launcher-card.is-disabled .cloudsuite-launcher-item{cursor:not-allowed}@media(max-width:767.98px){.cloudsuite-launcher-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cloudsuite-launcher-item{min-height:104px}}@media(max-width:575.98px){.cloudsuite-launcher-grid{grid-template-columns:1fr}}`}</style>
    </Dropdown.Menu>
  </Dropdown>;
}
