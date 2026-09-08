import React from 'react'
const Calendar = () => {
    return (
        <React.Fragment>
            <div className="col-lg-5 col-md-12">
                <div className="card">
                    <div className="card-body">
                        <h5 className="mb-2">Calendar</h5>
                        <p>Aug 10, Mon <span className="badge text-bg-primary">TODAY</span></p>
                        <div className="card overflow-hidden mb-2">
                            <div className="card-body px-3 py-2 border-start border-4 border-success">
                                <h6>Realize offers!</h6>
                                <p className="mb-0">16:00</p>
                            </div>
                        </div>
                        <div className="card overflow-hidden mb-2">
                            <div className="card-body px-3 py-2 border-start border-4 border-warning">
                                <h6>Add new members.</h6>
                                <p className="mb-0">14:00</p>
                            </div>
                        </div>
                        <div className="card overflow-hidden mb-2">
                            <div className="card-body px-3 py-2 border-start border-4 border-primary">
                                <h6>Add new benefit list.</h6>
                                <p className="mb-0">13:00</p>
                            </div>
                        </div>
                        <div className="card overflow-hidden mb-0">
                            <div className="card-body px-3 py-2 border-start border-4 border-danger">
                                <h6>Second offer is end!</h6>
                                <p className="mb-0">09:00</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </React.Fragment>
    )
}

export default Calendar
