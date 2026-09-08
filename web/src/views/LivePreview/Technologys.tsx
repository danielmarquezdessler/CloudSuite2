import React, { useState } from 'react';
import bootstrap from '../../assets/images/landing/techcard-bs.svg'
import react from '../../assets/images/landing/techcard-react.svg'
import vue from '../../assets/images/landing/techcard-vue.svg'
import laravel from '../../assets/images/landing/techcard-laravel.svg'
import node from '../../assets/images/landing/techcard-node.svg'
import django from '../../assets/images/landing/techcard-django.svg'
import net from '../../assets/images/landing/techcard-net.svg'
import mvc5 from '../../assets/images/landing/techcard-mvc5.svg'
import figma from '../../assets/images/landing/techcard-figma.svg'
import checkPhp from '../../assets/images/landing/techcard-cakephp.svg'
import TechnologyContent from './TechnologyContent';
import { Card, CardBody, Col } from 'react-bootstrap';

const Technologys = () => {
    const [display, setDisplay] = useState(null)
    const handleDisplay = (id: any) => {
        if (display === id) {
            setDisplay(null)
        } else {
            setDisplay(id)
        }
    }

    return (
        <React.Fragment>
            <Col md={4} xl={3}>
                <div className="offcanvas-md offcanvas-start chat-offcanvas" tabIndex={-1} id="offcanvas_User_list">
                    <div className="offcanvas-header">
                        <h5 className="offcanvas-title" id="offcanvasLabel">Technology</h5>
                        <button className="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#offcanvas_User_list"
                            aria-label="Close"></button>
                    </div>
                    <div className="offcanvas-body p-0">
                        <div className="row g-2 nav nav-tabs technology-tabs" id="myTab" role="tablist">
                            <div className="col-12 nav-item" role="presentation">
                                <a className={`nav-link ${display === 1 ? 'active' : ''}`} id="technology-tab-1" data-bs-toggle="tab"
                                    data-bs-target="#technology-tab-pane-1" role="tab" aria-controls="technology-tab-pane-1"
                                    aria-selected="true">
                                    <Card className="technology-card wow animate__fadeInUp section-title " data-wow-delay="0.1s" onClick={() => handleDisplay(1)}>
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={bootstrap} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2 ">
                                                    <h5 className="mb-0">Bootstrap</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </div>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 2 ? 'active' : ''}`} id="technology-tab-2" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-2"
                                    role="tab" aria-controls="technology-tab-pane-2" aria-selected="true" onClick={() => handleDisplay(2)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title " style={{ marginTop: 0 }} data-wow-delay="0.2s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={react} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">React Next.js</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 3 ? 'active' : ''}`} id="technology-tab-3" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-3"
                                    role="tab" aria-controls="technology-tab-pane-3" aria-selected="true" onClick={() => handleDisplay(3)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.3s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={vue} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">Vue.js</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 4 ? 'active' : ""}`} id="technology-tab-4" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-4"
                                    role="tab" aria-controls="technology-tab-pane-4" aria-selected="true" onClick={() => handleDisplay(4)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.4s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={laravel} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">Laravel</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 5 ? 'active' : ""}`} id="technology-tab-5" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-5"
                                    role="tab" aria-controls="technology-tab-pane-5" aria-selected="true" onClick={() => handleDisplay(5)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.5s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={node} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">Node.js</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 6 ? 'active' : ""}`} id="technology-tab-6" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-6"
                                    role="tab" aria-controls="technology-tab-pane-6" aria-selected="true" onClick={() => handleDisplay(6)}>
                                    <Card className="card technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.6s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={django} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">Django</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 7 ? 'active' : ""}`} id="technology-tab-7" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-7"
                                    role="tab" aria-controls="technology-tab-pane-7" aria-selected="true" onClick={() => handleDisplay(7)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.7s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={net} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">ASP</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="col-12 nav-item" role="presentation">
                                <a className={`nav-link ${display === 8 ? 'active' : ""}`} id="technology-tab-8" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-8"
                                    role="tab" aria-controls="technology-tab-pane-8" aria-selected="true" onClick={() => handleDisplay(8)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.8s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={checkPhp} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2 ">
                                                    <h5 className="mb-0">CakePHP</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 9 ? 'active' : ""}`} id="technology-tab-9" data-bs-toggle="tab" data-bs-target="#technology-tab-pane-9"
                                    role="tab" aria-controls="technology-tab-pane-9" aria-selected="true" onClick={() => handleDisplay(9)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="0.9s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={mvc5} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">MVC5</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                            <Col className="nav-item" role="presentation">
                                <a className={`nav-link ${display === 10 ? 'active' : ""}`} id="technology-tab-10" data-bs-toggle="tab"
                                    data-bs-target="#technology-tab-pane-10" role="tab" aria-controls="technology-tab-pane-10"
                                    aria-selected="true" onClick={() => handleDisplay(10)}>
                                    <Card className="technology-card wow animate__fadeInUp section-title" style={{ marginTop: 0 }} data-wow-delay="1s">
                                        <CardBody>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={figma} alt="images" className="tech-img" />
                                                </div>
                                                <div className="flex-grow-1 mx-2">
                                                    <h5 className="mb-0">Figma</h5>
                                                </div>
                                            </div>
                                        </CardBody>
                                    </Card>
                                </a>
                            </Col>
                        </div>
                    </div>
                </div>
            </Col>
            <TechnologyContent />
        </React.Fragment>
    );
}

export default Technologys;
