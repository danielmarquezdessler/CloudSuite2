import { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { useAuthenticatedQuery } from '../../../lib/api';
import { useCampaign } from '../Organization/useCampaign';
import HeroBanner from '../../../components/Shared/HeroBanner';
import KpiCard from '../../../components/Shared/KpiCard';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import PageContainer from '../../../components/Shared/PageContainer';
import SelectControl from '../../../components/Shared/SelectControl';

type Row = { uid:string; name:string; teamId:string|null; teamName:string; visits:number; yes:number; no:number; undecided:number; conversionRate:number; completedTasks:number };
type Team = { id:string; name:string };
type Sort = keyof Pick<Row, 'name'|'teamName'|'visits'|'yes'|'no'|'undecided'|'conversionRate'|'completedTasks'>;
const startDefault = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10); const today = new Date().toISOString().slice(0, 10);

export default function Productivity() {
  const { user, campaign } = useCampaign(); const [start, setStart] = useState(startDefault); const [end, setEnd] = useState(today); const [teamId, setTeamId] = useState('all'); const [sort, setSort] = useState<Sort>('visits'); const [asc, setAsc] = useState(false);
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}` : null;
  const query = base ? `${base}/execution/productivity?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${teamId !== 'all' ? `&teamId=${encodeURIComponent(teamId)}` : ''}` : null;
  const productivityQ = useAuthenticatedQuery<Row[]>(user, query, [query]); const teamsQ = useAuthenticatedQuery<Team[]>(user, base ? `${base}/teams` : null, [base]);
  const rows = productivityQ.data ?? []; const teams = teamsQ.data ?? [];
  const ordered = useMemo(() => [...rows].sort((a,b) => { const av = a[sort], bv = b[sort]; const compared = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv); return asc ? compared : -compared; }), [rows, sort, asc]);
  const top = ordered[0]; const averageVisits = rows.length ? (rows.reduce((total,row) => total + row.visits, 0) / rows.length).toFixed(1) : '0'; const averageRate = rows.length ? Math.round(rows.reduce((total,row) => total + row.conversionRate, 0) / rows.length) : 0;
  const sortBy = (key: Sort) => { if (sort === key) setAsc(!asc); else { setSort(key); setAsc(key === 'name' || key === 'teamName'); } };
  const head = (label:string, key:Sort) => <th role="button" tabIndex={0} onClick={() => sortBy(key)} onKeyDown={(event) => event.key === 'Enter' && sortBy(key)}>{label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}</th>;
  const chart = useMemo(() => ({ options:{ chart:{ toolbar:{show:false} }, xaxis:{ categories:ordered.map((row) => row.name) }, colors:['#0060f0'], dataLabels:{enabled:false}, grid:{borderColor:'#eef2f8'} }, series:[{name:'Visitas',data:ordered.map((row) => row.visits)}] }), [ordered]);
  return <PageContainer><HeroBanner icon="bars" title="Productividad del Equipo" subtitle="Medí el impacto del trabajo territorial con datos reales." tags={[{icon:'bars',label:'Rendimiento por militante'}]} extraFilters={<div className="cd-hero__filters"><label className="cd-hero__date">Desde<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="cd-hero__date">Hasta<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>} />
    <div className="cd-dashboard__kpis"><KpiCard icon="award" value={top?.name ?? '—'} label="Militante más activo" caption={top ? `${top.visits} visitas` : 'Sin actividad en el período'} /><KpiCard icon="bars" iconColor="purple" value={averageVisits} label="Promedio de visitas por persona" caption="En el rango seleccionado" /><KpiCard icon="target" iconColor="green" value={`${averageRate}%`} label="Tasa de conversión promedio" caption="SI sobre decisiones" /></div>
    <div className="cd-dashboard__main"><ContentPanel icon="bars" title="Visitas por militante" subtitle="Compará el ritmo de trabajo de cada integrante." headerAction={<SelectControl ariaLabel="Filtrar productividad por equipo" label={teamId === 'all' ? 'Todos los equipos' : teams.find((team) => team.id === teamId)?.name || 'Todos los equipos'} value={teamId} onChange={setTeamId} options={[{value:'all',label:'Todos los equipos'},...teams.map((team) => ({value:team.id,label:team.name}))]} />}>{productivityQ.loading ? <EmptyState icon="bars" title="Cargando productividad" description="Estamos calculando la actividad del equipo." /> : productivityQ.error ? <EmptyState icon="bars" title="No pudimos cargar la productividad" description={productivityQ.error.message} ctaLabel="Reintentar" onCtaClick={() => void productivityQ.reload()} /> : rows.length ? <Chart type="bar" height={280} options={chart.options} series={chart.series} /> : <EmptyState icon="users" title="No hay miembros en este filtro" description="Asigná personas a la campaña para ver su productividad." />}</ContentPanel>
      <ContentPanel icon="award" title="Lectura rápida" subtitle="Indicadores para orientar la coordinación.">{top ? <div className="p-3"><strong>{top.name}</strong><p className="mb-0 text-muted">Lidera el período con {top.visits} visitas y {top.completedTasks} tareas completadas.</p></div> : <EmptyState icon="award" title="Sin datos suficientes" description="Las visitas y tareas aparecerán aquí al comenzar la jornada." />}</ContentPanel></div>
    <ContentPanel icon="users" title="Ranking de productividad" subtitle="Ordená por cualquier columna para analizar el desempeño.">{productivityQ.loading ? <EmptyState icon="bars" title="Cargando ranking" description="Estamos preparando el detalle." /> : ordered.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr>{head('MILITANTE','name')}{head('EQUIPO','teamName')}{head('VISITAS','visits')}{head('SI','yes')}{head('NO','no')}{head('INDECISO','undecided')}{head('TASA','conversionRate')}{head('TAREAS COMPLETADAS','completedTasks')}</tr></thead><tbody>{ordered.map((row) => <tr key={row.uid}><td><strong>{row.name}</strong></td><td>{row.teamName}</td><td>{row.visits}</td><td>{row.yes}</td><td>{row.no}</td><td>{row.undecided}</td><td>{row.conversionRate}%</td><td>{row.completedTasks}</td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="Todavía no hay actividad" description="Cuando el equipo registre visitas y tareas se mostrará el ranking." />}</ContentPanel>
  </PageContainer>;
}
