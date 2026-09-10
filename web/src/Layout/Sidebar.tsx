import { Link, useLocation } from "react-router-dom";
import React, { useEffect, useState } from "react";
import FeatherIcon from "feather-icons-react";
// import { useRouter } from "next/router";
import { menuItems } from "./MenuData";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";

const Sidebar = () => {
  const router = useLocation();
  const { layoutLanguages } = useSelector((state: any) => state.Theme);
  const { t, i18n } = useTranslation();
  const sidebarStateKey = "cloudsuite.sidebar.modules";
  const [openMenu, setOpenMenu] = useState<Record<string, boolean>>(() => {
    const defaults = { organization: true, "electoral-conversion": false, planning: false, execution: false };
    try {
      const stored = window.localStorage.getItem(sidebarStateKey);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    // Update i18n language
    i18n.changeLanguage(layoutLanguages);
  }, [layoutLanguages]);

  const handleMenuClick = (id: string) => {
    setOpenMenu((prevOpenMenu) => ({
      ...prevOpenMenu,
      [id]: !prevOpenMenu[id]
    }));
  };

  useEffect(() => {
    const activeModule = menuItems.find((item: any) => item.submenu?.some((subItem: any) => router.pathname === subItem.link));
    if (activeModule?.id) {
      setOpenMenu((previous) => previous[activeModule.id] ? previous : { ...previous, [activeModule.id]: true });
    }
  }, [router.pathname]);

  useEffect(() => {
    // Save openMenu state to local storage
    localStorage.setItem(sidebarStateKey, JSON.stringify(openMenu));
  }, [openMenu]);

  const isMenuActive = (menuItem: any) => {
    return router.pathname === menuItem.link;
  };

  return (
    <React.Fragment>
      {(menuItems || []).map((item: any, key: any) => (
        <React.Fragment key={key}>
          {/* {!item['isHeader'] ? */}
          {!item["isHeader"] ? (
            <>
              {!item.submenu ? (
                <>
                  <li
                    className={`pc-item ${isMenuActive(item) ? "active" : ""}`}
                  >
                    <Link
                      to={item.link && item.link}
                      data-page="index"
                      className="pc-link"
                    >
                      <span className="pc-micon">
                        <i className={`${item.icon}`}></i>
                      </span>
                      <span className="pc-mtext">{t(item.label)}</span>
                      {item.badge ? (
                        <span className="pc-badge">{item.badge}</span>
                      ) : (
                        ""
                      )}
                    </Link>
                  </li>
                </>
              ) : (
                <React.Fragment>
                  <li
                    data-sidebar-module={item.id}
                    className={`pc-item pc-hasmenu cloudsuite-sidebar-module ${openMenu[item.id] ? "pc-trigger active" : ""}`}
                  >
                    <button
                      type="button"
                      className="pc-link cloudsuite-sidebar-module__toggle"
                      aria-expanded={Boolean(openMenu[item.id])}
                      aria-controls={`sidebar-module-${item.id}`}
                      onClick={() => handleMenuClick(item.id)}
                    >
                      <span className="pc-mtext">{t(item.label)}</span>
                      <span className="pc-arrow">
                        <FeatherIcon icon="chevron-right" />
                      </span>
                    </button>
                    <ul
                      id={`sidebar-module-${item.id}`}
                      className={`pc-submenu ${openMenu[item.id] ? "open" : ""}`}
                    >
                      {(item.submenu || []).map((subItem: any, key: any) => (
                        !subItem.submenu ? (
                          <li
                            className={`pc-item ${isMenuActive(subItem) ? "active" : ""
                              }`}
                            key={key}
                          >
                            <Link
                              className="pc-link"
                              to={subItem.link || "#"}
                              data-page={subItem.dataPage}
                            >
                              <span className="pc-micon"><i className={subItem.icon}></i></span>
                              {t(subItem.label)}
                            </Link>
                          </li>
                        ) : (
                          <li
                            className={`pc-item ${isMenuActive(subItem) ? "active" : ""
                              }`}
                            key={key}
                          >
                            <Link
                              className="pc-link"
                              to={subItem.link || "#"}
                              data-page={subItem.dataPage}
                            >
                              aa{t(subItem.label)}
                            </Link>
                            <ul className="pc-submenu"
                              style={{
                                display: openMenu[item.id] ? "block" : "none"
                              }}>
                              {(subItem.submenu || []).map((childItem: any, key: any) => (
                                <li className="pc-item" key={key}>
                                  <Link className="pc-link" target="_blank" to="/pages/login-v1">
                                    {childItem.label}
                                  </Link></li>
                              ))}
                            </ul>
                          </li>
                        )
                      ))}
                    </ul>
                  </li>
                </React.Fragment>
              )}
            </>
          ) : (
            <React.Fragment>
              <li className="pc-item pc-caption">
                <label>{t(item.label)}</label>
              </li>
            </React.Fragment>
          )}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
};

export default Sidebar;
