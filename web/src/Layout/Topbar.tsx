import { THEME_MODE } from '../Common/layoutConfig';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import { chanageLanguage } from '../toolkit/themeLayouts/thunk';
import i18n from '../utils/i18n';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch } from '../lib/api';
import { useEffect, useState } from 'react';
import NotificationInbox from '../components/NotificationInbox';
import AppLauncher from '../components/AppLauncher';

interface HeaderProps { themeMode?: string; changeThemeMode?: any; toogleSidebarHide?: () => void; toogleMobileSidebarHide?: () => void; handleOffcanvasToggle?: () => void; }
export default function TopBar({ changeThemeMode, toogleSidebarHide, toogleMobileSidebarHide }: HeaderProps) {
  const dispatch = useDispatch<any>(); const { user, logout } = useAuth(); const navigate = useNavigate(); const [role, setRole] = useState('Cliente');
  useEffect(() => { if (user) void authenticatedFetch(user, '/api/me').then((data: { role?: string }) => setRole(data.role ?? 'Cliente')).catch(() => setRole('Cliente')); }, [user]);
  const handleLogout = async () => { await logout(); navigate('/'); };
  const userName = user?.displayName ?? user?.email ?? 'Usuario';
  return <header className="pc-header"><div className="header-wrapper"><div className="me-auto pc-mob-drp"><ul className="list-unstyled"><li className="pc-h-item pc-sidebar-collapse"><Link to="#" className="pc-head-link ms-0" onClick={toogleSidebarHide}><i className="ti ti-menu-2" /></Link></li><li className="pc-h-item pc-sidebar-popup"><Link to="#" className="pc-head-link ms-0" onClick={toogleMobileSidebarHide}><i className="ti ti-menu-2" /></Link></li></ul></div><div className="ms-auto"><ul className="list-unstyled"><AppLauncher /><Dropdown as="li" className="pc-h-item d-none d-md-inline-flex"><Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#"><i className="ph-duotone ph-sun-dim" /></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.DARK))}>Modo oscuro</Dropdown.Item><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.LIGHT))}>Modo claro</Dropdown.Item></Dropdown.Menu></Dropdown><Dropdown as="li" className="pc-h-item d-none d-md-inline-flex"><Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#"><i className="ph-duotone ph-translate" /></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><Dropdown.Item onClick={() => { dispatch(chanageLanguage('es')); i18n.changeLanguage('es'); }}>Español</Dropdown.Item><Dropdown.Item onClick={() => { dispatch(chanageLanguage('en')); i18n.changeLanguage('en'); }}>English</Dropdown.Item></Dropdown.Menu></Dropdown><NotificationInbox /><Dropdown as="li" className="pc-h-item"><Dropdown.Toggle as="a" className="pc-head-link arrow-none me-0" href="#"><span className="avtar avtar-s bg-light-primary"><i className="ph-duotone ph-user" /></span></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><div className="dropdown-header"><h5 className="mb-1 text-truncate">{userName}</h5><p className="mb-0 text-muted text-truncate">{user?.email} · {role}</p></div><Dropdown.Divider /><Dropdown.Item onClick={handleLogout}><i className="ph-duotone ph-power me-2" />Cerrar sesión</Dropdown.Item></Dropdown.Menu></Dropdown></ul></div></div></header>;
}
