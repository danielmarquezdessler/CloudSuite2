import React, { useState } from "react";
import { Card, Col, Form } from "react-bootstrap";

import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Navigation, Thumbs } from 'swiper/modules';

import 'swiper/swiper-bundle.css';
import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';

// img
import product1 from '../../../assets/images/application/img-prod-1.jpg';
import product2 from '../../../assets/images/application/img-prod-2.jpg';
import product3 from '../../../assets/images/application/img-prod-3.jpg';
import product4 from '../../../assets/images/application/img-prod-4.jpg';
import product5 from '../../../assets/images/application/img-prod-5.jpg';
import product6 from '../../../assets/images/application/img-prod-6.jpg';
import product7 from '../../../assets/images/application/img-prod-7.jpg';
import product8 from '../../../assets/images/application/img-prod-8.jpg';
import {Link} from "react-router-dom";

const ProductSlider = () => {
    const [thumbsSwiper] = useState<any>(null);
    return (
        <React.Fragment>
            <Col md={6}>
                <div className="sticky-md-top product-sticky">
                    <div id="carouselExampleCaptions" className="carousel slide ecomm-prod-slider" data-bs-ride="carousel">
                        <div className="carousel-inner bg-light rounded position-relative">
                            <Card.Body className="position-absolute end-0 top-0">
                                <Form.Check className="prod-likes">
                                    <Form.Check.Input type="checkbox" />
                                    <i data-feather="heart" className="prod-likes-icon"></i>
                                </Form.Check>
                            </Card.Body>
                            <Card.Body className="position-absolute bottom-0 end-0">
                                <ul className="list-inline ms-auto mb-0 prod-likes">
                                    <li className="list-inline-item m-0">
                                        <Link to="#" className="avtar avtar-xs text-white text-hover-primary">
                                            <i className="ti ti-zoom-in f-18"></i>
                                        </Link>
                                    </li>
                                    <li className="list-inline-item m-0">
                                        <Link to="#" className="avtar avtar-xs text-white text-hover-primary">
                                            <i className="ti ti-zoom-out f-18"></i>
                                        </Link>
                                    </li>
                                    <li className="list-inline-item m-0">
                                        <Link to="#" className="avtar avtar-xs text-white text-hover-primary">
                                            <i className="ti ti-rotate-clockwise f-18"></i>
                                        </Link>
                                    </li>
                                </ul>
                            </Card.Body>
                        </div>
                        <Swiper
                            spaceBetween={10}
                            navigation={false}
                            modules={[Navigation, FreeMode, Thumbs]}
                            thumbs={{ swiper: thumbsSwiper }}
                            className="mySwiper2">
                            <SwiperSlide>
                                <img src={product1} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product2} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product3} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product4} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product5} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product6} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product7} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                            <SwiperSlide>
                                <img src={product8} className="d-block rounded-3 img-fluid" alt="Product images" />
                            </SwiperSlide>
                        </Swiper>
                        <ol className="list-inline carousel-indicators position-relative product-carousel-indicators my-sm-3 mx-0">

                            <Swiper
                                // onSwiper={setThumbsSwiper}
                                // spaceBetween={5}
                                breakpoints={{
                                    0: {
                                        slidesPerView: 5,
                                        spaceBetween: 10,
                                      },
                                      550: {
                                        slidesPerView: 6,
                                        spaceBetween: 10,
                                      },
                                      1024: {
                                        slidesPerView: 5,
                                        spaceBetween: 10,
                                      },
                                      1200: {
                                        slidesPerView: 6,
                                        spaceBetween: 20,
                                      },
                                  }} 
                                slidesPerView={8}
                                freeMode={true}
                                modules={[Navigation, FreeMode, Thumbs]}
                                thumbs={{swiper:thumbsSwiper}}>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product1} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product2} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product3} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product4} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product5} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product6} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product7} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                                <SwiperSlide>
                                    <li className="list-inline-item w-100 h-auto">
                                        <img src={product8} className="d-block rounded-2 img-fluid" alt="Product images" />
                                    </li>
                                </SwiperSlide>
                            </Swiper>
                        </ol>
                    </div>
                </div>
            </Col>
        </React.Fragment>
    );
}

export default ProductSlider;