import React from 'react'
import { Row, Col, Card, CardBody } from 'react-bootstrap'
import { Link } from 'react-router-dom'
const PlanDetails = () => {
  return (
    <React.Fragment>
      <Row className='g-3'>
        <Col md={6} xl={4}>
          <Card className='shadow-none border mb-0'>
            <CardBody>
              <h6 className="mb-3 fw-medium">Membership Plan</h6>
              <h4 className="mb-3 fw-normal text-muted">Addicted $150</h4>
              <Link to="#" className="link-primary d-flex align-items-center gap-2">See more Plan <i
                className="ti ti-chevron-right"></i></Link>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={4}>
          <Card className='shadow-none border mb-0'>
            <CardBody>
              <h6 className="mb-3 fw-medium">Manage</h6>
              <h4 className="mb-3 fw-normal text-muted">Membership</h4>
              <Link to="#" className="link-primary d-flex align-items-center gap-2">Update, Cancel and more <i
                className="ti ti-chevron-right"></i></Link>
            </CardBody>
          </Card>
        </Col>
        <Col md={12} xl={4}>
          <Card className='shadow-none border mb-0'>
            <CardBody>
              <h6 className="mb-3 fw-medium">Renewal Date</h6>
              <h4 className="mb-3 fw-normal text-muted">120 November, 2024</h4>
              <Link to="#" className="link-primary d-flex align-items-center gap-2">View payment method <i
                className="ti ti-chevron-right"></i></Link>
            </CardBody>
          </Card>
        </Col>
        <Col>
          <Card className='shadow-none border mb-0'>
            <CardBody>
              <h6 className="mb-3">Delete Account</h6>
              <p className="mb-3">Would you like to delete your account? <br /> Deleting your account will remove all
                the content associated with it.</p>
              <button className="btn btn-primary">Delete Account</button>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </React.Fragment>
  )
}

export default PlanDetails
