import { ChangeEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import DropdownPortal from '../components/Shared/DropdownPortal';

type NavLink = { label: string; to: string; description?: string; icon?: string };
type NavGroup = { label: string; items: NavLink[] };

const groups: NavGroup[] = [
  { label: 'Finanzas', items: [{ label: 'Aportantes', to: '/smartplanner/contributors', description: 'Aportes y seguimiento', icon: 'ph-hand-coins' }, { label: 'Proveedores', to: '/smartplanner/providers', description: 'Compras y proveedores', icon: 'ph-storefront' }, { label: 'Facturación', to: '/smartplanner/invoices', description: 'Facturas y vencimientos', icon: 'ph-receipt' }, { label: 'Contratos', to: '/smartplanner/contracts', description: 'Acuerdos y documentación', icon: 'ph-file-text' }, { label: 'Materiales', to: '/smartplanner/materials', description: 'Stock y recursos', icon: 'ph-package' }, { label: 'Presupuesto', to: '/planning/budget', description: 'Tope legal y presupuesto', icon: 'ph-chart-pie-slice' }] },
  { label: 'Operación', items: [{ label: 'Mapa de Avanzada', to: '/smartplanner/operations', description: 'Operación territorial', icon: 'ph-map-trifold' }, { label: 'Asignador de Cuadrillas', to: '/smartplanner/crews', description: 'Equipos en acción', icon: 'ph-users-three' }] },
  { label: 'Crisis y Jurídico', items: [{ label: 'War Room', to: '/smartplanner/war-room', description: 'Protocolos y respuesta', icon: 'ph-siren' }, { label: 'Propuestas', to: '/smartplanner/promises', description: 'Viabilidad jurídica', icon: 'ph-scales' }, { label: 'Día D', to: '/smartplanner/election-day', description: 'Jornada electoral', icon: 'ph-flag-checkered' }] },
  { label: 'Comunicación', items: [{ label: 'Centro de Comunicaciones', to: '/smartplanner/comunicaciones', description: 'Canales y mensajes', icon: 'ph-chat-circle-text' }, { label: 'Tickets', to: '/smartplanner/tickets', description: 'Solicitudes internas', icon: 'ph-ticket' }] }
];

const directLinks: NavLink[] = [{ label: 'Reportes', to: '/smartplanner/reports' }, { label: 'Personal', to: '/smartplanner/staff' }, { label: 'Configuración', to: '/smartplanner/settings' }];
const allLinks = [{ label: 'Home', to: '/smartplanner' }, { label: 'Backlog de Campaña', to: '/smartplanner/backlog' }, ...groups.flatMap((group) => group.items), ...directLinks];

function matchesPath(pathname: string, to: string) {
  return to === '/smartplanner' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

function SmartPlannerNavGroup({ group, active, pathname }: { group: NavGroup; active: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return <span className="sp-secondary-nav__group">
    <button ref={triggerRef} type="button" className={active ? 'is-active' : ''} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}>{group.label}<i className="ph-duotone ph-caret-down" aria-hidden="true" /></button>
    <DropdownPortal open={open} anchorRef={triggerRef} onDismiss={() => setOpen(false)} minWidth={group.items.length > 4 ? 560 : 440} className="sp-secondary-nav__menu">
      <div className="sp-secondary-nav__menu-heading"><small>SMARTPLANNER</small><strong>{group.label}</strong></div>
      {group.items.map((item) => <Link aria-label={item.label} className={`sp-secondary-nav__item${matchesPath(pathname, item.to) ? ' is-active' : ''}`} to={item.to} key={item.to} onClick={() => setOpen(false)}><i className={`ph-duotone ${item.icon ?? 'ph-arrow-right'}`} aria-hidden="true" /><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span><i className="ph-duotone ph-caret-right sp-secondary-nav__item-arrow" aria-hidden="true" /></Link>)}
    </DropdownPortal>
  </span>;
}

export default function SmartPlannerNav() {
  const location = useLocation();
  const navigate = useNavigate();
  if (!location.pathname.startsWith('/smartplanner')) return null;
  const homeActive = location.pathname === '/smartplanner';
  const backlogActive = matchesPath(location.pathname, '/smartplanner/backlog') || matchesPath(location.pathname, '/smartplanner/pbi');
  const activeLink = allLinks.find((item) => matchesPath(location.pathname, item.to));
  const onMobileChange = (event: ChangeEvent<HTMLSelectElement>) => navigate(event.target.value);

  return <nav className="sp-secondary-nav" aria-label="Navegación de SmartPlanner" data-smartplanner-nav>
    <div className="sp-secondary-nav__desktop">
      <Link to="/smartplanner" className={homeActive ? 'is-active' : ''}>Home</Link>
      <Link to="/smartplanner/backlog" className={backlogActive ? 'is-active' : ''}>Backlog de Campaña</Link>
      {groups.map((group) => {
        const active = group.items.some((item) => matchesPath(location.pathname, item.to)) || (group.label === 'Comunicación' && location.pathname === '/smartplanner/chat');
        return <SmartPlannerNavGroup key={group.label} group={group} active={active} pathname={location.pathname} />;
      })}
      {directLinks.map((item) => <Link to={item.to} key={item.to} className={matchesPath(location.pathname, item.to) ? 'is-active' : ''}>{item.label}</Link>)}
    </div>
    <label className="sp-secondary-nav__mobile">
      <span>Sección SmartPlanner</span>
      <select aria-label="Navegación de SmartPlanner" value={activeLink?.to ?? '/smartplanner'} onChange={onMobileChange}>
        <option value="/smartplanner">Home</option>
        <option value="/smartplanner/backlog">Backlog de Campaña</option>
        {groups.map((group) => <optgroup label={group.label} key={group.label}>{group.items.map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}</optgroup>)}
        {directLinks.map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}
      </select>
    </label>
  </nav>;
}
