import React from 'react'
import { SimpleContent } from './DataContent'
import { Card, CardBody, Col } from 'react-bootstrap'

const SimpleData = () => {
    return (
        <React.Fragment>
            {   
                SimpleContent.map((items:any, index:any) => {
                    return (
                        <Col xxl={3} md={6} key={index}>
                            <Card>
                                <CardBody className="card-body">
                                    <div className="d-flex align-items-center">
                                        <div className="flex-grow-1 me-3">
                                            <p className="mb-1 fw-medium text-muted">{items.lable}</p>
                                            <h4 className="mb-1">{items.value}</h4>
                                            <p className="mb-0 text-sm">{items.duration}</p>
                                        </div>
                                        <div className="flex-shrink-0">
                                            <div className={`avtar avtar-l  rounded-circle ${items.iconColor}`}>
                                                <i className={items.icon}></i>
                                            </div>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        </Col>
                    )
                })
            }
        </React.Fragment>
    )
}

export default SimpleData
