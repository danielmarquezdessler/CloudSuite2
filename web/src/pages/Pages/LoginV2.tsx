import { FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Card, CardBody } from "react-bootstrap";
import { THEME_MODE } from "../../Common/layoutConfig";
import { changeThemeMode } from "../../toolkit/thunk";
import cloudsuiteLogo from '../../assets/images/cloudsuite.svg';

const LoginV2 = () => {
    const dispatch = useDispatch<any>();
    const navigate = useNavigate();
    const themeMode = useSelector((state: any) => state.Theme.themeMode);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // TODO: auth Firebase (Brief 2)
        navigate('/dashboard');
    };

    return (
        <div className="cloudsuite-auth d-flex align-items-center justify-content-center p-4">
            <Card className="cloudsuite-auth__panel">
                <CardBody className="p-4 p-md-5">
                    <div className="d-flex justify-content-between align-items-start mb-4">
                        <div>
                            <div className="cloudsuite-logo-shell cloudsuite-logo-shell--login">
                                <img className="cloudsuite-logo" src={cloudsuiteLogo} alt="CloudSuite" />
                            </div>
                            <p className="text-muted mb-0 mt-2">Gestión inteligente de campañas</p>
                        </div>
                        <button
                            className="btn btn-outline-secondary btn-sm"
                            type="button"
                            aria-label="Cambiar entre modo claro y oscuro"
                            onClick={() => dispatch(changeThemeMode(themeMode === THEME_MODE.DARK ? THEME_MODE.LIGHT : THEME_MODE.DARK))}
                        >
                            <i className={themeMode === THEME_MODE.DARK ? 'ti ti-sun' : 'ti ti-moon'}></i>
                        </button>
                    </div>
                    <h1 className="h4 mb-2">Iniciá sesión</h1>
                    <p className="text-muted mb-4">Ingresá con tu cuenta de CloudSuite.</p>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="form-label" htmlFor="email">Email</label>
                            <input type="email" className="form-control" id="email" placeholder="nombre@organizacion.com" required />
                        </div>
                        <div className="mb-4">
                            <label className="form-label" htmlFor="password">Contraseña</label>
                            <input type="password" className="form-control" id="password" placeholder="••••••••" required />
                        </div>
                        <div className="d-grid">
                            <button type="submit" className="btn btn-primary">Ingresar</button>
                        </div>
                    </form>
                </CardBody>
            </Card>
        </div>
    );
}



export default LoginV2;
