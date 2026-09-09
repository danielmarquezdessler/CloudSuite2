import { FormEvent, useState } from 'react';
import { Card, CardBody } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import cloudsuiteLogo from '../../assets/images/cloudsuite.svg';
import { authenticatedFetch } from '../../lib/api';
import { auth } from '../../lib/firebase';

const Register = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    const organizationName = String(form.get('organizationName'));

    setError('');
    setIsSubmitting(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: email.split('@')[0] });
      await authenticatedFetch(credential.user, '/api/organizations/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ organizationName })
      });
      await credential.user.getIdToken(true);
      navigate('/dashboard');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No pudimos crear la cuenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="cloudsuite-auth d-flex align-items-center justify-content-center p-4">
      <Card className="cloudsuite-auth__panel">
        <CardBody className="p-4 p-md-5">
          <div className="cloudsuite-logo-shell cloudsuite-logo-shell--login mb-4">
            <img className="cloudsuite-logo" src={cloudsuiteLogo} alt="CloudSuite" />
          </div>
          <h1 className="h4 mb-2">Creá tu organización</h1>
          <p className="text-muted mb-4">Configurá tu espacio de trabajo. Crearemos una campaña electoral inicial para vos.</p>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3"><label className="form-label" htmlFor="organizationName">Nombre de la organización</label><input className="form-control" id="organizationName" name="organizationName" required /></div>
            <div className="mb-3"><label className="form-label" htmlFor="email">Email</label><input className="form-control" id="email" name="email" type="email" required /></div>
            <div className="mb-4"><label className="form-label" htmlFor="password">Contraseña</label><input className="form-control" id="password" name="password" type="password" minLength={6} required /></div>
            <div className="d-grid"><button className="btn btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando…' : 'Crear cuenta'}</button></div>
          </form>
          <p className="text-muted text-center mb-0 mt-4">¿Ya tenés cuenta? <Link to="/">Iniciá sesión</Link></p>
        </CardBody>
      </Card>
    </div>
  );
};

export default Register;
