import { Col, Row } from "react-bootstrap";
import {Link} from "react-router-dom";


const Footer = () => {
    return (
        <footer className="pc-footer">
            <div className="footer-wrapper container-fluid">
                <Row>
                    <Col sm={6} className="my-1">
                        <p className="m-0">Made with &#9829; by Team <Link to="https://themeforest.net/user/phoenixcoded"
                            target="_blank">Phoenixcoded</Link></p>
                    </Col>
                    <Col sm={6} className="ms-auto my-1">
                        <ul className="list-inline footer-link mb-0 justify-content-sm-end d-flex">
                            <li className="list-inline-item"><Link to="/">Home</Link></li>
                            <li className="list-inline-item"><Link to="https://pcoded.gitbook.io/light-able/"
                                target="_blank">Documentation</Link></li>
                            <li className="list-inline-item"><Link to="https://phoenixcoded.support-hub.io/" target="_blank">Support</Link></li>
                        </ul>
                    </Col>
                </Row>
            </div>
        </footer>
    )
}

export default Footer;