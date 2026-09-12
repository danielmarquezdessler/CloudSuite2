
import { Link, useLocation } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import FeatherIcon from 'feather-icons-react';
import { useTranslation } from 'react-i18next';
import { useActiveCampaign } from '../context/CampaignContext';

interface MenuItem {
  id?: string;
  label: string;
  type?: string;
  icon?: string;
  link?: string;
  badge?: string;
  dataPage?: string;
  submenu?: MenuItem[];
  addon?: 'smartPlanner';
  adminOnly?: boolean;
}

const SIDEBAR_STATE_KEY = 'cloudsuite.sidebar.openModule';
const LEGACY_SIDEBAR_STATE_KEY = 'cloudsuite.sidebar.modules';
const DEFAULT_OPEN_MODULE = 'organization';

function readOpenModule() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    if (saved !== null) return JSON.parse(saved) as string | null;

    // Preserve the user's most recent choice while moving away from the old
    // multi-open representation. Subsequent writes only use the single value.
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_SIDEBAR_STATE_KEY) ?? 'null') as Record<string, boolean> | null;
    return Object.entries(legacy ?? {}).find(([, expanded]) => expanded)?.[0] ?? DEFAULT_OPEN_MODULE;
  } catch {
    return DEFAULT_OPEN_MODULE;
  }
}

const NestedMenu: React.FC<{ menuItems: any }> = ({ menuItems }) => {
  const router = useLocation();
  const { t } = useTranslation();
  const { enabledAddons, role } = useActiveCampaign();
  const [openModule, setOpenModule] = useState<string | null>(readOpenModule);

  useEffect(() => {
    const activeModule = menuItems.find((item: MenuItem) => item.submenu?.some((child: MenuItem) => child.link === router.pathname));
    if (activeModule?.id) setOpenModule(activeModule.id);
  }, [menuItems, router.pathname]);

  useEffect(() => { window.localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(openModule)); }, [openModule]);

  const toggleModule = (id: string) => setOpenModule((current) => current === id ? null : id);
  const isActive = (item: MenuItem) => item.link === router.pathname;

  return <>
    {menuItems.map((item: MenuItem) => {
      if (item.adminOnly && role !== 'admin') return null;
      if (item.type === 'HEADER') return <li key={item.label} className="pc-item pc-caption"><label>{t(item.label)}</label></li>;
      if (item.addon === 'smartPlanner') {
        const enabled = enabledAddons.smartPlanner;
        return <li key={item.id} className={`pc-item cloudsuite-sidebar-addon ${enabled ? 'is-enabled' : 'is-disabled'}`}>
          <button type="button" className="pc-link cloudsuite-sidebar-addon__button" disabled={!enabled} aria-disabled={!enabled} title={enabled ? 'SmartPlanner está habilitado para esta organización.' : 'SmartPlanner estará disponible próximamente.'}>
            {item.icon && <span className="pc-micon"><i className={item.icon} /></span>}
            <span className="pc-mtext">{t(item.label)}</span>{!enabled && <span className="cloudsuite-sidebar-addon__badge">Próximamente</span>}
          </button>
        </li>;
      }
      if (!item.submenu) return <li key={item.id} className={`pc-item ${isActive(item) ? 'active' : ''}`}>
        <Link to={item.link || '#'} className="pc-link" data-page={item.dataPage}>
          {item.icon && <span className="pc-micon"><i className={item.icon} /></span>}
          <span className="pc-mtext">{t(item.label)}</span>{item.badge && <span className="pc-badge">{item.badge}</span>}
        </Link>
      </li>;

      const expanded = item.id === openModule;
      const containsActiveItem = item.submenu.some(isActive);
      return <li key={item.id} data-sidebar-module={item.id} className={`pc-item pc-hasmenu cloudsuite-sidebar-module ${expanded ? 'pc-trigger' : ''} ${containsActiveItem ? 'active' : ''}`}>
        <button type="button" className="pc-link cloudsuite-sidebar-module__toggle" aria-expanded={expanded} aria-controls={`sidebar-module-${item.id}`} onClick={() => item.id && toggleModule(item.id)}>
          <span className="pc-mtext">{t(item.label)}</span><span className="pc-arrow"><FeatherIcon icon="chevron-right" /></span>
        </button>
        <ul id={`sidebar-module-${item.id}`} className="pc-submenu">
          {item.submenu.map((child: MenuItem) => <li key={child.id} className={`pc-item ${isActive(child) ? 'active' : ''}`}>
            <Link to={child.link || '#'} className="pc-link" data-page={child.dataPage}>
              {child.icon && <span className="pc-micon"><i className={child.icon} /></span>}<span className="pc-mtext">{t(child.label)}</span>
            </Link>
          </li>)}
        </ul>
      </li>;
    })}
  </>;
};

export default NestedMenu;
