import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { useAuth } from '../../../context/AuthContext';
import { useCampaign } from '../Organization/useCampaign';
import { useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';

const download = (name: string, type: string, value: string) => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([value], { type })); link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(link.href), 500); };
const csv = (rows: string[][]) => rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
const asPdf = (text: string) => { const escaped = text.replace(/[()\\]/g, '\\$&').replace(/[^\x20-\x7E\n]/g, ''); const lines = escaped.split(/\n+/).flatMap((line) => line.match(/.{1,82}/g) ?? ['']); const content = ['BT', '/F1 12 Tf', '50 790 Td', ...lines.flatMap((line, index) => [index ? '0 -18 Td' : '', `(${line}) Tj`].filter(Boolean)), 'ET'].join('\n'); const objects = ['1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj', '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj', '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj', '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj', `5 0 obj<</Length ${content.length}>>stream\n${content}\nendstream\nendobj`]; let output = '%PDF-1.4\n'; const offsets = [0]; for (const object of objects) { offsets.push(output.length); output += `${object}\n`; } const xref = output.length; return `${output}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`; };

export default function Reports() {
  const { user } = useAuth(); const { campaign } = useCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const finance = useAuthenticatedQuery<any>(user, base ? `${base}/finance-overview` : null, [base]);
  const contributors = useAuthenticatedQuery<any[]>(user, base ? `${base}/contributors` : null, [base]);
  const tasks = useAuthenticatedQuery<any[]>(user, base ? `${base}/tasks` : null, [base]);
  const areas = useAuthenticatedQuery<any[]>(user, base ? `${base}/areas` : null, [base]);
  const confirmed = (contributors.data ?? []).filter((contributor) => contributor.stage === 'confirmado').reduce((sum, contributor) => sum + Number(contributor.amount ?? 0), 0);
  const progress = useMemo(() => (areas.data ?? []).map((area) => { const inArea = (tasks.data ?? []).filter((task) => task.areaId === area.id); return { name: area.name, total: inArea.length, done: inArea.filter((task) => task.status === 'completada').length }; }), [areas.data, tasks.data]);
  const financialRows = [['Concepto', 'Monto'], ['Aportantes confirmados', String(confirmed)], ['Gasto total', String(finance.data?.spent ?? 0)], ['Techo legal', String(finance.data?.legalSpendingLimit ?? 0)], ['Disponible', String(finance.data?.remaining ?? 0)]];
  const financialText = financialRows.map((row) => row.join(': ')).join('\n');
  const chart = { series: [{ name: 'Completadas', data: progress.map((row) => row.done) }, { name: 'Pendientes', data: progress.map((row) => Math.max(0, row.total - row.done)) }], options: { chart: { type: 'bar' as const, stacked: true, toolbar: { show: false } }, xaxis: { categories: progress.map((row) => row.name) }, colors: ['#10B981', '#DCEBFF'], plotOptions: { bar: { borderRadius: 5 } }, legend: { position: 'top' as const }, dataLabels: { enabled: false } } };
  return <PageContainer><Stack gap="lg"><HeroBanner icon="bar-chart-2" title="Reportes SmartPlanner" subtitle="Finanzas, avance operativo y cronograma exportables." />
    <ContentPanel icon="trend" title="Reporte financiero" subtitle={`Confirmado $${confirmed.toLocaleString('es-AR')} · gasto $${Number(finance.data?.spent ?? 0).toLocaleString('es-AR')} · tope $${Number(finance.data?.legalSpendingLimit ?? 0).toLocaleString('es-AR')}`} headerAction={<Inline gap="sm"><button type="button" className="btn btn-outline-primary" onClick={() => download('smartplanner-finanzas.pdf', 'application/pdf', asPdf(`CloudSuite - Reporte financiero\n\n${financialText}`))}>PDF</button><button type="button" className="btn btn-primary" onClick={() => download('smartplanner-finanzas.xls', 'text/csv;charset=utf-8', csv(financialRows))}>Excel</button></Inline>}><strong>{finance.data?.exceeded ? 'El gasto supera el techo legal.' : 'El gasto permanece dentro del techo legal.'}</strong></ContentPanel>
    <ContentPanel icon="check" title="Avance del proyecto por área" subtitle="Tareas completadas frente al trabajo pendiente." headerAction={<button type="button" className="btn btn-primary" onClick={() => download('smartplanner-avance.xls', 'text/csv;charset=utf-8', csv([['Área', 'Completadas', 'Total'], ...progress.map((row) => [row.name, String(row.done), String(row.total)])]))}>Exportar Excel</button>}><Stack gap="sm">{progress.length ? <Chart type="bar" height={280} options={chart.options} series={chart.series} /> : <small className="text-muted">Todavía no hay áreas para medir.</small>}</Stack></ContentPanel>
    <ContentPanel icon="calendar" title="Gantt exportable" subtitle="Fechas, responsables y estado de cada tarea." headerAction={<Inline gap="sm"><button type="button" className="btn btn-outline-primary" onClick={() => download('smartplanner-gantt.pdf', 'application/pdf', asPdf(`CloudSuite - Gantt\n\n${(tasks.data ?? []).map((task) => `${task.title}: ${task.startDate || 'sin inicio'} a ${task.dueDate || 'sin vencimiento'} (${task.status})`).join('\n')}`))}>PDF</button><button type="button" className="btn btn-primary" onClick={() => download('smartplanner-gantt.xls', 'text/csv;charset=utf-8', csv([['Tarea', 'Inicio', 'Vence', 'Estado'], ...(tasks.data ?? []).map((task) => [task.title, task.startDate || '', task.dueDate || '', task.status])]))}>Excel</button></Inline>}><small>Incluye fechas de inicio, vencimiento y estado para continuar el trabajo fuera de CloudSuite.</small></ContentPanel>
  </Stack></PageContainer>;
}
