import { Link } from 'react-router-dom'
import React from 'react'


import invoice from '../../assets/images/landing/preview-app-invoice.jpg';
import social from '../../assets/images/landing/preview-app-social.jpg';
import inbox from '../../assets/images/landing/preview-app-inbox.jpg';
import ecommerce from '../../assets/images/landing/preview-app-ecommerce.jpg';
import chat from '../../assets/images/landing/preview-app-chat.jpg';
import calendar from '../../assets/images/landing/preview-app-calendar.jpg';
import gellery from '../.././assets/images/landing/preview-app-gallery.jpg'

const AppsPage = () => {
  return (
    <React.Fragment>
      <section className="pt-0">
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-md-8 col-xl-6">
              <h2 className="wow animate__fadeInUp section-title" data-wow-delay="0.2s">Apps</h2>
              <p className="mt-lg-4 mt-2 mb-4 mb-md-5 wow animate__fadeInUp" data-wow-delay="0.4s">Unveil the diversity of page layouts within Light Able, including Vertical, Horizontal, and Tab Layouts, each offering unique design options to suit your preferences and project requirements.</p>
            </div>
          </div>
          <div className="row g-4 text-center pages-link">
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/invoice-list" target="_blank">
                    <img src={invoice} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/invoice-list" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Invoice <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/social-media" target="_blank">
                    <img src={social} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/social-media" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Social <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/mail" target="_blank">
                    <img src={inbox} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/mail" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Inbox <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/ecom_product" target="_blank">
                    <img src={ecommerce} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/ecom_product" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">E-commerce <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/calendar" target="_blank">
                    <img src={gellery} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/calendar" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Gallery <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/chat" target="_blank">
                    <img src={calendar} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/chat" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Calendar <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
            <div className="col-lg-4 col-md-6">
              <div className="card layout-card">
                <div className="card-body">
                  <Link to="/application/chat" target="_blank">
                    <img src={chat} alt="img" className="img-fluid border" />
                  </Link>
                </div>
              </div>
              <Link to="/application/chat" target="_blank" className="h5 d-flex align-items-center justify-content-center gap-2">Chat <i className="ti ti-link text-primary f-22"></i></Link>
            </div>
          </div>
        </div>
      </section>
    </React.Fragment>
  )
}

export default AppsPage