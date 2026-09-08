import React from 'react'


import eagames from '../../assets/images/landing/client-eagames.svg';
import haswent from '../../assets/images/landing/client-haswent-2.svg';
import crystal from '../../assets/images/landing/client-crystal-1.svg';
import vodafone from '../../assets/images/landing/client-vodafone.svg';

const Companies = () => {
  return (
    <React.Fragment>
      <section className="border-bottom py-lg-5 py-4">
        <div className="container">
          <div className="row justify-content-center text-center">
            <div className="col-md-8 col-xl-6">
              <h2 className="wow animate__fadeInUp" data-wow-delay="0.1s">Trusted By</h2>
              <p className="mt-lg-4 mt-2 mb-4 mb-md-5 wow animate__fadeInUp" data-wow-delay="0.2s">From budding startups to industry-leading entrepreneurs, our template is shaping the future of great products.</p>
            </div>
            <div className="col-md-12">
              <div className="row justify-content-center client-block g-lg-4 g-3">
                <div className="col-auto wow animate__fadeInRight" data-wow-delay="0.3s"><img
                  src={eagames} alt="img" className="img-fluid" /></div>
                <div className="col-auto wow animate__fadeInRight" data-wow-delay="0.4s"><img
                  src={haswent} alt="img" className="img-fluid" /></div>
                <div className="col-auto wow animate__fadeInRight" data-wow-delay="0.5s"><img
                  src={crystal} alt="img" className="img-fluid" /></div>
                <div className="col-auto wow animate__fadeInRight" data-wow-delay="0.6s"><img
                  src={vodafone} alt="img" className="img-fluid" /></div>
                <div className="col-auto wow animate__fadeInRight" data-wow-delay="0.7s"><img
                  src={eagames} alt="img" className="img-fluid" /></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </React.Fragment>
  )
}

export default Companies