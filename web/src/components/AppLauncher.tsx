import { Dropdown } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

type Shortcut = { label: string; icon: string; path?: string; accent: string; comingSoon?: boolean };
const shortcuts: Shortcut[] = [
  { label: 'Dashboard', icon: 'ph-house-line', path: '/dashboard', accent: '#0060F0' },
  { label: 'Organización', icon: 'ph-users-three', path: '/organization/users', accent: '#0060F0' },
  { label: 'Conversión Electoral', icon: 'ph-check-square-offset', path: '/electoral-conversion/voters', accent: '#D6008C' },
  { label: 'Planificación', icon: 'ph-calendar-check', path: '/planning/questions', accent: '#0060F0' },
  { label: 'Ejecución', icon: 'ph-chart-line-up', path: '/dashboard', accent: '#D6008C' },
  { label: 'Configuración', icon: 'ph-gear-six', path: '/settings', accent: '#0060F0' },
  { label: 'Audit Log', icon: 'ph-clock-counter-clockwise', path: '/control-de-revision', accent: '#D6008C' },
  { label: 'Ballot Box', icon: 'ph-ballot', accent: '#6c757d', comingSoon: true },
  { label: 'SmartPlanner', icon: 'ph-sparkle', accent: '#6c757d', comingSoon: true }
];

export default function AppLauncher() {
  const navigate = useNavigate();
  return <Dropdown as="li" className="pc-h-item cloudsuite-launcher">
    <Dropdown.Toggle as="button" type="button" className="pc-head-link arrow-none me-0 border-0 bg-transparent" aria-label="Abrir módulos"><i className="ph-duotone ph-squares-four" /></Dropdown.Toggle>
    <Dropdown.Menu className="dropdown-menu-end pc-h-dropdown p-2 cloudsuite-launcher-menu">
      <div className="px-2 pt-1 pb-2 d-flex justify-content-between align-items-center"><strong>Módulos CloudSuite</strong><small className="text-muted">Accesos rápidos</small></div>
      <div className="cloudsuite-launcher-grid">{shortcuts.map(shortcut => <button key={shortcut.label} type="button" disabled={shortcut.comingSoon} className={`cloudsuite-launcher-item ${shortcut.comingSoon ? 'is-disabled' : ''}`} onClick={() => shortcut.path && navigate(shortcut.path)}><span className="cloudsuite-launcher-icon" style={{ color: shortcut.accent }}><i className={`ph-duotone ${shortcut.icon}`} /></span><span>{shortcut.label}</span>{shortcut.comingSoon && <small className="badge text-bg-secondary">Próximamente</small>}</button>)}</div>
      <style>{`.cloudsuite-launcher-menu{width:min(420px,calc(100vw - 24px));background:var(--bs-body-bg);border-color:rgba(0,96,240,.18)}.cloudsuite-launcher-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}.cloudsuite-launcher-item{position:relative;min-height:94px;border:1px solid var(--bs-border-color);border-radius:.5rem;background:var(--bs-tertiary-bg);color:var(--bs-body-color);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35rem;font-size:.76rem;font-weight:600;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}.cloudsuite-launcher-item:hover:not(:disabled){border-color:#0060F0;box-shadow:0 .35rem .8rem rgba(0,96,240,.16);transform:translateY(-2px)}.cloudsuite-launcher-icon{font-size:1.55rem}.cloudsuite-launcher-item .badge{position:absolute;top:.3rem;right:.3rem;font-size:.55rem}.cloudsuite-launcher-item.is-disabled{opacity:.55;cursor:not-allowed}@media(max-width:575.98px){.cloudsuite-launcher-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cloudsuite-launcher-item{min-height:82px}}`}</style>
    </Dropdown.Menu>
  </Dropdown>;
}
