import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch } from '../../../lib/api';
import { Toast } from '../../../components/Toast';
import HeroBanner from '../../../components/Shared/HeroBanner';
import KpiCard from '../../../components/Shared/KpiCard';
import Card from '../../../components/Shared/Card';
import EmptyState from '../../../components/Shared/EmptyState';
import SelectControl from '../../../components/Shared/SelectControl';

type Summary = { totalVoters:number; visitedCount:number; convertedYes:number; convertedNo:number; undecidedCount:number; conversionRate:number; coverageRate:number; teamStats:Array<{teamName:string;conversionsCount:number}>; topMilitants:Array<{uid:string;name:string;visitsCount:number;conversionsCount:number;conversionRate:number}> };
const empty: Summary = { totalVoters:0, visitedCount:0, convertedYes:0, convertedNo:0, undecidedCount:0, conversionRate:0, coverageRate:0, teamStats:[], topMilitants:[] };

export default function CampaignDashboard() {
  const { user, campaign, error } = useCampaign();
  const [summary, setSummary] = useState<Summary>(empty);
  const [timeline, setTimeline] = useState<{ daily:Array<{date:string; accumulated_yes:number}> }>({ daily:[] });
  const [notice, setNotice] = useState('');
  const [from, setFrom] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!user || !campaign) return;
    const base = `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/analytics`;
    const range = `?start=${from}&end=${to}`;
    void Promise.all([authenticatedFetch(user, base + '/summary' + range), authenticatedFetch(user, base + '/timeline' + range)])
      .then(([nextSummary, nextTimeline]) => { setSummary(nextSummary as Summary); setTimeline(nextTimeline as typeof timeline); })
      .catch((requestError: Error) => setNotice(requestError.message));
  }, [user, campaign, from, to]);

  const exportReport = () => {
    const rows = [['Métrica', 'Valor'], ['Total de electores', String(summary.totalVoters)], ['Conversiones SI', String(summary.convertedYes)], ['Conversiones NO', String(summary.convertedNo)], ['Indecisos', String(summary.undecidedCount)]];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.map((row) => row.join(';')).join('\n')]));
    link.download = 'reporte-cloudsuite.xls'; link.click(); URL.revokeObjectURL(link.href);
    setNotice('Reporte Excel descargado.');
  };

  const line = useMemo(() => ({ options: { chart: { toolbar: { show:false } }, xaxis: { categories: timeline.daily.map((day) => day.date.slice(5)) }, stroke: { curve:'smooth' as const, width:3 }, colors:['#2f6fe4'], grid:{ borderColor:'#eef2f8' }, dataLabels:{ enabled:false } }, series:[{ name:'Conversiones', data:timeline.daily.map((day) => day.accumulated_yes) }] }), [timeline]);
  const hasTimeline = timeline.daily.some((day) => day.accumulated_yes > 0);
  const hasConversionData = summary.convertedYes + summary.convertedNo + summary.undecidedCount > 0;
  const noPercent = summary.totalVoters ? Math.round((summary.convertedNo / summary.totalVoters) * 100) : 0;
  const undecidedPercent = summary.totalVoters ? Math.round((summary.undecidedCount / summary.totalVoters) * 100) : 0;
  const updatedAt = new Intl.DateTimeFormat('es-AR', { hour:'2-digit', minute:'2-digit' }).format(new Date());
  const distribution = [{ label:'SI', value:summary.convertedYes, percent:summary.totalVoters ? Math.round((summary.convertedYes / summary.totalVoters) * 100) : 0, color:'#22c55e' }, { label:'NO', value:summary.convertedNo, percent:noPercent, color:'#ef4444' }, { label:'Indeciso', value:summary.undecidedCount, percent:undecidedPercent, color:'#f59e0b' }];

  return <section className="cd-dashboard">
    <HeroBanner icon="bar-chart-2" title="Dashboard de campaña" subtitle="Indicadores actualizados cada cinco minutos." subtitleDetail="Visualizá el desempeño de tu campaña y tomá decisiones basadas en datos." tags={[{ icon:'clock', label:'Datos en tiempo real' }, { icon:'bars', label:`Última actualización: ${updatedAt}` }, { icon:'target', label:campaign ? 'Campaña activa' : 'Campaña' }]} extraFilters={<div className="cd-hero__filters"><label className="cd-hero__date">Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="cd-hero__date">Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>} ctaLabel="Exportar reporte" ctaIcon="download" onCtaClick={exportReport} />
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="cd-dashboard__kpis">
      <KpiCard icon="people" value={summary.totalVoters} label="Total de electores" caption={`${summary.coverageRate}% visitados`} progress={summary.coverageRate} linkText="Comienza a registrar visitas" />
      <KpiCard icon="check" iconColor="green" value={summary.convertedYes} label="Conversiones SI" caption={`${summary.conversionRate}% de conversión`} progress={summary.conversionRate} linkText="Suma más voluntades" />
      <KpiCard icon="help" iconColor="red" value={summary.convertedNo} label="Conversiones NO" caption="registradas" progress={noPercent} linkText="Conoce mejor a tu audiencia" />
      <KpiCard icon="help" iconColor="orange" value={summary.undecidedCount} label="Indecisos" caption="a re-visitar" progress={undecidedPercent} linkText="Oportunidades por trabajar" />
    </div>
    <div className="cd-dashboard__main">
      <Card icon="trend" title="Evolución de Conversiones" subtitle="Tendencia de conversiones en el período seleccionado." headerAction={<SelectControl label="Últimos 30 días" />}><div className={'cd-chart ' + (!hasTimeline ? 'cd-chart--empty' : '')}>{hasTimeline ? <Chart type="line" height={250} options={line.options} series={line.series} /> : <div className="cd-chart__empty"><EmptyState icon="bar-chart-2" title="Aún no hay datos de conversiones" description="Los gráficos se mostrarán cuando comiences a registrar visitas." /></div>}</div></Card>
      <Card icon="pie" title="Estado de Conversión" subtitle="Distribución de los electores según su estado."><div className="cd-donut"><div className="cd-donut__circle"><div><strong>{summary.totalVoters}</strong><span className="d-block">Total<br />electores</span></div></div><div className="cd-donut__legend">{distribution.map((item) => <div className="cd-donut__legend-row" key={item.label}><i style={{ background:item.color }} /><span>{item.label}</span><b>{item.value}</b><small>{item.percent}%</small></div>)}</div></div>{!hasConversionData && <div className="cd-donut__notice"><span>i</span><div><strong>Aún no hay datos para mostrar</strong><p>Comienza a registrar visitas para ver la distribución.</p></div></div>}</Card>
    </div>
    <div className="cd-dashboard__lower">
      <Card icon="people" title="Conversiones por Equipo" subtitle="Compara el desempeño de tus equipos de campaña.">{summary.teamStats.length ? <Chart type="bar" height={240} options={{ xaxis:{ categories:summary.teamStats.map((team) => team.teamName) }, colors:['#2f6fe4'], dataLabels:{ enabled:false }, grid:{ borderColor:'#eef2f8' } }} series={[{ name:'SI', data:summary.teamStats.map((team) => team.conversionsCount) }]} /> : <EmptyState icon="users" title="Aún no hay equipos registrados" description="Asigna miembros a equipos para ver sus conversiones." ctaLabel="Crear primer equipo" />}</Card>
      <Card icon="award" title="Top 10 militantes por visitas" subtitle="Conoce quiénes están impulsando la campaña." flushBody>{summary.topMilitants.length ? <table className="cd-dashboard__table"><thead><tr><th>MILITANTE</th><th>VISITAS</th><th>SI</th><th>TASA</th></tr></thead><tbody>{summary.topMilitants.map((militant) => <tr key={militant.uid}><td>{militant.name}</td><td>{militant.visitsCount}</td><td>{militant.conversionsCount}</td><td>{militant.conversionRate}%</td></tr>)}</tbody></table> : <EmptyState icon="award" title="Todavía no hay visitas registradas" description="Los militantes aparecerán aquí cuando comiences a registrar visitas." />}</Card>
    </div>
    {notice && <Toast message={notice} onClose={() => setNotice('')} />}
  </section>;
}
