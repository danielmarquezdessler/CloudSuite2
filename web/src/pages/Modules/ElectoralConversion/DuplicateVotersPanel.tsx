import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { User } from 'firebase/auth';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import Inline from '../../../components/Shared/Inline';
import Stack from '../../../components/Shared/Stack';

type Voter = { id: string; name: string; address?: string; phone?: string; email?: string; tags?: string[]; visitCount?: number };
type Group = { key: string; voters: Voter[] };
type Props = { user: User | null; campaign: { orgId: string; campId: string } | null; onMerged: () => Promise<void> };

export default function DuplicateVotersPanel({ user, campaign, onMerged }: Props) {
  const path = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters/duplicates` : null;
  const { data, loading, error, reload } = useAuthenticatedQuery<Group[]>(user, path, [path]);
  const [target, setTarget] = useState<Group | null>(null); const [keepId, setKeepId] = useState(''); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const merge = async () => {
    if (!target || !user || !campaign) return; setSaving(true); setMessage('');
    try { await authenticatedFetch(user, `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters/merge`, { method: 'POST', body: JSON.stringify({ keepId, mergeIds: target.voters.filter((voter) => voter.id !== keepId).map((voter) => voter.id) }) }); await Promise.all([reload(), onMerged()]); setTarget(null); setKeepId(''); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'No pudimos fusionar los electores.'); } finally { setSaving(false); }
  };
  const review = (group: Group) => { setTarget(group); setKeepId([...group.voters].sort((left, right) => (right.visitCount ?? 0) - (left.visitCount ?? 0))[0]?.id ?? ''); setMessage(''); };
  return <ContentPanel icon="users" title="Posibles duplicados" subtitle="Compará registros similares antes de fusionarlos.">
    {loading ? <EmptyState icon="users" title="Buscando duplicados" description="Estamos comparando nombre, dirección similar y teléfono." /> : error ? <EmptyState icon="users" title="No pudimos buscar duplicados" description={error.message} ctaLabel="Reintentar" onCtaClick={() => void reload()} /> : data?.length ? <Stack gap="sm">{data.map((group) => <div className="cs-duplicate-group" key={group.key}><Stack gap="sm"><div><strong>{group.voters.length} registros similares</strong><span className="text-muted small d-block">Elegí qué ficha conservar: las visitas de las demás se reasignarán.</span></div><div className="cs-duplicate-grid">{group.voters.map((voter) => <div className="cs-duplicate-voter" key={voter.id}><strong>{voter.name}</strong><span>{voter.address || 'Sin dirección'}</span><span>{voter.phone || 'Sin teléfono'} · {voter.email || 'Sin email'}</span><span>{voter.visitCount ?? 0} {(voter.visitCount ?? 0) === 1 ? 'visita' : 'visitas'}</span></div>)}</div><Inline gap="sm"><Button size="sm" variant="outline-primary" onClick={() => review(group)}>Revisar y fusionar</Button></Inline></Stack></div>)}</Stack> : <EmptyState icon="users" title="No hay duplicados detectados" description="No encontramos coincidencias de nombre y dirección similar ni teléfonos repetidos." />}
    <Modal show={Boolean(target)} onHide={() => !saving && setTarget(null)} centered><Modal.Header closeButton><Modal.Title>Fusionar electores duplicados</Modal.Title></Modal.Header><Modal.Body><Stack gap="md"><p className="mb-0">Elegí explícitamente la ficha que se conservará. Sus datos incompletos se completarán con los demás registros y todas las visitas se reasignarán.</p>{message && <div className="alert alert-danger mb-0" role="alert">{message}</div>}<Stack gap="sm">{target?.voters.map((voter) => <label className="cs-duplicate-choice" key={voter.id}><input type="radio" name="duplicate-keep" checked={keepId === voter.id} onChange={() => setKeepId(voter.id)} disabled={saving} /><Stack gap="xs"><strong>{voter.name}</strong><span>{voter.address || 'Sin dirección'} · {voter.phone || 'Sin teléfono'}</span><span>{voter.visitCount ?? 0} {(voter.visitCount ?? 0) === 1 ? 'visita registrada' : 'visitas registradas'}</span></Stack></label>)}</Stack></Stack></Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>Cancelar</Button><Button variant="primary" onClick={() => void merge()} disabled={saving || !keepId}>{saving ? 'Fusionando…' : 'Fusionar registros'}</Button></Modal.Footer></Modal>
  </ContentPanel>;
}
