import { FormEvent, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useAuth } from '../../../context/AuthContext';
import { useActiveCampaign } from '../../../context/CampaignContext';
import { useCampaign } from '../Organization/useCampaign';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import PageContainer from '../../../components/Shared/PageContainer';
import HeroBanner from '../../../components/Shared/HeroBanner';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import Stack from '../../../components/Shared/Stack';
import Inline from '../../../components/Shared/Inline';
import SelectControl from '../../../components/Shared/SelectControl';
import PrimaryButton from '../../../components/Shared/PrimaryButton';

type Material = { id: string; name: string; category: string; stock: number; minimumStock: number; unitCost: number; providerId: string };
type Provider = { id: string; name: string };
const labels: Record<string, string> = { remeras: 'Remeras', folletos: 'Folletos', carteles: 'Carteles', merchandising: 'Merchandising', otro: 'Otro' };
const blank = () => ({ name: '', category: 'folletos', stock: 0, minimumStock: 10, unitCost: 0, providerId: '' });

export default function Materials() {
  const { user } = useAuth(); const { campaign } = useCampaign(); const { enabledAddons } = useActiveCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner` : null;
  const materialsQuery = useAuthenticatedQuery<Material[]>(user, base ? `${base}/materials` : null, [base]);
  const providersQuery = useAuthenticatedQuery<Provider[]>(user, base ? `${base}/providers` : null, [base]);
  const [form, setForm] = useState(blank()); const [editing, setEditing] = useState<Material | null>(null); const [show, setShow] = useState(false);
  const materials = materialsQuery.data ?? []; const providers = providersQuery.data ?? [];
  const providerName = (id: string) => providers.find((provider) => provider.id === id)?.name ?? 'Sin proveedor';
  const open = (material?: Material) => { setEditing(material ?? null); setForm(material ? { ...material } : blank()); setShow(true); };
  const save = async (event: FormEvent) => { event.preventDefault(); if (!user || !base) return; await authenticatedFetch(user, editing ? `${base}/materials/${editing.id}` : `${base}/materials`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) }); setShow(false); await materialsQuery.reload(); };
  const remove = async (material: Material) => { if (!user || !base || !window.confirm(`¿Eliminar ${material.name}?`)) return; await authenticatedFetch(user, `${base}/materials/${material.id}`, { method: 'DELETE' }); await materialsQuery.reload(); };
  if (!enabledAddons.smartPlanner) return <PageContainer><ContentPanel icon="list" title="Materiales"><EmptyState icon="award" title="Este addon no está habilitado" description="Solicitá la habilitación de SmartPlanner." /></ContentPanel></PageContainer>;
  return <PageContainer data-smartplanner="workspace"><HeroBanner icon="list" eyebrow="FINANZAS DE CAMPAÑA" title="Materiales e inventario" subtitle="Controlá stock, costo y alertas de reposición." ctaLabel="Nuevo material" onCtaClick={() => open()} /><ContentPanel icon="list" title="Inventario de campaña" subtitle="Los ítems con bajo stock necesitan reposición."><Stack gap="sm">{materials.map((material) => <article className={`sp-project ${material.stock <= material.minimumStock ? 'border-danger' : ''}`} key={material.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{material.name}{material.stock <= material.minimumStock && <span className="text-danger"> · Stock bajo</span>}</strong><small>{labels[material.category]} · {material.stock} unidades · mínimo {material.minimumStock} · {providerName(material.providerId)}</small></Stack><Stack gap="xs"><strong>${material.unitCost.toLocaleString('es-AR')}</strong><small>costo unitario</small></Stack><Inline gap="xs"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => open(material)}>Editar</button><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void remove(material)}>Borrar</button></Inline></Inline></article>)}{!materials.length && <EmptyState icon="list" title="Sin materiales" description="Cargá el primer insumo de campaña." />}</Stack></ContentPanel><Modal show={show} onHide={() => setShow(false)}><form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editing ? 'Editar material' : 'Nuevo material'}</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><input aria-label="Nombre de material" className="form-control" placeholder="Material" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /><SelectControl label="Categoría" ariaLabel="Categoría de material" value={form.category} onChange={(category) => setForm({ ...form, category })} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} /><SelectControl label="Proveedor" ariaLabel="Proveedor del material" value={form.providerId} onChange={(providerId) => setForm({ ...form, providerId })} options={[{ value: '', label: 'Sin proveedor' }, ...providers.map((provider) => ({ value: provider.id, label: provider.name }))]} /><Inline gap="sm"><input aria-label="Stock" type="number" min="0" className="form-control" value={form.stock} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} /><input aria-label="Stock mínimo" type="number" min="0" className="form-control" value={form.minimumStock} onChange={(event) => setForm({ ...form, minimumStock: Number(event.target.value) })} /><input aria-label="Costo unitario" type="number" min="0" className="form-control" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: Number(event.target.value) })} /></Inline></Stack></Modal.Body><Modal.Footer><PrimaryButton type="submit" icon="check">Guardar material</PrimaryButton></Modal.Footer></form></Modal></PageContainer>;
}
