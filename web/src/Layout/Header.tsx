import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
//import images

import cloudsuiteLogo from '../assets/images/cloudsuite.svg';
import SimpleBar from "simplebar-react";
import { menuItems } from "./MenuData";
import NestedMenu from "./NestedMenu";
import { Card, CardBody } from "react-bootstrap";
import { useAuth } from '../context/AuthContext';
import { useAuthenticatedQuery } from '../lib/api';
import { useActiveCampaign } from '../context/CampaignContext';
import Stack from '../components/Shared/Stack';

const Header = ({ themeMode }: { themeMode: string }) => {
  const { user } = useAuth();
  const { organizationId } = useActiveCampaign();
  const [brandOverride, setBrandOverride] = useState<{ partyName: string; partyLogoUrl: string | null } | null>(null);
  const globalConfigurationPath = organizationId ? `/api/organizations/${organizationId}/global-configuration` : null;
  const { data: globalConfiguration } = useAuthenticatedQuery<{ partyName: string; partyLogoUrl: string | null }>(user, globalConfigurationPath, [globalConfigurationPath]);

  useEffect(() => {
    const updateBrand = (event: Event) => setBrandOverride((event as CustomEvent<{ partyName: string; partyLogoUrl: string | null }>).detail);
    window.addEventListener('cloudsuite:global-configuration', updateBrand);
    return () => window.removeEventListener('cloudsuite:global-configuration', updateBrand);
  }, []);

  useEffect(() => { setBrandOverride(null); }, [organizationId]);

  const brand = brandOverride ?? globalConfiguration;
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
          </SimpleBar>
          <Card className="pc-user-card cloudsuite-party-footer" data-party-sidebar-footer>
            <CardBody>
              <Stack gap="xs" className="cloudsuite-party-footer__content">
                {brand?.partyLogoUrl ? <img src={brand.partyLogoUrl} alt={`Logo de ${brand.partyName || 'partido'}`} className="cloudsuite-party-footer__logo" /> : brand?.partyName ? <small className="cloudsuite-party-footer__name">{brand.partyName}</small> : <Link to="/settings" className="cloudsuite-party-footer__configure" aria-label="Configurar información de partido"><i className="ph-duotone ph-gear-six" /><span>Configurar información de partido</span></Link>}
              </Stack>
            </CardBody>
          </Card>
        </div>
      </nav>
    </React.Fragment >
  );
};

export default Header;
