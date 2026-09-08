import React, { useState } from 'react'
import { Row, Col, Card, CardBody, CardHeader } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import PlanDetails from './PlanDetails'

function SettingTop() {

    const [formData, setFormData] = useState({
        email: "",
        newpassword: "",
        currentpassword: ""
    })

    const handleFormData = (e: any) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    }

    return (
        <React.Fragment>
            <CardHeader className="d-flex align-items-center justify-content-between py-3">
                <h5>Setting</h5>
                <Link className="avtar avtar-s btn-link-secondary" to="#">
                    <i className="ti ti-bookmarks f-18"></i>
                </Link>
            </CardHeader>
            <CardBody>
                <Card className='shadow-none border'>
                    <CardHeader>
                        <div className="d-flex align-items-center">
                            <div className="flex-shrink-0">
                                <div className="avtar avtar-l btn-light-secondary rounded-circle">
                                    <i className="ti ti-photo f-18"></i>
                                </div>
                            </div>
                            <div className="flex-grow-1 mx-3">
                                <h6 className="mb-0">Airi Satou</h6>
                                <p className="mb-0">Maiduguri, Borno State</p>
                            </div>
                            <div className="flex-shrink-0">
                                <button className="btn btn-sm btn-light-secondary"><i className="ti ti-edit"></i> Edit</button>
                            </div>
                        </div>
                    </CardHeader>

                    <CardBody>
                        <Row className="g-3">
                            <Col md={6}>
                                <Card className='shadow-none border mb-0 h-100'>
                                    <CardBody>
                                        <div className="d-flex align-items-center">
                                            <div className="flex-grow-1 me-3">
                                                <h6 className="mb-0">Email Address</h6>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <button className="btn btn-sm btn-light-secondary"><i className="ti ti-edit"></i> Edit</button>
                                            </div>
                                        </div>
                                        <div className="mb-3 mt-3">
                                            <label className="form-label">Your email address is</label>
                                            <input type="email" name="email" value={formData.email} className="form-control" placeholder="Enter email"
                                                onChange={handleFormData} />
                                        </div>
                                    </CardBody>
                                </Card>
                            </Col>
                            <Col md={6}>
                                <Card className='shadow-none border mb-0 h-100'>
                                    <CardBody>
                                        <h6 className="mb-2">Password</h6>
                                        <Row>
                                            <Col sm={6}>
                                                <div className="mb-3">
                                                    <label className="form-label">New Password</label>
                                                    <input type="password" value={formData.newpassword} name="newpassword" className="form-control" placeholder="Enter New Password"
                                                        onChange={handleFormData} />
                                                </div>
                                            </Col>
                                            <Col sm={6}>
                                                <div className="mb-3">
                                                    <label className="form-label">Current Password</label>
                                                    <input type="password" name="currentpassword" value={formData.currentpassword} className="form-control" placeholder="Enter Current Password"
                                                        onChange={handleFormData} />
                                                </div>
                                            </Col>
                                        </Row>
                                        <p>Can’t Remember your current password? <a href="#"
                                            className="link-primary text-decoration-underline">Reset your password</a></p>
                                        <button className="btn btn-primary">Save Password</button>
                                    </CardBody>
                                </Card>
                            </Col>
                        </Row>
                    </CardBody>
                </Card>
                <PlanDetails />
            </CardBody>
        </React.Fragment>
    )
}

export default SettingTop
