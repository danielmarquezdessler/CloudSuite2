import React from "react";
import {Link} from "react-router-dom";
import { Card, Col, Form, Row } from "react-bootstrap";

// img
import logodark from "../../assets/images/logo-dark.svg";
import BackImg from '../../assets/images/authentication/img-auth-bg.jpg'

const ResetPasswordV2 = () => {
    return (
        <React.Fragment>
            <div className="auth-main v2" style={{backgroundImage:`url(${BackImg})`}}>
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
                                <h4 className="f-w-500 mb-1">Reset password</h4>
                                <p className="mb-3">Back to <Link to="../pages/login-v2" className="link-primary">Log in</Link></p>
                                <div className=" mb-3">
                                    <Form.Label>Password</Form.Label>
                                    <Form.Control type="password" id="floatingInput" placeholder="Password" />
                                </div>
                                <div className=" mb-3">
                                    <Form.Label>Confirm Password</Form.Label>
                                    <Form.Control type="password" id="floatingInput1" placeholder="Confirm Password" />
                                </div>
                                <div className="d-grid mt-4">
                                    <button type="button" className="btn btn-primary">Reset Password</button>
                                </div>
                                <div className="saprator my-3">
                                    <span>Or continue with</span>
                                </div>
                                <div className="text-center">
                                    <ul className="list-inline mx-auto mt-3 mb-0">
                                        <li className="list-inline-item">
                                            <Link to="https://www.facebook.com/" className="avtar avtar-s rounded-circle bg-facebook" target="_blank">
                                                <i className="fab fa-facebook-f text-white"></i>
                                            </Link>
                                        </li>
                                        <li className="list-inline-item">
                                            <Link to="https://twitter.com/" className="avtar avtar-s rounded-circle bg-twitter" target="_blank">
                                                <i className="fab fa-twitter text-white"></i>
                                            </Link>
                                        </li>
                                        <li className="list-inline-item">
                                            <Link to="https://myaccount.google.com/" className="avtar avtar-s rounded-circle bg-googleplus" target="_blank">
                                                <i className="fab fa-google text-white"></i>
                                            </Link>
                                        </li>
                                    </ul>
                                </div>
                            </Card.Body>
                        </Card>
                    </div>
                </div>
            </div>
        </React.Fragment>
    );
}


export default ResetPasswordV2;
