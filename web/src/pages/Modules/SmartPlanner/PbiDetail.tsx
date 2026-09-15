import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import Inline from '../../../components/Shared/Inline';
import Stack from '../../../components/Shared/Stack';
import SelectControl from '../../../components/Shared/SelectControl';
import PrimaryButton from '../../../components/Shared/PrimaryButton';
import { Toast } from '../../../components/Toast';
import PbiCategoryField, { PbiCategory } from './PbiCategoryField';
import type { Pbi } from './Backlog';

type Area = { id: string; name: string }; type Member = { uid: string; displayName?: string; email: string }; type Status = Pbi['status'];
const statuses: { value: Status; label: string }[] = [{ value: 'por_hacer', label: 'Por hacer' }, { value: 'en_progreso', label: 'En progreso' }, { value: 'en_revision', label: 'En revisión' }, { value: 'completada', label: 'Completada' }];
const priorities = [{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }];
const date = (value?: string) => value ? new Date(value).toLocaleString('es-AR') : '—';

export default function PbiDetail() {
  const { pbiId = '' } = useParams(); const navigate = useNavigate(); const { user } = useAuth(); const { campaign } = useCampaign(); const { enabledAddons } = useActiveCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const pbisQ = useAuthenticatedQuery<Pbi[]>(user, base ? `${base}/tasks` : null, [base]); const areasQ = useAuthenticatedQuery<Area[]>(user, base ? `${base}/areas` : null, [base]); const membersQ = useAuthenticatedQuery<Member[]>(user, base ? `${base}/members` : null, [base]); const categoriesQ = useAuthenticatedQuery<PbiCategory[]>(user, base ? `${base}/categories` : null, [base]);
  const pbi = (pbisQ.data ?? []).find((item) => item.id === pbiId); const [form, setForm] = useState<Pbi | null>(null); const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'danger' } | null>(null);
  useEffect(() => { if (pbi) setForm(pbi); }, [pbi]);
  const members = membersQ.data ?? []; const memberName = (uid?: string) => members.find((member) => member.uid === uid)?.displayName || members.find((member) => member.uid === uid)?.email || 'Sin asignar';
  async function createCategory(name: string) { if (!user || !base) throw new Error('No se pudo crear la categoría.'); const category = await authenticatedFetch<PbiCategory>(user, `${base}/categories`, { method: 'POST', body: JSON.stringify({ name }) }); await categoriesQ.reload(); return category; }
  async function save() { if (!user || !base || !form?.title.trim()) return; try { await authenticatedFetch(user, `${base}/tasks/${pbiId}`, { method: 'PUT', body: JSON.stringify(form) }); await pbisQ.reload(); setNotice({ message: 'Cambios del PBI guardados.', variant: 'success' }); } catch (error) { setNotice({ message: error instanceof Error ? error.message : 'No pudimos guardar el PBI.', variant: 'danger' }); } }
  async function remove() { if (!user || !base || !form || !window.confirm(`¿Eliminar el PBI “${form.title}”?`)) return; await authenticatedFetch(user, `${base}/tasks/${pbiId}`, { method: 'DELETE' }); navigate('/smartplanner/backlog'); }
  if (!enabledAddons.smartPlanner) return null;
  if (!pbi || !form) return <PageContainer backTo="/smartplanner/backlog"><EmptyState icon="list" title="PBI no encontrado" description="Puede haber sido eliminado o no pertenecer a la campaña activa." ctaLabel="Volver al Backlog" onCtaClick={() => navigate('/smartplanner/backlog')} /></PageContainer>;
  return <PageContainer backTo="/smartplanner/backlog"><Stack gap="lg"><HeroBanner icon="doc" eyebrow="PBI DE CAMPAÑA" title={form.displayId ?? 'PBI'} subtitle="Actualizá el alcance, responsables y progreso." backTo="/smartplanner/backlog" /><ContentPanel icon="doc" title="Detalle del PBI" subtitle="Los cambios se guardan de forma explícita."><Stack gap="md"><div className="sp-pbi-detail__heading"><label htmlFor="pbi-title">Título</label><input id="pbi-title" aria-label="Título del PBI" className="form-control" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div><Inline gap="sm" wrap className="sp-pbi-detail__badges"><span>{statuses.find((item) => item.value === form.status)?.label}</span><span>{priorities.find((item) => item.value === form.priority)?.label}</span><span>{memberName(form.assignedTo)}</span><span>{categoriesQ.data?.find((category) => category.id === form.categoryId)?.name || 'Sin categoría'}</span></Inline><label className="form-label" htmlFor="pbi-description">Descripción</label><textarea id="pbi-description" aria-label="Descripción del PBI" className="form-control" rows={5} value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /><div className="sp-pbi-detail__fields"><SelectControl ariaLabel="Estado del PBI" label="Estado" value={form.status} onChange={(status) => setForm({ ...form, status: status as Status })} options={statuses} /><SelectControl ariaLabel="Prioridad del PBI" label="Prioridad" value={form.priority} onChange={(priority) => setForm({ ...form, priority: priority as Pbi['priority'] })} options={priorities} /><SelectControl ariaLabel="Responsable del PBI" label="Responsable" value={form.assignedTo} onChange={(assignedTo) => setForm({ ...form, assignedTo })} options={members.map((member) => ({ value: member.uid, label: memberName(member.uid) }))} /><SelectControl ariaLabel="Área del PBI" label="Área" value={form.areaId} onChange={(areaId) => setForm({ ...form, areaId })} options={(areasQ.data ?? []).map((area) => ({ value: area.id, label: area.name }))} /><PbiCategoryField value={form.categoryId ?? ''} categories={categoriesQ.data ?? []} onChange={(categoryId) => setForm({ ...form, categoryId })} onCreate={createCategory} /></div><Inline gap="md" wrap className="sp-pbi-detail__metadata"><span>Creado: {date(form.createdAt)}</span><span>Creado por: {memberName(form.createdBy)}</span></Inline><Inline gap="sm" wrap><PrimaryButton icon="check" onClick={() => void save()}>Guardar cambios</PrimaryButton><button type="button" className="btn btn-outline-danger" onClick={() => void remove()}>Eliminar</button></Inline></Stack></ContentPanel>{notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}</Stack></PageContainer>;
}
