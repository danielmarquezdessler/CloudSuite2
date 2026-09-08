import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch } from '../lib/api';

interface Campaign {
  id: string;
  nombre: string;
}

interface MeResponse {
  hasOrg: boolean;
  profile?: { email: string; displayName: string | null };
  organization?: { id: string; nombre: string };
  campaigns?: Campaign[];
  role?: string;
}

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [error, setError] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);

  const loadProfile = async (forceTokenRefresh = false) => {
    if (!user) return;
    try {
      if (forceTokenRefresh) {
        await user.getIdToken(true);
      }
      const data = await authenticatedFetch(user, '/api/me') as MeResponse;
      setMe(data);
      setSelectedCampaignId(data.campaigns?.[0]?.id ?? '');
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No pudimos cargar tu organización.');
    }
  };

  useEffect(() => { void loadProfile(true); }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleBootstrapRetry = async () => {
    if (!user) return;
    setError('');
    setIsRecovering(true);
    try {
      await authenticatedFetch(user, '/api/organizations/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ organizationName, campaignName })
      });
      await user.getIdToken(true);
      await loadProfile();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No pudimos completar la organización.');
    } finally {
      setIsRecovering(false);
    }
  };

  const selectedCampaign = me?.campaigns?.find((campaign) => campaign.id === selectedCampaignId);

  return (
    <section className="card">
      <div className="card-body p-4">
        <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <h1 className="h4 mb-2">{me?.organization?.nombre ?? 'Dashboard'}</h1>
            <p className="text-muted mb-0">{me?.hasOrg ? `Rol: ${me.role}` : 'Cargando organización…'}</p>
          </div>
          <button className="btn btn-outline-secondary btn-sm" type="button" onClick={handleLogout}>Cerrar sesión</button>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {me?.hasOrg && (
          <div className="row align-items-end g-3">
            <div className="col-md-6">
              <label className="form-label" htmlFor="campaign">Campaña actual</label>
              <select className="form-select" id="campaign" value={selectedCampaignId} onChange={(event) => setSelectedCampaignId(event.target.value)}>
                {me.campaigns?.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.nombre}</option>)}
              </select>
            </div>
            <div className="col-md-6"><p className="mb-2 text-muted">{selectedCampaign ? `Trabajando en: ${selectedCampaign.nombre}` : 'Sin campañas disponibles.'}</p></div>
          </div>
        )}
        {me && !me.hasOrg && (
          <div className="border rounded-3 p-4 bg-light">
            <h2 className="h5">Terminemos de crear tu organización</h2>
            <p className="text-muted">Parece que la configuración inicial no terminó. Completala para acceder a tus campañas.</p>
            <div className="row g-3">
              <div className="col-md-5"><label className="form-label" htmlFor="recoveryOrganization">Organización</label><input className="form-control" id="recoveryOrganization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required /></div>
              <div className="col-md-5"><label className="form-label" htmlFor="recoveryCampaign">Primera campaña</label><input className="form-control" id="recoveryCampaign" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required /></div>
              <div className="col-md-2 d-flex align-items-end"><button className="btn btn-primary w-100" type="button" disabled={!organizationName || !campaignName || isRecovering} onClick={handleBootstrapRetry}>{isRecovering ? 'Creando…' : 'Reintentar'}</button></div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}


export default Dashboard;
