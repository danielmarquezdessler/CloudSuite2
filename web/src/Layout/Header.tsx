import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
//import images

import cloudsuiteLogo from '../assets/images/cloudsuite.svg';
import SimpleBar from "simplebar-react";
import { menuItems } from "./MenuData";
import NestedMenu from "./NestedMenu";
import { Card, CardBody } from "react-bootstrap";
import { useAuth } from '../context/AuthContext';
import { authenticatedRequest, useAuthenticatedQuery } from '../lib/api';
import { useActiveCampaign } from '../context/CampaignContext';
import Stack from '../components/Shared/Stack';
import Inline from '../components/Shared/Inline';

const Header = ({ themeMode }: { themeMode: string }) => {
  const { user } = useAuth();
  const { organizationId } = useActiveCampaign();
  const [brandOverride, setBrandOverride] = useState<{ partyName: string; partyLogoUrl: string | null } | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [organizerMessage, setOrganizerMessage] = useState('');
  const globalConfigurationPath = organizationId ? `/api/organizations/${organizationId}/global-configuration` : null;
  const { data: globalConfiguration } = useAuthenticatedQuery<{ partyName: string; partyLogoUrl: string | null }>(user, globalConfigurationPath, [globalConfigurationPath]);
  const sidebarPreferences = useAuthenticatedQuery<{ order: string[] }>(user, '/api/me/sidebar-preferences');

  useEffect(() => {
    const updateBrand = (event: Event) => setBrandOverride((event as CustomEvent<{ partyName: string; partyLogoUrl: string | null }>).detail);
    window.addEventListener('cloudsuite:global-configuration', updateBrand);
    return () => window.removeEventListener('cloudsuite:global-configuration', updateBrand);
  }, []);

  useEffect(() => { setBrandOverride(null); }, [organizationId]);

  useEffect(() => {
    if (!organizing) setDraftOrder(sidebarPreferences.data?.order ?? []);
  }, [organizing, sidebarPreferences.data]);

  const saveOrder = async () => {
    if (!user) return;
    const result = await authenticatedRequest<{ order: string[] }>(user, '/api/me/sidebar-preferences', {
      method: 'PUT', body: JSON.stringify({ order: draftOrder })
    });
    if (result.error) {
      setOrganizerMessage(result.error.message);
      return;
    }
    setDraftOrder(result.data?.order ?? draftOrder);
    setOrganizing(false);
    setOrganizerMessage('Orden guardado.');
    await sidebarPreferences.reload();
  };

  const startOrganizing = () => {
    setDraftOrder(sidebarPreferences.data?.order ?? []);
    setOrganizerMessage('Arrastrá los menús principales para reordenarlos.');
    setOrganizing(true);
  };

  const restoreDefaultOrder = () => {
    setDraftOrder([]);
    setOrganizerMessage('Se restaurará el orden predeterminado al guardar.');
  };

  const brand = brandOverride ?? globalConfiguration;
  return (
    <React.Fragment>
      <nav className="pc-sidebar" id="pc-sidebar-hide" data-theme-mode={themeMode}>
        <div className="navbar-wrapper">
          <div className="m-header">
            <Inline gap="xs" className={`cloudsuite-sidebar-header-actions${organizing ? ' cloudsuite-sidebar-header-actions--organizing' : ''}`}>
              <Link to="/dashboard" className="b-brand text-primary">
                <span className="cloudsuite-logo-shell cloudsuite-logo-shell--sidebar">
                  <img className="cloudsuite-logo" src={cloudsuiteLogo} alt="CloudSuite" />
                </span>
              </Link>
              <button type="button" className="cloudsuite-sidebar-organize-button" onClick={organizing ? saveOrder : startOrganizing} aria-pressed={organizing} aria-label={organizing ? 'Guardar orden del menú' : 'Organizar menú'}>
                <i className={organizing ? 'ph-duotone ph-check' : 'ph-duotone ph-sort-ascending'} />
                <span>{organizing ? 'Guardar' : 'Organizar'}</span>
              </button>
              {organizing && <button type="button" className="cloudsuite-sidebar-organize-reset" onClick={restoreDefaultOrder} aria-label="Restaurar"><i className="ph-duotone ph-arrow-counter-clockwise" /><span className="visually-hidden">Restaurar</span></button>}
            </Inline>
          </div>

          <SimpleBar className="navbar-content" style={{ maxHeight: "100vh" }}>
            <ul className="pc-navbar" id="pc-navbar">

              <NestedMenu menuItems={menuItems} order={organizing ? draftOrder : sidebarPreferences.data?.order} organizing={organizing} onOrderChange={setDraftOrder} />
            </ul>
            <span className="visually-hidden" aria-live="polite">{organizerMessage}</span>
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
