import React from "react";
import { Link } from "react-router-dom";
//import images

import navCardBg from '../../assets/images/layout/nav-card-bg.svg'
import logoDark from "../../assets/images/logo-dark.svg";
import logoLight from "../../assets/images/logo-white.svg";
import avatar1 from "../../assets/images/user/avatar-1.jpg"
import SimpleBar from "simplebar-react";
import { menuItems } from "../MenuData";
import NestedMenu from "../NestedMenu";
import { Card, Dropdown, Form } from "react-bootstrap";
import SubMenuList from "../SubMenuList";

const Header = ({ themeMode }: any) => {
    return (
        <React.Fragment>
            <nav className="pc-sidebar" id="pc-sidebar-hide">
                <div className="navbar-wrapper">
                    <div className="m-header d-flex justify-content-between">
                        <Link to="/" className="b-brand text-primary">
                            {themeMode === "dark" ?
                                <img src={logoLight} alt="logo" className="logo-lg landing-logo" />
                                :
                                <img src={logoDark} alt="logo" className="logo-lg landing-logo" />
                            }
                            <span className="badge bg-brand-color-2 rounded-pill ms-1 theme-version">
                                v1.0
                            </span>
                        </Link>
                        <Dropdown align="end">
                            <Dropdown.Toggle className="avtar avtar-s btn-link-secondary dropdown-toggle arrow-none me-0">
                                <i className="ph-duotone ph-caret-circle-down f-20"></i>
                            </Dropdown.Toggle>

                            <Dropdown.Menu className="pc-h-dropdown">
                                <Dropdown.Item href="#!">
                                    <i className="ph-duotone ph-shopping-cart"></i>
                                    <span>E-commerce</span>
                                </Dropdown.Item>
                                <Dropdown.Item href="#!">
                                    <i className="ph-duotone ph-lifebuoy"></i>
                                    <span>Helpdesk</span>
                                </Dropdown.Item>
                                <Dropdown.Item href="#!">
                                    <i className="ph-duotone ph-scroll"></i>
                                    <span>Invoice</span>
                                </Dropdown.Item>
                                <Dropdown.Item href="#!">
                                    <i className="ph-duotone ph-books"></i>
                                    <span>Online Courses</span>
                                </Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>
                    </div>

                    <SimpleBar className="navbar-content" style={{ maxHeight: "100vh" }}>
                        <Card className="mt-0 pb-2">
                            <Form
                                className="form-search">
                                <i className="ph-duotone ph-magnifying-glass icon-search"></i>
                                <input type="search" className="form-control" placeholder="Search something" />
                            </Form>
                        </Card>
                        <hr />
                        <div className="card mb-0">
                            <div className="d-flex align-items-center">
                                <div className="flex-grow-1 me-2">
                                    <h6 className="mb-0">Module</h6>
                                </div>
                                <div className="flex-shrink-0">
                                    <a href="#" className="avtar avtar-s btn-link-primary">
                                        <i className="ph-duotone ph-plus-circle f-20"></i>
                                    </a>
                                    <div className="avtar avtar-s btn-link-secondary">
                                        <i className="ph-duotone ph-caret-circle-right f-20"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <SubMenuList />
                        <ul className="pc-navbar" id="pc-navbar">

                            <NestedMenu menuItems={menuItems} />
                        </ul>
                        <div className="card nav-action-card bg-brand-color-4">
                            <div
                                className="card-body"
                                style={{ backgroundImage: `url(${navCardBg})` }}
                            >
                                <h5 className="text-dark">Help Center</h5>
                                <p className="text-dark text-opacity-75">
                                    Please contact us for more questions.
                                </p>
                                <Link
                                    to="https://phoenixcoded.support-hub.io/"
                                    className="btn btn-primary"
                                    target="_blank"
                                >
                                    Go to help Center
                                </Link>
                            </div>
                        </div>
                    </SimpleBar>
                    <div className="card pc-user-card">
                        <div className="card-body">
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
                                        <div className="flex-grow-1 ms-3 me-2">
                                            <h6 className="mb-0">Jonh Smith</h6>
                                            <small>Administrator</small>
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
                                                    <li><Dropdown.Item className="pc-user-links">
                                                        <i className="ph-duotone ph-user"></i>
                                                        <span>My Account</span>
                                                    </Dropdown.Item></li>
                                                    <li><Dropdown.Item className="pc-user-links">
                                                        <i className="ph-duotone ph-gear"></i>
                                                        <span>Settings</span>
                                                    </Dropdown.Item></li>
                                                    <li><Dropdown.Item className="pc-user-links">
                                                        <i className="ph-duotone ph-lock-key"></i>
                                                        <span>Lock Screen</span>
                                                    </Dropdown.Item></li>
                                                    <li><Dropdown.Item className="pc-user-links">
                                                        <i className="ph-duotone ph-power"></i>
                                                        <span>Logout</span>
                                                    </Dropdown.Item></li>
                                                </ul>
                                            </Dropdown.Menu>
                                        </Dropdown>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>
        </React.Fragment>
    );
};

export default Header;
