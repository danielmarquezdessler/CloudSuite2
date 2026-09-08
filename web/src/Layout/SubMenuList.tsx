import React from 'react'
import { Link } from 'react-router-dom'

const SubMenuList = () => {
    return (
        <React.Fragment>
            <div className="pc-submenu-list-wrapper">
                <ul className="pc-submenu-list list-unstyled mb-0">
                    <li><Link className="active" to="#">Compact</Link></li>
                    <li><a href="#">Creative</a></li>
                    <li><a href="#">Horizontal</a></li>
                    <li><a href="#">Tab</a></li>
                    <li><a href="#">Vertical</a></li>
                    <li><a href="#">Layout 3</a></li>
                </ul>
            </div>
        </React.Fragment>
    )
}

export default SubMenuList