import { Col, Row } from "react-bootstrap";


const Footer = () => {
    return (
        <footer className="pc-footer">
            <div className="footer-wrapper container-fluid">
                <Row>
                    <Col sm={6} className="my-1">
                        <p className="m-0">CloudSuite 2 · Gestión de campañas políticas</p>
                    </Col>
                    <Col sm={6} className="ms-auto my-1">
                        <p className="mb-0 text-sm text-sm-end">Plataforma en preparación</p>
                    </Col>
                </Row>
            </div>
        </footer>
    )
}

export default Footer;
