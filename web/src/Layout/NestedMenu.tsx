import { DragEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import FeatherIcon from 'feather-icons-react';
import { useTranslation } from 'react-i18next';
import { useActiveCampaign } from '../context/CampaignContext';
import { useAuth } from '../context/AuthContext';
import { useAuthenticatedQuery } from '../lib/api';

interface MenuItem {
  id?: string;
  label: string;
  type?: string;
  icon?: string;
  link?: string;
  badge?: string;
  dataPage?: string;
  submenu?: MenuItem[];
  addon?: 'smartPlanner' | 'voteStream' | 'finance';
  agentOnly?: boolean;
  managerOnly?: boolean;
  adminOnly?: boolean;
}

interface NestedMenuProps {
  menuItems: any[];
  order?: string[];
  organizing?: boolean;
  onOrderChange?: (order: string[]) => void;
}

const SIDEBAR_STATE_KEY = 'cloudsuite.sidebar.openModule';
const LEGACY_SIDEBAR_STATE_KEY = 'cloudsuite.sidebar.modules';
const DEFAULT_OPEN_MODULE = 'organization';

function readOpenModule() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_STATE_KEY);
    if (saved !== null) return JSON.parse(saved) as string | null;
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_SIDEBAR_STATE_KEY) ?? 'null') as Record<string, boolean> | null;
    return Object.entries(legacy ?? {}).find(([, expanded]) => expanded)?.[0] ?? DEFAULT_OPEN_MODULE;
  } catch {
    return DEFAULT_OPEN_MODULE;
  }
}

function ordered<T extends MenuItem>(items: T[], order: string[]) {
  const byId = new Map(items.flatMap((item) => item.id ? [[item.id, item] as const] : []));
  const result = order.filter((id, index) => byId.has(id) && order.indexOf(id) === index);
  items.forEach((item, defaultIndex) => {
    if (!item.id || result.includes(item.id)) return;
    const previous = items.slice(0, defaultIndex).reverse().find((candidate) => candidate.id && result.includes(candidate.id));
    if (previous?.id) {
      result.splice(result.lastIndexOf(previous.id) + 1, 0, item.id);
      return;
    }
    const following = items.slice(defaultIndex + 1).find((candidate) => candidate.id && result.includes(candidate.id));
    if (following?.id) result.splice(result.indexOf(following.id), 0, item.id);
    else result.push(item.id);
  });
  return result.map((id) => byId.get(id)!).filter(Boolean);
}

