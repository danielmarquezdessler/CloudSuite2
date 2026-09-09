import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
//import images

import cloudsuiteLogo from '../assets/images/cloudsuite.svg';
import SimpleBar from "simplebar-react";
import { menuItems } from "./MenuData";
import NestedMenu from "./NestedMenu";
import { Card, CardBody, Dropdown } from "react-bootstrap";
import { useAuth } from '../context/AuthContext';
import { authenticatedRequest } from '../lib/api';
import { useActiveCampaign } from '../context/CampaignContext';

const Header = ({ themeMode }: { themeMode: string }) => {
  const { user, logout } = useAuth();
  const { organizationId, role: campaignRole } = useActiveCampaign();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!user || !organizationId) { setAvatarUrl(user?.photoURL ?? null); return; }
    void authenticatedRequest<Array<{ uid: string; photoURL?: string | null }>>(user, `/api/organizations/${organizationId}/users`)
      .then((result) => setAvatarUrl(result.data?.find((person) => person.uid === user.uid)?.photoURL ?? user.photoURL ?? null));
  }, [organizationId, user]);

  useEffect(() => { setAvatarFailed(false); }, [avatarUrl]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const userName = user?.displayName ?? user?.email ?? 'Usuario';
  return (
    <React.Fragment>
      <nav className="pc-sidebar" id="pc-sidebar-hide" data-theme-mode={themeMode}>
        <div className="navbar-wrapper">
          <div className="m-header">
            <Link to="/dashboard" className="b-brand text-primary">
              <span className="cloudsuite-logo-shell cloudsuite-logo-shell--sidebar">
                <img className="cloudsuite-logo" src={cloudsuiteLogo} alt="CloudSuite" />
              </span>
            </Link>
          </div>

          <SimpleBar className="navbar-content" style={{ maxHeight: "100vh" }}>
            <ul className="pc-navbar" id="pc-navbar">

              <NestedMenu menuItems={menuItems} />
            </ul>
            <Card className="nav-action-card border-0 bg-primary-subtle">
              <CardBody>
                <h5 className="text-primary">CloudSuite</h5>
                <p className="text-muted mb-0">Módulos de campaña próximamente.</p>
              </CardBody>
            </Card>
          </SimpleBar>
          <Card className="pc-user-card">
            <CardBody>
              <div className="d-flex align-items-center">
                <div className="flex-shrink-0">
                  {avatarUrl && !avatarFailed
                    ? <img src={avatarUrl} alt={`Foto de ${userName}`} className="user-avtar wid-45 rounded-circle cloudsuite-sidebar-avatar" width={45} onError={() => setAvatarFailed(true)} />
                    : <span className="user-avtar wid-45 rounded-circle cloudsuite-sidebar-avatar cloudsuite-sidebar-avatar--fallback" aria-label={`Avatar de ${userName}`}>{userName.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="flex-grow-1 ms-3">
                  <Link to="#" className="arrow-none dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" data-bs-offset="0,20"></Link>
                  <div className="d-flex align-items-center">
                    <div className="flex-grow-1">
                      <h6 className="mb-0 text-truncate">{userName}</h6>
                      <small className="d-block text-truncate">{user?.email}</small>
                      <small>{campaignRole || 'Cliente'}</small>
                    </div>

                    <Dropdown>
                      <Dropdown.Toggle
                        variant="a"
                        className="btn btn-icon btn-link-secondary avtar arrow-none"
                        data-bs-offset="0,20"
                      >
                        <i className="ph-duotone ph-windows-logo"></i>
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        <ul>
                          <li><Dropdown.Item className="pc-user-links" onClick={handleLogout}>
                            <i className="ph-duotone ph-power"></i>
                            <span>Cerrar sesión</span>
                          </Dropdown.Item></li>
                        </ul>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </nav>
    </React.Fragment >
  );
};

export default Header;
