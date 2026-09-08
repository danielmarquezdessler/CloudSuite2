import BreadcrumbItem from "../../Common/BreadcrumbItem";
import React, {  useEffect, useState } from "react";
import { Card, Col, Row } from "react-bootstrap";

const Loading = () => {

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const elem = document.querySelector('.loader') as HTMLElement;
        let fadeInInterval: any;
        let fadeOutInterval: any;

        const fadeIn = (timing: number) => {
            let newValue = 0;
            elem.style.display = 'flex';
            elem.style.opacity = '0';
            fadeInInterval = setInterval(() => {
                if (newValue < 1) {
                    newValue += 0.01;
                } else if (newValue === 1) {
                    clearInterval(fadeInInterval);
                }
                elem.style.opacity = String(newValue);
            }, timing);
        };

        const fadeOut = (timing: number) => {
            let newValue = 1;
            elem.style.opacity = '1';
            fadeOutInterval = setInterval(() => {
                if (newValue > 0) {
                    newValue -= 0.01;
                } else if (newValue < 0) {
                    elem.style.opacity = '0';
                    elem.style.display = 'none';
                    clearInterval(fadeOutInterval);
                }
                elem.style.opacity = String(newValue);
            }, timing);
        };

        if (isLoading) {
            clearInterval(fadeInInterval);
            clearInterval(fadeOutInterval);
            fadeIn(3);
            setTimeout(() => {
                clearInterval(fadeInInterval);
                clearInterval(fadeOutInterval);
                fadeOut(3);
            }, 4000);
        }

        // Cleanup function
        return () => {
            clearInterval(fadeInInterval);
            clearInterval(fadeOutInterval);
        };
    }, [isLoading]);

    return (
        <React.Fragment>
            <BreadcrumbItem mainTitle="Pages" subTitle="Loading" />
            <Row>
                <Col sm={12}>
                    <Card>
                        <Card.Body>
                            <Row className="mb-0">
                                <label className="col-form-label col-lg-3 col-sm-12 text-lg-end">Loader</label>
                                <Col lg={6} md={9} sm={12}>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setIsLoading(!isLoading)} // Toggle isLoading state
                                    >
                                        Show Loader
                                    </button>
                                    <p className="text-muted mt-3 mb-0">Click the button to toggle the loader</p>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {isLoading && (
                <div className="loader">
                    <div className="p-4 text-center">
                        <div className="custom-loader"></div>
                        <h2 className="my-3 f-w-400">Loading..</h2>
                        <p className="mb-0">Please wait while we get your information from the web</p>
                    </div>
                </div>
            )}

        </React.Fragment>
    )
}




export default Loading