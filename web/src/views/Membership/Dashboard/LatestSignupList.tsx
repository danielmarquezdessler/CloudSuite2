import React from 'react'
import avatar1 from '../../../assets/images/user/avatar-1.jpg'
import avatar2 from '../../../assets/images/user/avatar-2.jpg'
import avatar3 from '../../../assets/images/user/avatar-3.jpg'
import avatar4 from '../../../assets/images/user/avatar-4.jpg'
import avatar5 from '../../../assets/images/user/avatar-5.jpg'
import { Card, CardBody, CardHeader, Col } from 'react-bootstrap'

const LatestSignupList = () => {
    return (
        <React.Fragment>
            <Col lg={7} md={12}>
                <Card className="table-card"> 
                    <CardHeader>
                        <div className="d-flex align-items-center justify-content-between">
                            <h5 className="mb-0">Latest Signup List</h5>
                            <button className="btn btn-sm btn-link-primary">View All</button>
                        </div>
                    </CardHeader>
                    <CardBody className="pb-0">
                        <div className="table-responsive">
                            <table className="table table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Joining Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={avatar4} alt="user image"
                                                        className="img-radius wid-40 align-top m-r-15" />
                                                </div>
                                                <div className="flex-grow-1 ms-3">
                                                    <h6 className="mb-0">Airi Satou</h6>
                                                </div>
                                            </div>
                                        </td>
                                        <td>satou123@gmail.com</td>
                                        <td>2023/09/12</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={avatar1} alt="user image"
                                                        className="img-radius wid-40 align-top m-r-15" />
                                                </div>
                                                <div className="flex-grow-1 ms-3">
                                                    <h6 className="mb-0">Ashton Cox</h6>
                                                </div>
                                            </div>
                                        </td>
                                        <td>ashton@gmail.com</td>
                                        <td>2023/12/24</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={avatar2} alt="user image"
                                                        className="img-radius wid-40 align-top m-r-15" />
                                                </div>
                                                <div className="flex-grow-1 ms-3">
                                                    <h6 className="mb-0">Bradley Greer</h6>
                                                </div>
                                            </div>
                                        </td>
                                        <td>greer05@gmail.com</td>
                                        <td>2022/09/19</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={avatar3} alt="user image"
                                                        className="img-radius wid-40 align-top m-r-15" />
                                                </div>
                                                <div className="flex-grow-1 ms-3">
                                                    <h6 className="mb-0">Brielle Williamson</h6>
                                                </div>
                                            </div>
                                        </td>
                                        <td>bw23@gmail.com</td>
                                        <td>2022/08/22</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={avatar5} alt="user image"
                                                        className="img-radius wid-40 align-top m-r-15" />
                                                </div>
                                                <div className="flex-grow-1 ms-3">
                                                    <h6 className="mb-0">Colleen Hurst</h6>
                                                </div>
                                            </div>
                                        </td>
                                        <td>hurst006@gmail.com</td>
                                        <td>202a2/06/26</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardBody>
                </Card>
            </Col>
        </React.Fragment>
    )
}

export default LatestSignupList
