import React from "react";
import { Link } from "react-router-dom";
import logoDark from "../../assets/images/logo-dark.svg";
import logoLight from "../../assets/images/logo-white.svg";
import Navbar from "./Navbar";
import { Card, CardBody, Dropdown } from "react-bootstrap";
import TopBar from "../Topbar";
import Footer from "../Footer";
import navCardBg from "../../assets/images/layout/nav-card-bg.svg";
import avatar1 from "../../assets/images/user/avatar-1.jpg";
import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { changeThemeLayout, changeThemePreset } from '../../toolkit/thunk';
import { changeLayoutTheme, changeSidebarTheme, changeSidebarThemeCaptions } from '../../toolkit/themeLayouts/thunk';
import RightCustomizer from '../RightCustomizer';
import { createSelector } from "reselect";


const Header = ({ children, changeThemeMode }: any) => {

    const toogleSidebarHide = () => {
        const sidebarHideId = document.getElementById("pc-sidebar-hide");

        if (sidebarHideId) {
            sidebarHideId.classList.toggle("pc-sidebar-hide");
        }
    };
    const toogleMobileSidebarHide = () => {
        const sidebarHideId = document.getElementById("pc-sidebar-hide") as HTMLDivElement | null;

        if (sidebarHideId) {
            sidebarHideId.classList.toggle("mob-sidebar-active");
        }

        // Create a new element
        const newElement = document.createElement('div');
        newElement.className = 'pc-menu-overlay'; // Set the desired class name

        // Insert the new element after the .navbar-wrapper
        const navbarWrapper = document.querySelector('.navbar-wrapper') as Element | null;
        if (navbarWrapper) {
            navbarWrapper.insertAdjacentElement('afterend', newElement);
        }

        // Add an event listener to remove the "mob-sidebar-active" class when the new element is clicked
        newElement.addEventListener('click', function () {
            if (sidebarHideId) {
                sidebarHideId.classList.remove("mob-sidebar-active");
                newElement.remove(); // Remove the new element when clicked
            }
        });
    };


    const dispatch = useDispatch<any>();

    const selectLayoutProperties = createSelector(
        (state: any) => state.Theme,
        (layout) => ({
            themeMode: layout.themeMode,
            layoutTheme: layout.layoutTheme,
            themePreset: layout.themePreset,
            themeLayout: layout.themeLayout,
            sidebarTheme: layout.sidebarTheme,
            sidebarThemeCaptions: layout.sidebarThemeCaptions,
        })
    );
    // Inside your component
    const {
        themeMode,
        themePreset,
        layoutTheme,
        themeLayout,
        sidebarTheme,
        sidebarThemeCaptions,
    } = useSelector(selectLayoutProperties);

    /*
      layout settings
      */
    useEffect(() => {
        if (
            themeMode ||
            layoutTheme ||
            themePreset ||
            themeLayout ||
            sidebarTheme ||
            sidebarThemeCaptions
        ) {
            dispatch(changeThemeMode(themeMode));
            dispatch(changeLayoutTheme(layoutTheme));
            dispatch(changeThemePreset(themePreset));
            dispatch(changeThemeLayout(themeLayout));
            dispatch(changeSidebarTheme(sidebarTheme));
            dispatch(changeSidebarThemeCaptions(sidebarThemeCaptions));
        }
    }, [
        themeMode,
        layoutTheme,
        themePreset,
        themeLayout,
        sidebarTheme,
        sidebarThemeCaptions,
        dispatch
    ]);

    const [isLayoutWidth, setLayoutWidth] = useState(false);

    const handleChangeLayoutWidth = (value: boolean) => {
        setLayoutWidth(value);
    };
    const getLayoutWidth = isLayoutWidth ? "container" : "";
    const [showOffcanvas, setShowOffcanvas] = useState(false);

    const handleOffcanvasToggle = () => {
        setShowOffcanvas(!showOffcanvas);
    };

    return (
        <React.Fragment>
            <nav className="pc-sidebar" id="pc-sidebar-hide">
                <div className="navbar-wrapper">
                    <div className="m-header">
                        <Link to="/" className="b-brand text-primary">
                            {themeMode === "dark" ?
                                <img src={logoLight} alt="logo" className="logo-lg landing-logo" />
                                :
                                <img src={logoDark} alt="logo" className="logo-lg landing-logo" />
                            }
                            <span className="badge bg-brand-color-2 rounded-pill ms-1 theme-version">v1.0</span>
                        </Link>
                        <Dropdown as="li" className="pc-h-item d-inline-flex d-md-none">
                            <Dropdown.Toggle as="a" className="pc-head-link arrow-none m-0" data-bs-toggle="dropdown" href="#" role="button"
                                aria-haspopup="false" aria-expanded="false">
                                <i className="ph-duotone ph-magnifying-glass"></i>
                            </Dropdown.Toggle>
                            <Dropdown.Menu className="pc-h-dropdown drp-search">
                                <form className="px-3">
                                    <div className="form-group mb-0 d-flex align-items-center">
                                        <input type="search" className="form-control border-0 shadow-none" placeholder="Search here. . ." />
                                        <button className="btn btn-light-secondary btn-search">Search</button>
                                    </div>
                                </form>
                            </Dropdown.Menu>
                        </Dropdown>
                    </div>
                    <Navbar />
                    <Card className="nav-action-card bg-brand-color-4">
                        <CardBody
                            style={{ backgroundImage: `url(${navCardBg})` }}>
                            <h5 className="text-dark">Help Center</h5>
                            <p className="text-dark text-opacity-75">Please contact us for more questions.</p>
                            <Link to="https://phoenixcoded.support-hub.io/" className="btn btn-primary" target="_blank">Go to help Center</Link>
                        </CardBody>
                    </Card>

                    <Card className="pc-user-card">
                        <CardBody>
                            <div className="d-flex align-items-center">
                                <div className="flex-shrink-0">
                                    <img src={avatar1} alt="user-image" className="user-avtar wid-45 rounded-circle" />
                                </div>
                                <div className="flex-grow-1 ms-3 me-2">
                                    <h6 className="mb-0">Jonh Smith</h6>
                                    <small>Administrator</small>
                                </div>
                                <div className="dropdown">
                                    <a href="#" className="btn btn-icon btn-link-secondary avtar arrow-none dropdown-toggle"
                                        data-bs-toggle="dropdown" aria-expanded="false" data-bs-offset="0,20">
                                        <i className="ph-duotone ph-windows-logo"></i>
                                    </a>
                                    <div className="dropdown-menu">
                                        <ul>
                                            <li><a className="pc-user-links">
                                                <i className="ph-duotone ph-user"></i>
                                                <span>My Account</span>
                                            </a></li>
                                            <li><a className="pc-user-links">
                                                <i className="ph-duotone ph-gear"></i>
                                                <span>Settings</span>
                                            </a></li>
                                            <li><a className="pc-user-links">
                                                <i className="ph-duotone ph-lock-key"></i>
                                                <span>Lock Screen</span>
                                            </a></li>
                                            <li><a className="pc-user-links">
                                                <i className="ph-duotone ph-power"></i>
                                                <span>Logout</span>
                                            </a>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            </nav>
            <TopBar
                handleOffcanvasToggle={handleOffcanvasToggle}
                toogleSidebarHide={toogleSidebarHide}
                toogleMobileSidebarHide={toogleMobileSidebarHide}
                themeMode={themeMode}
                changeThemeMode={changeThemeMode}
            />
            <div className='pc-container'>
                <div className={"pc-content " + getLayoutWidth}>
                    {children}
                </div>
            </div>
            <Footer />
            <RightCustomizer
                showOffcanvas={showOffcanvas}
                handleOffcanvasToggle={handleOffcanvasToggle}
                themeMode={themeMode}
                changeThemeMode={changeThemeMode}
                themePreset={themePreset}
                changeThemePreset={changeThemePreset}
                themeLayout={themeLayout}
                changeThemeLayout={changeThemeLayout}
                isLayoutWidth={isLayoutWidth}
                handleChangeLayoutWidth={handleChangeLayoutWidth}
                sidebarTheme={sidebarTheme}
                changeSidebarTheme={changeSidebarTheme}
                sidebarThemeCaptions={sidebarThemeCaptions}
                changeSidebarThemeCaptions={changeSidebarThemeCaptions}
            />
        </React.Fragment>
    );
};

export default Header;