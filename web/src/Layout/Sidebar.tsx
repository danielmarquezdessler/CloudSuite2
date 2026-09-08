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
  const [openMenu, setOpenMenu] = useState<any>({});

  useEffect(() => {
    // Update i18n language
    i18n.changeLanguage(layoutLanguages);
  }, [layoutLanguages]);

  const handleMenuClick = (id: any) => {
    setOpenMenu((prevOpenMenu: any) => ({
      ...prevOpenMenu,
      [id]: !prevOpenMenu[id]
    }));
  };

  useEffect(() => {
    // Initialize openMenu state based on local storage or current location
    const initialOpenMenu: any = {};

    const checkSubmenu = (submenu: any) => {
      if (!submenu) return false;
      return submenu.some((subItem: any) => router.pathname.startsWith(subItem.link));
    };

    menuItems.forEach((menuItem: any) => {
      if (menuItem.submenu) {
        initialOpenMenu[menuItem.id] = checkSubmenu(menuItem.submenu);
        menuItem.submenu.forEach((subItem: any) => {
          if (subItem.submenu) {
            initialOpenMenu[subItem.id] = checkSubmenu(subItem.submenu);
          }
        });
      } else {
        initialOpenMenu[menuItem.id] = router.pathname === menuItem.link;
      }
    });

    setOpenMenu(initialOpenMenu);
  }, [router.pathname]);

  useEffect(() => {
    // Save openMenu state to local storage
    localStorage.setItem("openMenu", JSON.stringify(openMenu));
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
                    className={`pc-item pc-hasmenu ${openMenu[item.id] ||
                      item.submenu?.some((subItem: any) =>
                        isMenuActive(subItem)
                      )
                      ? "pc-trigger active"
                      : ""
                      }`}
                  >
                    <span
                      className="pc-link"
                      onClick={() => {
                        handleMenuClick(item.id);
                      }}
                    >
                      <span className="pc-micon">
                        <i className={`${item.icon}`}></i>
                      </span>
                      <span className="pc-mtext">{t(item.label)}</span>
                      <span className="pc-arrow">
                        <FeatherIcon icon="chevron-right" />
                      </span>
                    </span>
                    <ul
                      // className="pc-submenu"
                      className={`pc-submenu ${openMenu[item.id] ? "open" : ""}`}
                      style={{
                        display: openMenu[item.id] ? "block" : "none"
                      }}
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
