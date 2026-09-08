import { Link } from 'react-router-dom'
import React from 'react'

import vertical from '../../assets/images/landing/lay-vertical.jpg';
import authpage from '../../assets/images/landing/preview-important-auth-page.jpg';
import widgets from '../../assets/images/landing/preview-important-widgets.jpg';
import accountprofile from '../../assets/images/landing/preview-important-account-profile.jpg'
import wizard from '../../assets/images/landing/preview-important-wizard.jpg'
import datatable from '../../assets/images/landing/preview-important-data-table.jpg';
import form from '../../assets/images/landing/preview-important-form.jpg';
import error from '../../assets/images/landing/preview-important-error.jpg';
import coming from '../../assets/images/landing/preview-important-coming-soon.jpg';
import contact from '../../assets/images/landing/preview-important-contact.jpg';

const ImportantPage = () => {
  return (
    <React.Fragment>
      <section className="pt-0">
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-md-8 col-xl-6">
              <h2 className="wow animate__fadeInUp section-title" data-wow-delay="0.2s">Important Pages</h2>
              <p className="mt-lg-4 mt-2 mb-4 mb-md-5 wow animate__fadeInUp" data-wow-delay="0.4s">Unveil the diversity of page layouts within Light Able, including Vertical, Horizontal, and Tab Layouts, each offering unique design options to suit your preferences and project requirements.</p>
            </div>
          </div>
          <div className="row g-4 text-center pages-link">
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="https://light-able-react-components.vercel.app/" target="_blank">
                    <img src={vertical} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="https://light-able-react-components.vercel.app/" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Components <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/pages/login-v1" target="_blank">
                    <img src={authpage} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/pages/login-v1" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Auth Pages <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/widget/w_chart" target="_blank">
                    <img src={widgets} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/widget/w_chart" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Widgets <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/account-profile" target="_blank">
                    <img src={wizard} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/account-profile" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Wizard <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/table/dt_advance" target="_blank">
                    <img src={accountprofile} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/table/dt_advance" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Account Profile <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/forms/form_elements" target="_blank">
                    <img src={datatable} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/forms/form_elements" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Data Tables <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/pages/error-404" target="_blank">
                    <img src={form} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/pages/error-404" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Forms <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/pages/error-404" target="_blank">
                    <img src={error} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/pages/error-404" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Error <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/pages/coming-soon" target="_blank">
                    <img src={coming} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/pages/coming-soon" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Coming Soon <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/pages/contact-us" target="_blank">
                    <img src={contact} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/pages/contact-us" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Contact <i className="ti ti-link text-primary f-22"></i></Link>
            </div>

          </div>
        </div>
      </section>
    </React.Fragment>
  )
}

export default ImportantPage