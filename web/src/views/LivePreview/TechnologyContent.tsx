import React from 'react';

import verticalLayout from '../../assets/images/landing/preview-layouts-vertical.jpg'
import horizontalLayout from '../../assets/images/landing/preview-layouts-horizontal.jpg'
import layoutTab from '../../assets/images/landing/preview-layouts-tab.jpg'
import pagedark from '../../assets/images/landing/preview-page-dark.jpg'

import pageCalender from '../../assets/images/landing/preview-app-calendar.jpg'
import pageChat from '../../assets/images/landing/preview-app-chat.jpg'
import ecommerce from '../../assets/images/landing/preview-app-ecommerce.jpg'
import inbox from '../../assets/images/landing/preview-app-inbox.jpg'
import invoice from '../../assets/images/landing/preview-app-invoice.jpg'

import compact from '../../assets/images/landing/preview-layouts-compact.jpg'
import creative from '../../assets/images/landing/preview-layouts-creative.jpg'
import { Link } from 'react-router-dom';

const TechnologyContent = () => {
    return (
        <React.Fragment>
            <div className="col-md-8 col-xl-9">
                <Link to="#" className="d-md-none btn btn-light-secondary mb-2" data-bs-toggle="offcanvas"
                    data-bs-target="#offcanvas_User_list">
                    Technology
                </Link>
                <div className="tab-content tech-links" id="myTabContent">
                    <div className="tab-pane fade show active" id="technology-tab-pane-1" role="tabpanel" aria-labelledby="technology-tab-1" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Bootstrap Preview</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.2s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img" className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.3s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={horizontalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Horizontal <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.6s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={layoutTab} alt="img" className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Tab <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>


                    <div className="tab-pane fade" id="technology-tab-pane-2" role="tabpanel" aria-labelledby="technology-tab-2" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">React Preview</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={pagedark} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Dark <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={pageCalender} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Calendar <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={pageChat} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Chat <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={ecommerce} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">E-commerce <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={inbox} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Inbox <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={invoice} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Invoice <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>

                    <div className="tab-pane fade" id="technology-tab-pane-3" role="tabpanel" aria-labelledby="technology-tab-3" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Vue.js Preview</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.2s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.4s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={horizontalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Horizontal <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.6s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={compact} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Compact <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.4s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={creative} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Creative <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.6s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={layoutTab} alt="img" className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Tab <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-4" role="tabpanel" aria-labelledby="technology-tab-4" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Laravel</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6 wow animate__fadeInUp" data-wow-delay="0.2s">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-5" role="tabpanel" aria-labelledby="technology-tab-5" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Node.js</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-6" role="tabpanel" aria-labelledby="technology-tab-6">
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Django</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-7" role="tabpanel" aria-labelledby="technology-tab-7" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">ASP</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-8" role="tabpanel" aria-labelledby="technology-tab-8" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">CakePHP</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                    <div className="tab-pane fade" id="technology-tab-pane-9" role="tabpanel" aria-labelledby="technology-tab-9" tabIndex={-1}>
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">MVC5</h5>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-4 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="#" target="_blank">
                                            <img src={verticalLayout} alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Vertical <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>

                    <div className="tab-pane fade" id="technology-tab-pane-10" role="tabpanel" aria-labelledby="technology-tab-10" >
                        <div className="row g-4 text-center">
                            <div className="col-12 text-start">
                                <h5 className="mb=1">Figma</h5>
                                <p>Worth of $129 FREE</p>
                                <hr className="mt-3 mb-1" />
                            </div>
                            <div className="col-lg-6 col-md-6">
                                <div className="card layout-card">
                                    <div className="card-body">
                                        <Link to="dashboard/index.html" target="_blank">
                                            <img src="" alt="img"
                                                className="img-fluid border" />
                                        </Link>
                                    </div>
                                </div>
                                <Link to="#" target="_blank"
                                    className="h5 d-flex align-items-center justify-content-center gap-2">Live Preview <i
                                        className="ti ti-link text-primary f-22"></i></Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default TechnologyContent
