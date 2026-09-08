
import { Link, useLocation } from "react-router-dom";
import React, { useCallback, useEffect, useState } from "react";
import FeatherIcon from "feather-icons-react";
import { useTranslation } from "react-i18next";

interface MenuItem {
  id: number;
  label: string;
  type?: string;
  icon?: string;
  link?: string;
  badge?: string;
  dataPage?: string;
  submenu?: MenuItem[];
}

const NestedMenu: React.FC<{ menuItems: any }> = ({ menuItems }) => {  //MenuItem[]
  const router = useLocation();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const { t } = useTranslation();


  const initializeOpenMenu = (items: MenuItem[], path: string): number | null => {
    for (const item of items) {
      if (item.link === path) {
        return item.id;
      }
      if (item.submenu) {
        const submenuOpenId = initializeOpenMenu(item.submenu, path);
        if (submenuOpenId !== null) {
          return item.id;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const storedOpenMenuId = localStorage.getItem("openMenuId");
    if (storedOpenMenuId) {
      setOpenMenuId(JSON.parse(storedOpenMenuId));
    } else {
      const initialOpenMenuId = initializeOpenMenu(menuItems, router.pathname);
      setOpenMenuId(initialOpenMenuId);
    }
  }, [menuItems, router.pathname]);

  const handleMenuClick = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(prevOpenMenuId => (prevOpenMenuId === id ? null : id));
  };

  useEffect(() => {
    localStorage.setItem("openMenuId", JSON.stringify(openMenuId));
  }, [openMenuId]);

  const hasActiveLink = useCallback(
    (list: MenuItem[]) => {
      if (!list) return false;
      for (const menuItem of list) {
        if (menuItem.link === router.pathname) {
          return true;
        } else if (menuItem.submenu && hasActiveLink(menuItem.submenu)) {
          return true;
        }
      }
      return false;
    },
    [router.pathname]
  );

  const hasOpenedSubMenu = useCallback(
    (list: MenuItem[], openMenuId: number | null) => {
      if (!list) return false;
      for (const menuItem of list) {
        if (menuItem.id === openMenuId) {
          return true;
        } else if (menuItem.submenu && hasOpenedSubMenu(menuItem.submenu, openMenuId)) {
          return true;
        }
      }
      return false;
    },
    [openMenuId]
  );

  const renderMenu = (items: MenuItem[]) => {
    return items.map((item, index) => (
      <li
        key={index}
        onClick={(e) => {
          item.type !== "HEADER" && handleMenuClick(item.id, e);
        }}
        className={`pc-item ${item.type === "HEADER"
          ? "pc-caption"
          : item.type === "HASHMENU"
            ? "pc-hashmenu"
            : ""
          } ${openMenuId === item.id || hasOpenedSubMenu(item.submenu || [], openMenuId)
            ? "pc-trigger"
            : ""
          } ${item.link === router.pathname || hasActiveLink(item.submenu || [])
            ? "active"
            : ""}`}
      >
        {item.type === "HEADER" && <label suppressHydrationWarning>{t(item.label)}</label>}
        {item.type !== "HEADER" && (
          <Link to={item.link || "#"} className="pc-link">
            {item.icon && (
              <span className="pc-micon">
                <i className={item.icon}></i>
              </span>
            )}
            <span className="pc-mtext" suppressHydrationWarning>{t(item.label)}</span>
            {item.submenu && (
              <span className="pc-arrow">
                <FeatherIcon icon="chevron-right" />
              </span>
            )}
            {item.badge && <span className="pc-badge">{item.badge}</span>}
          </Link>
        )}
        {(openMenuId === item.id || hasOpenedSubMenu(item.submenu || [], openMenuId)) && (
          <ul className={`pc-submenu open`} style={{ display: "block" }}>
            {renderMenu(item.submenu || [])}
          </ul>
        )}
      </li>
    ));
  };

  return <>{renderMenu(menuItems)}</>;
};

export default NestedMenu;