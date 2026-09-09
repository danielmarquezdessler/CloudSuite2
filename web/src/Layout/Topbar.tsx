import { THEME_MODE } from '../Common/layoutConfig';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authenticatedRequest } from '../lib/api';
import AppLauncher from '../components/AppLauncher';
import NotificationInbox from '../components/NotificationInbox';

interface HeaderProps { themeMode?: string; changeThemeMode?: any; toogleSidebarHide?: () => void; toogleMobileSidebarHide?: () => void; handleOffcanvasToggle?: () => void; }
export default function TopBar({ changeThemeMode, toogleSidebarHide, toogleMobileSidebarHide }: HeaderProps) {
  const dispatch = useDispatch<any>(); const { user, logout } = useAuth(); const navigate = useNavigate(); const [role, setRole] = useState('Cliente'); const [search, setSearch] = useState('');
  useEffect(() => { if (user) void authenticatedRequest<{ role?: string }>(user, '/api/me').then(result => setRole(result.data?.role ?? 'Cliente')); }, [user]);
  const handleLogout = async () => { await logout(); navigate('/'); };
  const userName = user?.displayName ?? user?.email ?? 'Usuario';
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); if (search.trim()) navigate(`/electoral-conversion/voters?search=${encodeURIComponent(search.trim())}`); };
  return <header className="pc-header"><div className="header-wrapper"><div className="me-auto pc-mob-drp"><ul className="list-unstyled"><li className="pc-h-item pc-sidebar-collapse"><Link to="#" className="pc-head-link ms-0" onClick={toogleSidebarHide}><i className="ti ti-menu-2" /></Link></li><li className="pc-h-item pc-sidebar-popup"><Link to="#" className="pc-head-link ms-0" onClick={toogleMobileSidebarHide}><i className="ti ti-menu-2" /></Link></li><li className="pc-h-item d-none d-md-inline-flex"><form className="position-relative" onSubmit={submitSearch}><i className="ph-duotone ph-magnifying-glass position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" /><input className="form-control ps-5" aria-label="Buscar electores" placeholder="Buscar elector…" value={search} onChange={event => setSearch(event.target.value)} /></form></li></ul></div><div className="ms-auto"><ul className="list-unstyled"><AppLauncher /><Dropdown as="li" className="pc-h-item d-none d-md-inline-flex"><Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#" aria-label="Tema"><i className="ph-duotone ph-sun-dim" /></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.DARK))}><i className="ph-duotone ph-moon me-2" />Modo oscuro</Dropdown.Item><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.LIGHT))}><i className="ph-duotone ph-sun-dim me-2" />Modo claro</Dropdown.Item></Dropdown.Menu></Dropdown><li className="pc-h-item d-none d-md-inline-flex"><Link to="/settings" className="pc-head-link" aria-label="Configuración"><i className="ph-duotone ph-gear-six" /></Link></li><NotificationInbox /><Dropdown as="li" className="pc-h-item"><Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#" aria-label="Perfil"><span className="avtar avtar-s bg-light-primary"><i className="ph-duotone ph-user" /></span></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><div className="dropdown-header"><h5 className="mb-1 text-truncate">{userName}</h5><p className="mb-0 text-muted text-truncate">{user?.email} · {role}</p></div><Dropdown.Divider /><Dropdown.Item onClick={handleLogout}><i className="ph-duotone ph-power me-2" />Cerrar sesión</Dropdown.Item></Dropdown.Menu></Dropdown></ul></div></div></header>;
}
