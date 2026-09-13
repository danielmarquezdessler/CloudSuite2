import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import KpiCard from '../../../components/Shared/KpiCard';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';
import PrimaryButton from '../../../components/Shared/PrimaryButton';

type Suggestion = { zoneId: string; zoneName: string; total: number; visited: number; coverage: number; target: number; gap: number; suggestedTeamId: string | null; suggestedTeamName: string; assignedTeamId?: string | null };
type Member = { uid: string; smartPlannerRole?: string };
export default function CrewSuggestions() {
  const { user } = useAuth(); const { campaign } = useCampaign(); const { enabledAddons, role } = useActiveCampaign(); const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const query = useAuthenticatedQuery<Suggestion[]>(user, base ? `${base}/crew-suggestions` : null, [base]); const members = useAuthenticatedQuery<Member[]>(user, base ? `${base}/members` : null, [base]); const [notice, setNotice] = useState(''); const rows = query.data ?? []; const mine = (members.data ?? []).find((member) => member.uid === user?.uid); const canAssign = ['cliente', 'admin'].includes(role) || ['pm', 'contador'].includes(mine?.smartPlannerRole ?? 'miembro');
  const assign = async (item: Suggestion) => { if (!user || !base || !item.suggestedTeamId) return; const result = await authenticatedFetch<{ updatedVoters: number }>(user, `${base}/crew-suggestions/${item.zoneId}/assign`, { method: 'POST', body: JSON.stringify({ teamId: item.suggestedTeamId }) }); setNotice(`${item.zoneName}: ${result.updatedVoters} electores asignados a ${item.suggestedTeamName}.`); await query.reload(); };
  if (!enabledAddons.smartPlanner) return <PageContainer><ContentPanel icon="user" title="Sugerencias de Asignación"><EmptyState icon="award" title="Este addon no está habilitado" description="Solicitá la habilitación de SmartPlanner." /></ContentPanel></PageContainer>;
  return <PageContainer><Stack gap="lg"><HeroBanner icon="users" eyebrow="OPERACIÓN POR DATOS" title="Sugerencias de Asignación" subtitle="Priorizá las zonas con menor cobertura y reforzalas con la cuadrilla menos cargada." /><div className="cd-dashboard__kpis"><KpiCard icon="map" value={rows.length} label="Zonas priorizadas" /><KpiCard icon="trend" iconColor="orange" value={`${rows[0]?.coverage ?? 0}%`} label="Cobertura más baja" /><KpiCard icon="people" iconColor="purple" value={new Set(rows.map((row) => row.suggestedTeamId).filter(Boolean)).size} label="Equipos sugeridos" /></div><ContentPanel icon="users" title="Ranking de refuerzo" subtitle="La brecha compara cobertura real de los electores geolocalizados contra la meta de cada zona."><Stack gap="sm">{rows.map((item, index) => <article className="sp-project" key={item.zoneId}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>#{index + 1} · {item.zoneName}</strong><small>{item.visited} de {item.total} electores visitados · cobertura {item.coverage}% / meta {item.target}%</small><small>Refuerzo sugerido: <strong>{item.suggestedTeamName}</strong> · brecha {item.gap} puntos</small></Stack>{canAssign && item.suggestedTeamId && <PrimaryButton type="button" icon="people" onClick={() => void assign(item)}>Asignar</PrimaryButton>}</Inline></article>)}{!rows.length && <EmptyState icon="user" title="No hay zonas con electores geolocalizados" description="Creá zonas y ubicá electores para recibir sugerencias basadas en cobertura real." />}{notice && <div className="alert alert-success mb-0" role="status">{notice}</div>}</Stack></ContentPanel></Stack></PageContainer>;
}
