
import { Link, useLocation } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import FeatherIcon from 'feather-icons-react';
import { useTranslation } from 'react-i18next';

interface MenuItem {
  id?: string;
  label: string;
  type?: string;
  icon?: string;
  link?: string;
  badge?: string;
  dataPage?: string;
  submenu?: MenuItem[];
}

const SIDEBAR_STATE_KEY = 'cloudsuite.sidebar.modules';
const DEFAULT_MODULES: Record<string, boolean> = { organization: true, 'electoral-conversion': false, planning: false, execution: false };

const NestedMenu: React.FC<{ menuItems: any }> = ({ menuItems }) => {
  const router = useLocation();
  const { t } = useTranslation();
  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = window.localStorage.getItem(SIDEBAR_STATE_KEY);
      return saved ? { ...DEFAULT_MODULES, ...JSON.parse(saved) } : DEFAULT_MODULES;
    } catch {
      return DEFAULT_MODULES;
    }
  });

  useEffect(() => {
    const activeModule = menuItems.find((item: MenuItem) => item.submenu?.some((child: MenuItem) => child.link === router.pathname));
    if (activeModule?.id) setOpenModules((previous) => previous[activeModule.id!] ? previous : { ...previous, [activeModule.id!]: true });
  }, [menuItems, router.pathname]);

  useEffect(() => { window.localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(openModules)); }, [openModules]);

  const toggleModule = (id: string) => setOpenModules((previous) => ({ ...previous, [id]: !previous[id] }));
  const isActive = (item: MenuItem) => item.link === router.pathname;

  return <>
    {menuItems.map((item: MenuItem) => {
      if (item.type === 'HEADER') return <li key={item.label} className="pc-item pc-caption"><label>{t(item.label)}</label></li>;
      if (!item.submenu) return <li key={item.id} className={`pc-item ${isActive(item) ? 'active' : ''}`}>
        <Link to={item.link || '#'} className="pc-link" data-page={item.dataPage}>
          {item.icon && <span className="pc-micon"><i className={item.icon} /></span>}
          <span className="pc-mtext">{t(item.label)}</span>{item.badge && <span className="pc-badge">{item.badge}</span>}
        </Link>
      </li>;

      const expanded = Boolean(item.id && openModules[item.id]);
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
