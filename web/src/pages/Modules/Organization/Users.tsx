import { useEffect, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import PageContainer from '../../../components/Shared/PageContainer';
import SelectControl from '../../../components/Shared/SelectControl';
import { Toast } from '../../../components/Toast';
import CreateUserModal from '../../../components/Organization/CreateUserModal';
import { useCampaign } from './useCampaign';

type Member = { uid: string; displayName?: string; email: string; role: string; functionId?: string; teamId?: string };
type Item = { id: string; name: string };
type OrgUser = { uid: string; firstName?: string; lastName?: string; displayName?: string; email: string; phone?: string; photoURL?: string; role: string };

function MemberAssignmentModal({ member, functions, teams, onHide, onSave }: { member: Member | null; functions: Item[]; teams: Item[]; onHide: () => void; onSave: (values: { functionId: string; teamId: string }) => Promise<void> }) {
  const [functionId, setFunctionId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setFunctionId(member?.functionId ?? ''); setTeamId(member?.teamId ?? ''); setError(''); }, [member]);
  const save = async () => {
    setSaving(true); setError('');
    try { await onSave({ functionId, teamId }); onHide(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos actualizar la asignación.'); }
    finally { setSaving(false); }
  };
  return <Modal show={Boolean(member)} onHide={() => !saving && onHide()}>
    <Modal.Header closeButton><Modal.Title>Editar asignación en campaña</Modal.Title></Modal.Header>
    <Modal.Body><p className="text-muted small">Actualizá la función o el equipo de {member?.displayName ?? member?.email} en esta campaña.</p>
      <div className="mb-3"><label className="form-label" htmlFor="member-function">Función</label><SelectControl id="member-function" ariaLabel="Función del miembro" label={functions.find(item => item.id === functionId)?.name ?? 'Sin función'} options={[{ value: '', label: 'Sin función' }, ...functions.map(item => ({ value: item.id, label: item.name }))]} value={functionId} onChange={setFunctionId} /></div>
      <div><label className="form-label" htmlFor="member-team">Equipo</label><SelectControl id="member-team" ariaLabel="Equipo del miembro" label={teams.find(item => item.id === teamId)?.name ?? 'Sin equipo'} options={[{ value: '', label: 'Sin equipo' }, ...teams.map(item => ({ value: item.id, label: item.name }))]} value={teamId} onChange={setTeamId} /></div>
      {error && <p role="alert" className="text-danger small mt-3 mb-0">{error}</p>}
    </Modal.Body>
    <Modal.Footer><Button variant="secondary" onClick={onHide} disabled={saving}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></Modal.Footer>
  </Modal>;
}

export default function Users() {
  const { user, campaign } = useCampaign();
  const [showCreate, setShowCreate] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<OrgUser | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: 'success' | 'danger' } | null>(null);
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}` : null;
  const membersQ = useAuthenticatedQuery<Member[]>(user, base ? `${base}/members` : null, [base]);
  const functionsQ = useAuthenticatedQuery<Item[]>(user, base ? `${base}/functions` : null, [base]);
  const teamsQ = useAuthenticatedQuery<Item[]>(user, base ? `${base}/teams` : null, [base]);
  const usersQ = useAuthenticatedQuery<OrgUser[]>(user, campaign ? `/api/organizations/${campaign.orgId}/users` : null, [campaign?.orgId]);
  const members = membersQ.data ?? [];
  const functions = functionsQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const orgUsers = usersQ.data ?? [];
  const reloadPeople = async () => { await Promise.all([membersQ.reload(), usersQ.reload(), teamsQ.reload()]); };

  const create = async (data: FormData) => {
    if (!user || !campaign) return;
    const created = await authenticatedFetch<Member>(user, `/api/organizations/${campaign.orgId}/users`, { method: 'POST', body: data });
    await reloadPeople(); setShowCreate(false);
    setNotice({ message: `${created.displayName} fue creado correctamente.`, variant: 'success' });
  };
  const updateProfile = async (data: FormData) => {
    if (!user || !campaign || !editingUser) return;
    const updated = await authenticatedFetch<OrgUser>(user, `/api/organizations/${campaign.orgId}/users/${editingUser.uid}`, { method: 'PUT', body: data });
    await reloadPeople(); setEditingUser(null);
    setNotice({ message: `${updated.displayName} fue actualizado correctamente.`, variant: 'success' });
  };
  const updateMember = async ({ functionId, teamId }: { functionId: string; teamId: string }) => {
    if (!user || !base || !editingMember) return;
    await authenticatedFetch(user, `${base}/members/${editingMember.uid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: editingMember.role, functionId: functionId || null, teamId: teamId || null }) });
    await reloadPeople();
    setNotice({ message: 'La asignación del miembro fue actualizada.', variant: 'success' });
  };
  const unlinkMember = async (member: Member) => {
    if (!user || !base || !window.confirm(`¿Quitar a ${member.displayName ?? member.email} de esta campaña?`)) return;
    try {
      await authenticatedFetch(user, `${base}/members/${member.uid}`, { method: 'DELETE' });
      await reloadPeople();
      setNotice({ message: `${member.displayName ?? member.email} fue desvinculado de esta campaña.`, variant: 'success' });
    } catch (caught) { setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos desvincular al miembro.', variant: 'danger' }); }
  };
  const deleteOrganizationUser = async () => {
    if (!user || !campaign || !deletingUser) return;
    setDeleting(true);
    try {
      await authenticatedFetch(user, `/api/organizations/${campaign.orgId}/users/${deletingUser.uid}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmEmail }) });
      await reloadPeople(); setDeletingUser(null); setConfirmEmail('');
      setNotice({ message: `${deletingUser.email} fue eliminado de la organización y de todas sus campañas.`, variant: 'success' });
    } catch (caught) { setNotice({ message: caught instanceof Error ? caught.message : 'No pudimos eliminar la cuenta.', variant: 'danger' }); }
    finally { setDeleting(false); }
  };

  return <PageContainer>
    <HeroBanner icon="users" title="Usuarios" subtitle="Gestioná a los colaboradores de tu campaña." subtitleDetail="Creá usuarios, asigná funciones y organizá el trabajo en equipo." tags={[]} ctaLabel="Crear usuario" onCtaClick={() => setShowCreate(true)} />
    <div className="cd-users__panels">
      <ContentPanel icon="users" title="Miembros de la campaña" subtitle="Personas vinculadas a la campaña activa.">{members.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>NOMBRE</th><th>CORREO</th><th>FUNCIÓN</th><th>EQUIPO</th><th>ACCIONES</th></tr></thead><tbody>{members.map(member => <tr key={member.uid}><td>{member.displayName}</td><td>{member.email}</td><td>{functions.find(item => item.id === member.functionId)?.name ?? 'Sin función'}</td><td>{teams.find(item => item.id === member.teamId)?.name ?? 'Sin equipo'}</td><td><div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditingMember(member)}>Editar</button><button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Desvincular ${member.displayName ?? member.email} de la campaña`} onClick={() => void unlinkMember(member)}>Eliminar</button></div></td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="Aún no hay miembros" description="Creá un usuario para esta campaña." ctaLabel="Crear usuario" onCtaClick={() => setShowCreate(true)} />}</ContentPanel>
      <ContentPanel icon="users" title="Usuarios de la organización" subtitle="Incluye usuarios sin campaña asignada.">{orgUsers.length ? <div className="cd-table-scroll"><table className="cd-data-table"><thead><tr><th>NOMBRE</th><th>CORREO</th><th>TELÉFONO</th><th>ACCIONES</th></tr></thead><tbody>{orgUsers.map(person => <tr key={person.uid}><td>{person.displayName}</td><td>{person.email}</td><td>{person.phone ?? '—'}</td><td><div className="d-flex gap-2"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditingUser(person)}>Editar</button><button type="button" className="btn btn-sm btn-outline-danger" aria-label={`Eliminar la cuenta de ${person.email}`} onClick={() => { setDeletingUser(person); setConfirmEmail(''); }}>Eliminar</button></div></td></tr>)}</tbody></table></div> : <EmptyState icon="users" title="Aún no hay usuarios" description="Creá el primer usuario." />}</ContentPanel>
    </div>
    <CreateUserModal show={showCreate} functions={functions} teams={teams} campaigns={campaign ? [{ id: campaign.campId, name: 'Campaña actual' }] : []} onHide={() => setShowCreate(false)} onSubmit={create} />
    <CreateUserModal show={Boolean(editingUser)} mode="edit" initialUser={editingUser} functions={functions} teams={teams} campaigns={[]} onHide={() => setEditingUser(null)} onSubmit={updateProfile} />
    <MemberAssignmentModal member={editingMember} functions={functions} teams={teams} onHide={() => setEditingMember(null)} onSave={updateMember} />
    <Modal show={Boolean(deletingUser)} onHide={() => !deleting && setDeletingUser(null)}>
      <Modal.Header closeButton><Modal.Title>Eliminar cuenta de usuario</Modal.Title></Modal.Header>
      <Modal.Body><p>Esta acción elimina la cuenta de Firebase Authentication, el perfil, la foto y todas sus asignaciones de campaña. No se puede deshacer.</p><label className="form-label" htmlFor="confirm-delete-email">Para confirmar, escribí el email de la persona</label><input id="confirm-delete-email" className="form-control" value={confirmEmail} onChange={event => setConfirmEmail(event.target.value)} placeholder={deletingUser?.email} autoComplete="off" /></Modal.Body>
      <Modal.Footer><Button variant="secondary" onClick={() => setDeletingUser(null)} disabled={deleting}>Cancelar</Button><Button variant="danger" onClick={() => void deleteOrganizationUser()} disabled={deleting || confirmEmail.trim().toLowerCase() !== deletingUser?.email.toLowerCase()}>{deleting ? 'Eliminando…' : 'Eliminar cuenta'}</Button></Modal.Footer>
    </Modal>
    {notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}
  </PageContainer>;
}
