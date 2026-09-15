import { ChangeEvent } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Link, useLocation, useNavigate } from 'react-router-dom';

type NavLink = { label: string; to: string };
type NavGroup = { label: string; items: NavLink[] };

const groups: NavGroup[] = [
  { label: 'Finanzas', items: [{ label: 'Aportantes', to: '/smartplanner/contributors' }, { label: 'Proveedores', to: '/smartplanner/providers' }, { label: 'Facturación', to: '/smartplanner/invoices' }, { label: 'Contratos', to: '/smartplanner/contracts' }, { label: 'Materiales', to: '/smartplanner/materials' }, { label: 'Presupuesto', to: '/planning/budget' }] },
  { label: 'Operación', items: [{ label: 'Mapa de Avanzada', to: '/smartplanner/operations' }, { label: 'Asignador de Cuadrillas', to: '/smartplanner/crews' }] },
  { label: 'Crisis y Jurídico', items: [{ label: 'War Room', to: '/smartplanner/war-room' }, { label: 'Propuestas', to: '/smartplanner/promises' }, { label: 'Día D', to: '/smartplanner/election-day' }] },
  { label: 'Comunicación', items: [{ label: 'Centro de Comunicaciones', to: '/smartplanner/comunicaciones' }, { label: 'Tickets', to: '/smartplanner/tickets' }] }
];

const directLinks: NavLink[] = [{ label: 'Reportes', to: '/smartplanner/reports' }, { label: 'Personal', to: '/smartplanner/staff' }, { label: 'Configuración', to: '/smartplanner/settings' }];
const allLinks = [{ label: 'Home', to: '/smartplanner' }, { label: 'Cuartel', to: '/smartplanner#smartplanner-board' }, ...groups.flatMap((group) => group.items), ...directLinks];

function matchesPath(pathname: string, to: string) {
  return to === '/smartplanner' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

export default function SmartPlannerNav() {
  const location = useLocation();
  const navigate = useNavigate();
  if (!location.pathname.startsWith('/smartplanner')) return null;
  const homeActive = location.pathname === '/smartplanner' && location.hash !== '#smartplanner-board';
  const cuartelActive = location.pathname === '/smartplanner' && location.hash === '#smartplanner-board';
  const activeLink = cuartelActive
    ? allLinks.find((item) => item.to === '/smartplanner#smartplanner-board')
    : allLinks.find((item) => item.to !== '/smartplanner#smartplanner-board' && matchesPath(location.pathname, item.to));
  const onMobileChange = (event: ChangeEvent<HTMLSelectElement>) => navigate(event.target.value);

  return <nav className="sp-secondary-nav" aria-label="Navegación de SmartPlanner" data-smartplanner-nav>
    <div className="sp-secondary-nav__desktop">
      <Link to="/smartplanner" className={homeActive ? 'is-active' : ''}>Home</Link>
      <Link to="/smartplanner#smartplanner-board" className={cuartelActive ? 'is-active' : ''}>Cuartel</Link>
      {groups.map((group) => {
        const active = group.items.some((item) => matchesPath(location.pathname, item.to)) || (group.label === 'Comunicación' && location.pathname === '/smartplanner/chat');
        return <Dropdown as="span" key={group.label} className="sp-secondary-nav__group">
          <Dropdown.Toggle as="button" type="button" className={active ? 'is-active' : ''}>{group.label}<i className="ph-duotone ph-caret-down" aria-hidden="true" /></Dropdown.Toggle>
          <Dropdown.Menu className="sp-secondary-nav__menu" popperConfig={{ strategy: 'fixed' }}>
            {group.items.map((item) => <Dropdown.Item as={Link} to={item.to} key={item.to} active={matchesPath(location.pathname, item.to)}>{item.label}</Dropdown.Item>)}
          </Dropdown.Menu>
        </Dropdown>;
      })}
      {directLinks.map((item) => <Link to={item.to} key={item.to} className={matchesPath(location.pathname, item.to) ? 'is-active' : ''}>{item.label}</Link>)}
    </div>
    <label className="sp-secondary-nav__mobile">
      <span>Sección SmartPlanner</span>
      <select aria-label="Navegación de SmartPlanner" value={activeLink?.to ?? '/smartplanner'} onChange={onMobileChange}>
        <option value="/smartplanner">Home</option>
        <option value="/smartplanner#smartplanner-board">Cuartel</option>
        {groups.map((group) => <optgroup label={group.label} key={group.label}>{group.items.map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}</optgroup>)}
        {directLinks.map((item) => <option key={item.to} value={item.to}>{item.label}</option>)}
      </select>
    </label>
  </nav>;
}
