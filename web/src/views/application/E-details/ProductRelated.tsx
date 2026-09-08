import {Link} from "react-router-dom";
import React from "react";
import { Card, CardBody, Col, Row } from "react-bootstrap";

import { productData } from "../../../Common/jsonData";

const ProductRelated = () => {
    return (
        <React.Fragment>
            <Card>
                <Card.Header>
                    <h5>Related Product</h5>
                </Card.Header>
                <Card.Body>
                    <Row className="gy-3">
                        {(productData || [])?.map((product: any, index: number) => (
                            <Col sm={6} xxl={3} xl={4} key={index}>
                                <Card className="product-card mb-0">
                                    <div className="card-img-top">
                                        <Link to="../application/ecom_product-details">
                                            <img src={product.imgSrc} alt="image" className="img-prod img-fluid" />
                                        </Link>
                                        <CardBody className="position-absolute end-0 top-0">
                                            <div className="form-check prod-likes">
                                                <input type="checkbox" className="form-check-input" />
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-heart prod-likes-icon">
                                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                                </svg>
                                            </div>
                                        </CardBody>
                                        {product?.discount && <CardBody className="position-absolute start-0 top-0">
                                            <span className="badge bg-danger badge-prod-card">{product?.discount}</span>
                                        </CardBody>}
                                    </div>
                                    <Card.Body>
                                        <Link to="../application/ecom_product-details">
                                            <p className="prod-content mb-0 text-muted">{product.title}</p>
                                        </Link>
                                        <div className="d-flex align-items-center justify-content-between mt-2 mb-3 flex-wrap">
                                            <h4 className="mb-0 text-truncate">
                                                <b>{product.price}</b> <span className="text-sm text-muted f-w-400 text-decoration-line-through">{product.discountPrice}</span>
                                            </h4>
                                            <div className="d-inline-flex align-items-center">
                                                <i className="ph-duotone ph-star text-warning me-1"></i>
                                                {product.rating} <small className="text-muted">/ 5</small>
                                            </div>
                                        </div>
                                        <div className="d-flex">
                                            <div className="flex-shrink-0">
                                                <a href="#" className="avtar avtar-s btn-link-secondary btn-prod-card">
                                                    <i className="ph-duotone ph-eye f-18"></i>
                                                </a>
                                            </div>
                                            <div className="flex-grow-1 ms-3">
                                                <div className="d-grid">
                                                    <button className="btn btn-link-secondary btn-prod-card">Add to cart</button>
                                                </div>
                                            </div>
                                        </div>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Card.Body>
            </Card>
        </React.Fragment >
    );
}

export default ProductRelated;