import React, { useState,useEffect,useRef } from 'react';
import Notifacation from './NotificationData';
import { Link } from 'react-router-dom';
import { Card, CardBody, Col } from 'react-bootstrap';

function Notification() {
    const [display, setDisplay] = useState(false)
    const dropdownRef = useRef(null)
  
    const handleDropDown = () => {
      setDisplay(!display)
    }
    const handleClickOutside = (event: any) => {
      if (
        dropdownRef.current &&
        !event.target.closest('.dropdown')
      ) {
        setDisplay(false);
      }
    };
    useEffect(() => {
      document.addEventListener('click', handleClickOutside);
  
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }, []);


    return (
        <React.Fragment>
            <Col lg={5} md={12}>
                <Card > 
                    <CardBody>
                        <div className="d-flex align-items-center justify-content-between mb-3">
                            <h5 className="mb-0">Notifications</h5>
                            <div className="dropdown">
                                <Link to="#" 
                                ref={dropdownRef}
                                className={`avtar avtar-s btn-link-secondary dropdown-toggle arrow-none ${display === true ? 'show' : ''}`}
                                    data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false" onClick={handleDropDown}>
                                    <i className="ti ti-dots-vertical f-18"></i>
                                </Link>
                                <div className={`dropdown-menu dropdown-menu-end ${display === true ? 'show show2' : ''}`} >
                                    <Link className="dropdown-item" to="#" onClick={handleDropDown}>Today</Link>
                                    <Link className="dropdown-item" to="#" onClick={handleDropDown}>Weekly</Link>
                                    <Link className="dropdown-item" to="#" onClick={handleDropDown}>Monthly</Link>
                                </div>
                            </div>
                        </div>

                        <ul className="list-group list-group-flush">
                            {
                                Notifacation.map((items: any, index: number) => {
                                    return (
                                        <li key={index} className="list-group-item px-0 py-2">
                                            <div className="d-flex align-items-center">
                                                <div className="flex-shrink-0">
                                                    <img src={items.images} alt="img" className="wid-40 rounded-circle" />
                                                </div>
                                                <div className="flex-grow-1 mx-3">
                                                    <h6 className="mb-0">{items.content}</h6>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <p className="mb-0 text-muted">{items.time}</p>
                                                </div>
                                            </div>
                                        </li>
                                    )
                                })
                            }
                        </ul>
                    </CardBody>
                </Card>
            </Col>
        </React.Fragment>
    )
}

export default Notification
