
import {Helmet} from 'react-helmet'
import {Link} from "react-router-dom";
import React from "react";
import { Row, Col } from "react-bootstrap";

interface BreadcrumbItemProps {
  mainTitle: string;
  subTitle: string;
}

const BreadcrumbItem: React.FC<BreadcrumbItemProps> = ({ mainTitle, subTitle }) => {
  return (
    <React.Fragment>
    <Helmet>
      <title>{subTitle} | Light Able ReactJs Dashboard Template</title>
    </Helmet>
    <div className="page-header">
      <div className="page-block">
        <Row className="row align-items-center">
          <Col md={12}>
            <ul className="breadcrumb">
              <li className="breadcrumb-item">
                <Link to="/dashboard">Home</Link>
              </li>
              <li className="breadcrumb-item">
                <Link to="#">{mainTitle}</Link>
              </li>
              <li className="breadcrumb-item" aria-current="page">
                {subTitle}
              </li>
            </ul>
          </Col>
          <Col md={12}>
            <div className="page-header-title">
              <h2 className="mb-0">{subTitle}</h2>
            </div>
          </Col>
        </Row>
      </div>
    </div>
    </React.Fragment>
  );
};

export default BreadcrumbItem;