const NestedMenu = ({ menuItems, order = [], organizing = false, onOrderChange }: NestedMenuProps) => {
  const router = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { enabledAddons, role, organizationId, activeCampaignId } = useActiveCampaign();
  const agentStreamsPath = enabledAddons.voteStream && organizationId && activeCampaignId
    ? `/api/organizations/${organizationId}/campaigns/${activeCampaignId}/vote-stream/mine`
    : null;
  const agentStreams = useAuthenticatedQuery<Array<{ id: string }>>(user, agentStreamsPath, [agentStreamsPath]);
  const [openModule, setOpenModule] = useState<string | null>(readOpenModule);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const canRender = (item: MenuItem) => {
    if (item.adminOnly && role !== 'admin') return false;
    if (item.managerOnly && role !== 'admin' && role !== 'cliente') return false;
    if (item.agentOnly && (!agentStreams.data || agentStreams.data.length === 0)) return false;
    return true;
  };

  const visibleItems = useMemo<MenuItem[]>(() => (menuItems as MenuItem[]).filter(canRender).map((item) => ({
    ...item,
    submenu: item.submenu?.filter(canRender)
  })).filter((item) => !item.submenu || item.submenu.length > 0), [menuItems, role, agentStreams.data, enabledAddons]);
  const orderedItems = useMemo(() => ordered(visibleItems, order), [visibleItems, order]);

  useEffect(() => {
    const activeModule = orderedItems.find((item) => item.submenu?.some((child) => child.link === router.pathname));
    if (activeModule?.id) setOpenModule(activeModule.id);
  }, [orderedItems, router.pathname]);

  useEffect(() => { window.localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(openModule)); }, [openModule]);

  const toggleModule = (id: string) => setOpenModule((current) => current === id ? null : id);
  const isActive = (item: MenuItem) => item.link === router.pathname;
  const isAddonEnabled = (item: MenuItem) => !item.addon || enabledAddons[item.addon];

  const moveItem = (fromId: string, toId: string) => {
    if (!onOrderChange || fromId === toId) return;
    const ids = orderedItems.map((item) => item.id).filter((id): id is string => Boolean(id));
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...ids];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, fromId);
    onOrderChange(next);
  };

  const onDragStart = (event: DragEvent<HTMLLIElement>, id: string) => {
    if (!organizing) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  };

  const onDragOver = (event: DragEvent<HTMLLIElement>) => {
    if (organizing) event.preventDefault();
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, id: string) => {
    if (!organizing) return;
    event.preventDefault();
    moveItem(event.dataTransfer.getData('text/plain') || draggingId || '', id);
    setDraggingId(null);
  };

  const renderChild = (child: MenuItem) => {
    const enabled = isAddonEnabled(child);
    if (!enabled) return <li key={child.id} className="pc-item cloudsuite-sidebar-addon is-disabled">
      <button type="button" className="pc-link cloudsuite-sidebar-addon__button" disabled aria-disabled="true" title={`${child.label} estará disponible próximamente.`}>
        {child.icon && <span className="pc-micon"><i className={child.icon} /></span>}<span className="pc-mtext">{t(child.label)}</span><span className="cloudsuite-sidebar-addon__badge">Próximamente</span>
      </button>
    </li>;
    return <li key={child.id} className={`pc-item ${isActive(child) ? 'active' : ''}`}>
      <Link to={child.link || '#'} className="pc-link" data-page={child.dataPage}>
        {child.icon && <span className="pc-micon"><i className={child.icon} /></span>}<span className="pc-mtext">{t(child.label)}</span>
      </Link>
    </li>;
  };

  return <>
    {orderedItems.map((item) => {
      if (item.type === 'HEADER') return <li key={item.label} className="pc-item pc-caption"><label>{t(item.label)}</label></li>;
      const draggable = organizing && Boolean(item.id);
      const dragProps = item.id ? {
        draggable,
        onDragStart: (event: DragEvent<HTMLLIElement>) => onDragStart(event, item.id!),
        onDragOver,
        onDrop: (event: DragEvent<HTMLLIElement>) => onDrop(event, item.id!),
        onDragEnd: () => setDraggingId(null)
      } : {};
      const editClass = draggable ? ` cloudsuite-sidebar-organize-item${draggingId === item.id ? ' is-dragging' : ''}` : '';
      if (!item.submenu) return <li key={item.id} {...dragProps} data-sidebar-item={item.id} className={`pc-item ${isActive(item) ? 'active' : ''}${editClass}`}>
        {organizing ? <button type="button" className="pc-link cloudsuite-sidebar-organize-item__button" aria-label={`Reordenar ${item.label}`}><span className="pc-micon"><i className="ph-duotone ph-dots-six-vertical" /></span><span className="pc-mtext">{t(item.label)}</span></button> : <Link to={item.link || '#'} className="pc-link" data-page={item.dataPage}>
          {item.icon && <span className="pc-micon"><i className={item.icon} /></span>}<span className="pc-mtext">{t(item.label)}</span>{item.badge && <span className="pc-badge">{item.badge}</span>}
        </Link>}
      </li>;

      const expanded = item.id === openModule;
      const containsActiveItem = item.submenu.some(isActive);
      return <li key={item.id} {...dragProps} data-sidebar-item={item.id} data-sidebar-module={item.id} className={`pc-item pc-hasmenu cloudsuite-sidebar-module ${expanded ? 'pc-trigger' : ''} ${containsActiveItem ? 'active' : ''}${editClass}`}>
        {organizing ? <button type="button" className="pc-link cloudsuite-sidebar-organize-item__button" aria-label={`Reordenar ${item.label}`}><span className="pc-micon"><i className="ph-duotone ph-dots-six-vertical" /></span><span className="pc-mtext">{t(item.label)}</span></button> : <button type="button" className="pc-link cloudsuite-sidebar-module__toggle" aria-expanded={expanded} aria-controls={`sidebar-module-${item.id}`} onClick={() => item.id && toggleModule(item.id)}>
          <span className="pc-mtext">{t(item.label)}</span><span className="pc-arrow"><FeatherIcon icon="chevron-right" /></span>
        </button>}
        {!organizing && <ul id={`sidebar-module-${item.id}`} className="pc-submenu">{item.submenu.map(renderChild)}</ul>}
      </li>;
    })}
  </>;
};

export default NestedMenu;
