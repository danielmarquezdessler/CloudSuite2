import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '../../../lib/api';
import { useCampaign } from '../Organization/useCampaign';
import ImportVoters from '../Organization/Voters/ImportVoters';

type Voter = { id: string; name: string; address: string; phone?: string; state: string; lat?: number | null; lng?: number | null };
const states: Record<string, { badge: string; label: string }> = { unvisited: { badge: 'bg-neutral', label: 'Sin visitar' }, visited: { badge: 'bg-primary', label: 'Visitado' }, converted_yes: { badge: 'bg-success', label: 'SI' }, converted_no: { badge: 'bg-danger', label: 'NO' }, undecided: { badge: 'bg-warning text-dark', label: 'Indeciso' } };
export default function VotersList() {
  const { user, campaign, error: campaignError } = useCampaign(); const [list, setList] = useState<Voter[]>([]); const [search, setSearch] = useState(''); const [state, setState] = useState(''); const navigate = useNavigate();
  const load = async () => { if (!user || !campaign) return; setList(await authenticatedFetch(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters`) as Voter[]); };
  useEffect(() => { void load(); }, [user, campaign]);
  const shown = list.filter(voter => `${voter.name} ${voter.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (!state || voter.state === state));
  return <section className="card"><div className="card-body p-4"><div className="d-flex flex-wrap justify-content-between gap-3 mb-3"><div><h1 className="h4">Electores</h1><p className="text-muted mb-0">Importá y prepará las visitas de campaña.</p></div><ImportVoters onImported={() => void load()} /></div>{campaignError && <div className="alert alert-danger">{campaignError}</div>}<div className="row g-2 mb-3"><div className="col-md-7"><input className="form-control" placeholder="Buscar por nombre o teléfono" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="col-md-5"><select className="form-select" aria-label="Filtrar por estado" value={state} onChange={event => setState(event.target.value)}><option value="">Todos los estados</option>{Object.entries(states).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></div></div><div className="table-responsive"><table className="table table-striped table-hover align-middle"><thead><tr><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th>Estado</th><th /></tr></thead><tbody>{shown.map(voter => { const config = states[voter.state] ?? states.unvisited; return <tr key={voter.id}><td>{voter.name}</td><td>{voter.address}</td><td>{voter.phone ?? '—'}</td><td><span className={`badge ${config.badge}`}>{config.label}</span></td><td><Button size="sm" onClick={() => navigate(`/visit/${voter.id}`)}>Visitar</Button></td></tr>; })}{!shown.length && <tr><td colSpan={5} className="text-center text-muted">No hay electores para mostrar.</td></tr>}</tbody></table></div></div></section>;
}
