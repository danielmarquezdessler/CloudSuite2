import React from 'react';
import { Col, Row } from 'react-bootstrap';
import Technologys from './Technologys';

const LayoutsDemo = () => {
  return (
    <React.Fragment>
      <section  id="layout-demos">
        <div className="container">
          <Row className="justify-content-center text-center">
            <Col md={8} xl={6}>
              <h2 className="wow animate__fadeInUp section-title" data-wow-delay="0.2s">Layouts Demos</h2>
              <p className="mt-lg-4 mt-2 mb-4 mb-md-5 wow animate__fadeInUp" data-wow-delay="0.4s">Unveil the diversity of page
                layouts within Light Able, including Vertical, Horizontal, and Tab Layouts, each offering unique design
                options to suit your preferences and project requirements.</p>
            </Col>
            <Row className="g-4">
                <Technologys/>
            </Row>
          </Row>
        </div>
      </section>
    </React.Fragment>
  );
};

export default LayoutsDemo;