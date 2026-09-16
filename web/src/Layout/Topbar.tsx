import { THEME_MODE } from '../Common/layoutConfig';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useActiveCampaign } from '../context/CampaignContext';
import { authenticatedRequest } from '../lib/api';
import AppLauncher from '../components/AppLauncher';
import NotificationInbox from '../components/NotificationInbox';
import CampaignSelector from '../components/CampaignSelector';

interface HeaderProps { themeMode?: string; changeThemeMode?: any; toogleSidebarHide?: () => void; toogleMobileSidebarHide?: () => void; handleOffcanvasToggle?: () => void; }

export default function TopBar({ changeThemeMode, toogleSidebarHide, toogleMobileSidebarHide }: HeaderProps) {
  const dispatch = useDispatch<any>();
  const { user, logout } = useAuth();
  const { role, organizationId } = useActiveCampaign();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const handleLogout = async () => { await logout(); navigate('/'); };
  const userName = user?.displayName ?? user?.email ?? 'Usuario';
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.photoURL ?? null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';

  useEffect(() => {
    if (!user || !organizationId) {
      setAvatarUrl(user?.photoURL ?? null);
      return;
    }
    void authenticatedRequest<Array<{ uid: string; photoURL?: string | null }>>(user, `/api/organizations/${organizationId}/users`)
      .then((result) => setAvatarUrl(result.data?.find((person) => person.uid === user.uid)?.photoURL ?? user.photoURL ?? null));
  }, [organizationId, user]);

  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);
  const submitSearch = (event: React.FormEvent) => { event.preventDefault(); if (search.trim()) navigate(`/electoral-conversion/voters?search=${encodeURIComponent(search.trim())}`); };

  return <header className="pc-header cs-topbar">
    <div className="header-wrapper cs-topbar__wrapper">
      <div className="me-auto pc-mob-drp cs-topbar__left">
        <ul className="list-unstyled">
          <li className="pc-h-item pc-sidebar-collapse"><Link to="#" className="pc-head-link cs-topbar__icon" aria-label="Ocultar menú lateral" onClick={toogleSidebarHide}><i className="ti ti-menu-2" /></Link></li>
          <li className="pc-h-item pc-sidebar-popup"><Link to="#" className="pc-head-link cs-topbar__icon" aria-label="Abrir menú lateral" onClick={toogleMobileSidebarHide}><i className="ti ti-menu-2" /></Link></li>
          <li className="pc-h-item cs-topbar__campaign"><CampaignSelector /></li>
          <li className="pc-h-item cs-topbar__search-slot"><form className="cs-topbar__search" onSubmit={submitSearch}><i className="ph-duotone ph-magnifying-glass" /><input aria-label="Buscar electores" placeholder="Buscar elector…" value={search} onChange={(event) => setSearch(event.target.value)} /></form></li>
        </ul>
      </div>
      <div className="ms-auto cs-topbar__right"><ul className="list-unstyled">
        <AppLauncher />
        <Dropdown as="li" className="pc-h-item"><Dropdown.Toggle as="button" type="button" className="pc-head-link cs-topbar__icon arrow-none me-0" aria-label="Tema"><i className="ph-duotone ph-sun-dim" /></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.DARK))}><i className="ph-duotone ph-moon me-2" />Modo oscuro</Dropdown.Item><Dropdown.Item onClick={() => dispatch(changeThemeMode(THEME_MODE.LIGHT))}><i className="ph-duotone ph-sun-dim me-2" />Modo claro</Dropdown.Item></Dropdown.Menu></Dropdown>
        <li className="pc-h-item"><Link to="/settings" className="pc-head-link cs-topbar__icon" aria-label="Configuración"><i className="ph-duotone ph-gear-six" /></Link></li>
        <NotificationInbox />
        <Dropdown as="li" className="pc-h-item cs-topbar__profile"><Dropdown.Toggle as="button" type="button" className="pc-head-link arrow-none me-0" aria-label="Perfil">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt={`Foto de ${userName}`} className="cs-topbar__profile-avatar" data-profile-avatar="image" onError={() => setAvatarFailed(true)} /> : <span className="cs-topbar__profile-avatar cs-topbar__profile-avatar--fallback" data-profile-avatar="initials" aria-label={`Avatar de ${userName}`}>{initials}</span>}<i className="ph-duotone ph-caret-down cs-topbar__profile-caret" /></Dropdown.Toggle><Dropdown.Menu className="dropdown-menu-end pc-h-dropdown"><div className="dropdown-header"><h5 className="mb-1 text-truncate">{userName}</h5><p className="mb-0 text-muted text-truncate">{user?.email} · {role || 'Cliente'}</p></div><Dropdown.Divider /><Dropdown.Item onClick={handleLogout}><i className="ph-duotone ph-power me-2" />Cerrar sesión</Dropdown.Item></Dropdown.Menu></Dropdown>
      </ul></div>
    </div>
  </header>;
}
