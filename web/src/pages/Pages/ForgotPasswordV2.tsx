import React from "react";
import {Link} from "react-router-dom";
import { Card, Col, Form, Row } from "react-bootstrap";
import BcakImg from '../../assets/images/authentication/img-auth-bg.jpg'

// img
import logodark from "../../assets/images/logo-dark.svg";

const ForgotPassowordV2 = () => {
    return (
        <React.Fragment>
            <div className="auth-main v2" style={{backgroundImage: `url(${BcakImg})`}}>
                <div className="bg-overlay bg-dark-custom"></div>
                <div className="auth-wrapper">
                    <div className="auth-sidecontent">
                        <div className="auth-sidefooter">
                            <img src={logodark} className="img-brand img-fluid" alt="images" />
                            <hr className="mb-3 mt-4" />
                            <Row>
                                <Col className="my-1">
                                    <p className="m-0">Light Able ♥ crafted by Team <Link to="https://themeforest.net/user/phoenixcoded" target="_blank"> Phoenixcoded</Link></p>
                                </Col>
                                <div className="col-auto my-1">
                                    <ul className="list-inline footer-link mb-0">
                                        <li className="list-inline-item"><Link to="../index">Home</Link></li>
                                        <li className="list-inline-item"><Link to="https://pcoded.gitbook.io/light-able/" target="_blank">Documentation</Link></li>
                                        <li className="list-inline-item"><Link to="https://phoenixcoded.support-hub.io/" target="_blank">Support</Link></li>
                                    </ul>
                                </div>
                            </Row>
                        </div>
                    </div>
                    <div className="auth-form">
                        <Card className="my-5 mx-3">
                            <Card.Body>
                                <h4 className="f-w-500 mb-1">Forgot Password</h4>
                                <p className="mb-3">Back to <Link to="../pages/login-v2" className="link-primary">Log in</Link></p>
                                <div className="mb-3">
                                    <Form.Label>Email Address</Form.Label>
                                    <Form.Control type="email" id="floatingInput" placeholder="Email Address" />
                                </div>
                                <div className="d-grid mt-3">
                                    <button type="button" className="btn btn-primary">Send reset email</button>
                                </div>
                            </Card.Body>
                        </Card>
                    </div>
                </div>
            </div>
        </React.Fragment>
    );
}

export default ForgotPassowordV2;
