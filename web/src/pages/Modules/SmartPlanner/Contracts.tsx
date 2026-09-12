import { FormEvent, useRef, useState } from 'react';
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

type Contract = { id: string; title: string; type?: string; relatedId?: string; content?: string; description?: string; amount: number; status: string; startDate: string; endDate: string; signatureUrl?: string };
const labels: Record<string, string> = { borrador: 'Borrador', enviado: 'Enviado', firmado: 'Firmado', rechazado: 'Rechazado', cancelado: 'Cancelado' };
const contractTypes: Record<string, string> = { proveedor: 'Proveedor', aportante: 'Aportante', personal: 'Personal' };
const blank = () => ({ title: '', type: 'proveedor', relatedId: '', content: '', amount: 0, status: 'borrador', startDate: '', endDate: '' });

export default function Contracts() {
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const { enabledAddons } = useActiveCampaign();
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/smartplanner/contracts` : null;
  const query = useAuthenticatedQuery<Contract[]>(user, base, [base]);
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState<Contract | null>(null);
  const [show, setShow] = useState(false);
  const [signing, setSigning] = useState<Contract | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const open = (item?: Contract) => {
    setEditing(item ?? null);
    setForm(item ? { title: item.title, type: item.type ?? 'proveedor', relatedId: item.relatedId ?? '', content: item.content ?? item.description ?? '', amount: item.amount, status: item.status, startDate: item.startDate, endDate: item.endDate } : blank());
    setShow(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !base) return;
    await authenticatedFetch(user, editing ? `${base}/${editing.id}` : base, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
    setShow(false);
    await query.reload();
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const target = event.currentTarget;
    const context = target.getContext('2d');
    if (!context) return;
    const box = target.getBoundingClientRect();
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#173b73';
    if (!drawing.current) { context.beginPath(); context.moveTo(event.clientX - box.left, event.clientY - box.top); drawing.current = true; } else { context.lineTo(event.clientX - box.left, event.clientY - box.top); context.stroke(); }
  };
  const sign = async () => {
    if (!user || !base || !signing || !canvas.current) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const data = new FormData();
    data.append('signature', blob, 'firma.png');
    await authenticatedFetch(user, `${base}/${signing.id}/sign`, { method: 'POST', body: data });
    setSigning(null);
    await query.reload();
  };
  if (!enabledAddons.smartPlanner) return <PageContainer><ContentPanel icon="doc" title="Contratos"><EmptyState icon="award" title="Este addon no está habilitado" description="Solicitá la habilitación de SmartPlanner." /></ContentPanel></PageContainer>;
  const contracts = query.data ?? [];
  return <PageContainer>
    <HeroBanner icon="doc" eyebrow="FINANZAS DE CAMPAÑA" title="Contratos y firma electrónica" subtitle="Formalizá acuerdos y conservá la firma digital en la campaña." ctaLabel="Nuevo contrato" onCtaClick={() => open()} />
    <ContentPanel icon="doc" title="Contratos" subtitle="Los contratos firmados incluyen su imagen de firma electrónica."><Stack gap="sm">
      {contracts.map((item) => <article className="sp-project" key={item.id}><Inline gap="sm" className="sp-project__row"><Stack gap="xs"><strong>{item.title}</strong><small>{contractTypes[item.type ?? 'proveedor']} · {labels[item.status]} · ${item.amount.toLocaleString('es-AR')}</small></Stack><Inline gap="xs"><button className="btn btn-sm btn-outline-primary" onClick={() => open(item)}>Editar</button>{item.status !== 'firmado' && <button className="btn btn-sm btn-primary" onClick={() => setSigning(item)}>Firmar</button>}</Inline></Inline></article>)}
      {!contracts.length && <EmptyState icon="doc" title="No hay contratos" description="Creá un contrato para iniciar el circuito de firma." />}
    </Stack></ContentPanel>
    <Modal show={show} onHide={() => setShow(false)}><form onSubmit={save}><Modal.Header closeButton><Modal.Title>{editing ? 'Editar contrato' : 'Nuevo contrato'}</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><input aria-label="Título de contrato" className="form-control" placeholder="Título" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /><SelectControl label="Tipo" ariaLabel="Tipo de contrato" value={form.type} onChange={(type) => setForm({ ...form, type })} options={Object.entries(contractTypes).map(([value, label]) => ({ value, label }))} /><input aria-label="Referencia relacionada" className="form-control" placeholder="ID relacionado (opcional)" value={form.relatedId} onChange={(event) => setForm({ ...form, relatedId: event.target.value })} /><textarea aria-label="Contenido de contrato" className="form-control" placeholder="Contenido del contrato" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /><input aria-label="Monto de contrato" type="number" min="0" className="form-control" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /><SelectControl label="Estado" ariaLabel="Estado de contrato" value={form.status} onChange={(status) => setForm({ ...form, status })} options={Object.entries(labels).map(([value, label]) => ({ value, label }))} /></Stack></Modal.Body><Modal.Footer><PrimaryButton type="submit" icon="check">Guardar contrato</PrimaryButton></Modal.Footer></form></Modal>
    <Modal show={Boolean(signing)} onHide={() => setSigning(null)}><Modal.Header closeButton><Modal.Title>Firma electrónica</Modal.Title></Modal.Header><Modal.Body><Stack gap="sm"><p>Firmá dentro del recuadro para confirmar “{signing?.title}”.</p><canvas ref={canvas} width="480" height="180" className="sp-signature-pad" onPointerDown={point} onPointerMove={point} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} /></Stack></Modal.Body><Modal.Footer><button className="btn btn-outline-secondary" onClick={() => canvas.current?.getContext('2d')?.clearRect(0, 0, 480, 180)}>Limpiar</button><PrimaryButton type="button" icon="check" onClick={() => void sign()}>Confirmar firma</PrimaryButton></Modal.Footer></Modal>
  </PageContainer>;
}
