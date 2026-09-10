import { FormEvent, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardBody } from "react-bootstrap";
import { THEME_MODE } from "../../Common/layoutConfig";
import { changeThemeMode } from "../../toolkit/thunk";
import cloudsuiteLogo from '../../assets/images/cloudsuite.svg';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { firebaseAuthErrorMessage } from '../../lib/authErrorMessages';

const LoginV2 = () => {
    const dispatch = useDispatch<any>();
    const navigate = useNavigate();
    const themeMode = useSelector((state: any) => state.Theme.themeMode);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError('');
        setIsSubmitting(true);
        try {
            await signInWithEmailAndPassword(auth, String(form.get('email')), String(form.get('password')));
            navigate('/dashboard');
        } catch (caughtError) {
            setError(firebaseAuthErrorMessage(caughtError) ?? (caughtError instanceof Error ? caughtError.message : 'No pudimos iniciar sesión.'));
        } finally {
            setIsSubmitting(false);
        }
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
                    {error && <div className="alert alert-danger" role="alert">{error}</div>}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="form-label" htmlFor="email">Email</label>
                            <input type="email" className="form-control" id="email" name="email" placeholder="nombre@organizacion.com" required />
                        </div>
                        <div className="mb-4">
                            <label className="form-label" htmlFor="password">Contraseña</label>
                            <input type="password" className="form-control" id="password" name="password" placeholder="••••••••" required />
                        </div>
                        <div className="d-grid">
                            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Ingresando…' : 'Ingresar'}</button>
                        </div>
                    </form>
                    <p className="text-muted text-center mb-0 mt-4">¿Primera vez? <Link to="/register">Creá tu organización</Link></p>
                </CardBody>
            </Card>
        </div>
    );
}



export default LoginV2;
