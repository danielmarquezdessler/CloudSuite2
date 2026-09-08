import BreadcrumbItem from "../../Common/BreadcrumbItem";
import ProductDetails from "../../views/application/E-details/ProductDetails";
import ProductFeature from "../../views/application/E-details/ProductFeature";
import ProductRelated from "../../views/application/E-details/ProductRelated";
import ProductSlider from "../../views/application/E-details/ProductSlider";
import React from "react";
import { Card, Col, Row } from "react-bootstrap";

const EcomProductDetails = () => {
    return (
        <React.Fragment>
            <BreadcrumbItem mainTitle="E-commerce" subTitle="Products" />
            <Row>
                <Col sm={12}>
                    <Card>
                        <Card.Body>
                            <Row>
                                <ProductSlider />
                                <ProductDetails />
                            </Row>
                        </Card.Body>
                    </Card>
                    <ProductFeature />
                    <ProductRelated />
                </Col>
            </Row>

        </React.Fragment>
    );
};


export default EcomProductDetails;