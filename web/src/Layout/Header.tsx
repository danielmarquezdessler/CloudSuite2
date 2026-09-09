import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
//import images

import cloudsuiteLogo from '../assets/images/cloudsuite.svg';
import avatar1 from "../assets/images/user/avatar-1.jpg"
import SimpleBar from "simplebar-react";
import { menuItems } from "./MenuData";
import NestedMenu from "./NestedMenu";
import { Card, CardBody, Dropdown } from "react-bootstrap";
import { useAuth } from '../context/AuthContext';
import { authenticatedRequest } from '../lib/api';

const Header = ({ themeMode }: { themeMode: string }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('Cliente');

  useEffect(() => {
    if (!user) return;
    void authenticatedRequest<{ role?: string }>(user, '/api/me').then(result => setRole(result.data?.role ?? 'Cliente'));
  }, [user]);

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
                  <img
                    src={avatar1}
                    alt="user-image"
                    className="user-avtar wid-45 rounded-circle"
                    width={45}
                  />
                </div>
                <div className="flex-grow-1 ms-3">
                  <Link to="#" className="arrow-none dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" data-bs-offset="0,20"></Link>
                  <div className="d-flex align-items-center">
                    <div className="flex-grow-1">
                      <h6 className="mb-0 text-truncate">{userName}</h6>
                      <small className="d-block text-truncate">{user?.email}</small>
                      <small>{role}</small>
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
