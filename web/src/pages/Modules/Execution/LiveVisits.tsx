import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { useCampaign } from '../Organization/useCampaign';
import { firestore } from '../../../lib/firebase';
import { useAuthenticatedQuery } from '../../../lib/api';
import HeroBanner from '../../../components/Shared/HeroBanner';
import KpiCard from '../../../components/Shared/KpiCard';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import PageContainer from '../../../components/Shared/PageContainer';
import Stack from '../../../components/Shared/Stack';

type Visit = { id: string; voterId: string; visitUid: string; startedAt?: Timestamp; state?: string; conversion?: { decision?: string } };
type Voter = { id: string; name: string };
type Member = { uid: string; displayName?: string; email?: string };
const formatTime = (value?: Timestamp) => value ? value.toDate().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Recién iniciada';
const status = (visit: Visit) => visit.conversion?.decision === 'yes' ? ['SI', 'success'] : visit.conversion?.decision === 'no' ? ['NO', 'danger'] : visit.conversion?.decision === 'undecided' ? ['Indeciso', 'warning'] : ['En progreso', 'primary'];

export default function LiveVisits() {
  const { user, campaign, error: campaignError } = useCampaign();
  const [visits, setVisits] = useState<Visit[]>([]); const [streamError, setStreamError] = useState('');
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}` : null;
  const voters = useAuthenticatedQuery<Voter[]>(user, base ? `${base}/voters` : null, [base]).data ?? [];
  const members = useAuthenticatedQuery<Member[]>(user, campaign ? `/api/organizations/${campaign.orgId}/users` : null, [campaign?.orgId]).data ?? [];
  useEffect(() => {
    if (!campaign) { setVisits([]); return; }
    const ref = collection(firestore, 'organizations', campaign.orgId, 'campaigns', campaign.campId, 'visits');
    return onSnapshot(query(ref, orderBy('startedAt', 'desc'), limit(50)), (snapshot) => { setVisits(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Visit))); setStreamError(''); }, () => setStreamError('No pudimos conectar el feed de visitas en vivo.'));
  }, [campaign?.campId, campaign?.orgId]);
  const metrics = useMemo(() => { const now = Date.now(), today = new Date().setHours(0, 0, 0, 0); const todayVisits = visits.filter(v => (v.startedAt?.toMillis() ?? 0) >= today); const hourVisits = visits.filter(v => now - (v.startedAt?.toMillis() ?? 0) <= 3600000); const active = new Set(visits.filter(v => now - (v.startedAt?.toMillis() ?? 0) <= 1800000).map(v => v.visitUid)); const decided = todayVisits.filter(v => v.conversion?.decision === 'yes' || v.conversion?.decision === 'no'); const yes = decided.filter(v => v.conversion?.decision === 'yes').length; return { today: todayVisits.length, hour: hourVisits.length, active: active.size, conversion: decided.length ? Math.round(yes / decided.length * 100) : 0 }; }, [visits]);
  const voterNames = new Map(voters.map(v => [v.id, v.name])); const memberNames = new Map(members.map(m => [m.uid, m.displayName || m.email || 'Militante']));
  return <PageContainer><HeroBanner icon="activity" title="Panel de Visitas en Vivo" subtitle="Seguimiento instantáneo del trabajo territorial de tu campaña." tags={[{ icon: 'clock', label: 'Actualización en tiempo real' }, { icon: 'users', label: 'Últimas 50 visitas' }]} />
    <div className="cd-dashboard__kpis"><KpiCard icon="bars" value={metrics.today} label="Visitas hoy" caption="Registradas hoy" /><KpiCard icon="clock" iconColor="purple" value={metrics.hour} label="Visitas última hora" caption="Actividad reciente" /><KpiCard icon="people" iconColor="green" value={metrics.active} label="Militantes activos ahora" caption="Últimos 30 minutos" /><KpiCard icon="target" iconColor="orange" value={`${metrics.conversion}%`} label="Tasa de conversión hoy" caption="SI sobre decididas" progress={metrics.conversion} /></div>
    <ContentPanel icon="activity" title="Actividad reciente" subtitle="El feed se actualiza automáticamente con cada visita.">{campaignError || streamError ? <EmptyState icon="bar-chart-2" title="No pudimos mostrar la actividad" description={campaignError || streamError} /> : visits.length ? <Stack gap="sm" className="execution-live-list">{visits.map(visit => { const [label, tone] = status(visit); return <div className="execution-live-item" key={visit.id}><div><strong>{memberNames.get(visit.visitUid) ?? 'Militante'}</strong><small>{voterNames.get(visit.voterId) ?? 'Elector'} · {formatTime(visit.startedAt)}</small></div><span className={`badge text-bg-${tone}`}>{label}</span></div>; })}</Stack> : <EmptyState icon="users" title="Todavía no hay visitas" description="Las visitas iniciadas por tu equipo aparecerán aquí en tiempo real." />}</ContentPanel>
  </PageContainer>;
}
