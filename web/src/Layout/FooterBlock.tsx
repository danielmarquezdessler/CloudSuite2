import React from "react";

import logoDark from '../assets/images/logo-dark.svg'
import { Col, Row } from "react-bootstrap";
import { Link } from "react-router-dom";


const FooterBlock = () => {
    return (
        <React.Fragment>
            <div className="auth-sidefooter">
                <img src={logoDark} className="img-brand img-fluid" alt="images" />
                <hr className="mb-3 mt-4" />
                <Row>
                    <Col className="my-1">
                        <p className="m-0">Made with &#9829; by Team
                            <Link to="https://themeforest.net/user/phoenixcoded" target="_blank"> Phoenixcoded</Link></p>
                    </Col>
                    <div className="col-auto my-1">
                        <ul className="list-inline footer-link mb-0">
                            <li className="list-inline-item"><Link to="/dashboard">Home</Link></li>
                            <li className="list-inline-item"><Link to="https://pcoded.gitbook.io/light-able/" target="_blank">Documentation</Link></li>
                            <li className="list-inline-item"><Link to="https://phoenixcoded.support-hub.io/" target="_blank">Support</Link></li>
                        </ul>
                    </div>
                </Row>
            </div>
        </React.Fragment>
    );
};

export default FooterBlock;