import React from "react";
import { Link } from "react-router-dom";
import { Card, Col, Form, Row } from "react-bootstrap";
import BackImg from '../../assets/images/authentication/img-auth-bg.jpg'

// img
import logodark from "../../assets/images/logo-dark.svg";

const CodeVerificationV2 = () => {
    return (
        <React.Fragment>
            <div className="auth-main v2" style={{ backgroundImage: `url(${BackImg})` }}>
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
                                <h4 className="f-w-500 mb-1">Please confirm with OTP</h4>
                                <p className="mb-0">We`ve send you code on jone. ****@company.com</p>
                                <p className="mb-3">Did not receive the email?<Link to="#" className="link-primary ms-1">Resend code</Link></p>
                                <Row className="my-4 text-center">
                                    <Col>
                                        <Form.Control type="text" className="text-center" placeholder="0" />
                                    </Col>
                                    <Col>
                                        <Form.Control type="text" className="text-center" placeholder="0" />
                                    </Col>
                                    <Col>
                                        <Form.Control type="text" className="text-center" placeholder="0" />
                                    </Col>
                                    <Col>
                                        <Form.Control type="text" className="text-center" placeholder="0" />
                                    </Col>
                                </Row>
                                <div className="d-grid mt-4">
                                    <button type="button" className="btn btn-primary">Continue</button>
                                </div>
                            </Card.Body>
                        </Card>
                    </div>
                </div>
            </div>
        </React.Fragment >
    );
}


export default CodeVerificationV2;