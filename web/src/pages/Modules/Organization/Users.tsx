import { useState } from 'react';
import { authenticatedFetch, useAuthenticatedQuery } from '../../../lib/api';
import ContentPanel from '../../../components/Shared/ContentPanel';
import EmptyState from '../../../components/Shared/EmptyState';
import HeroBanner from '../../../components/Shared/HeroBanner';
import PageContainer from '../../../components/Shared/PageContainer';
import { Toast } from '../../../components/Toast';
import CreateUserModal from '../../../components/Organization/CreateUserModal';
import { useCampaign } from './useCampaign';

type Member = { uid:string; displayName?:string; email:string; role:string; functionId?:string; teamId?:string };
type Item = { id:string; name:string };
type OrgUser = { uid:string; displayName?:string; email:string; phone?:string; role:string };

export default function Users() {
  const { user, campaign } = useCampaign();
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState<{ message:string; variant:'success' | 'danger' } | null>(null);
  const base = campaign ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}` : null;
  const membersQ = useAuthenticatedQuery<Member[]>(user, base ? `${base}/members` : null, [base]);
  const functionsQ = useAuthenticatedQuery<Item[]>(user, base ? `${base}/functions` : null, [base]);
  const teamsQ = useAuthenticatedQuery<Item[]>(user, base ? `${base}/teams` : null, [base]);
  const usersQ = useAuthenticatedQuery<OrgUser[]>(user, campaign ? `/api/organizations/${campaign.orgId}/users` : null, [campaign?.orgId]);
  const members = membersQ.data ?? [];
  const functions = functionsQ.data ?? [];
  const teams = teamsQ.data ?? [];
  const orgUsers = usersQ.data ?? [];
  const create = async (data: FormData) => {
    if (!user || !campaign) return;
    const created = await authenticatedFetch<Member>(user, `/api/organizations/${campaign.orgId}/users`, { method:'POST', body:data });
    await Promise.all([membersQ.reload(), usersQ.reload(), teamsQ.reload()]);
    setShow(false);
    setNotice({ message:`${created.displayName} fue creado correctamente.`, variant:'success' });
  };
  return <PageContainer>
    <HeroBanner icon="users" title="Usuarios" subtitle="Gestioná a los colaboradores de tu campaña." subtitleDetail="Creá usuarios, asigná funciones y organizá el trabajo en equipo." tags={[]} ctaLabel="Crear usuario" onCtaClick={() => setShow(true)} />
    <ContentPanel icon="users" title="Miembros de la campaña" subtitle="Personas vinculadas a la campaña activa.">{members.length ? <table className="cd-data-table"><thead><tr><th>NOMBRE</th><th>CORREO</th><th>FUNCIÓN</th><th>EQUIPO</th></tr></thead><tbody>{members.map(member => <tr key={member.uid}><td>{member.displayName}</td><td>{member.email}</td><td>{functions.find(item => item.id === member.functionId)?.name ?? 'Sin función'}</td><td>{teams.find(item => item.id === member.teamId)?.name ?? 'Sin equipo'}</td></tr>)}</tbody></table> : <EmptyState icon="users" title="Aún no hay miembros" description="Creá un usuario para esta campaña." ctaLabel="Crear usuario" onCtaClick={() => setShow(true)} />}</ContentPanel>
    <ContentPanel icon="users" title="Usuarios de la organización" subtitle="Incluye usuarios sin campaña asignada.">{orgUsers.length ? <table className="cd-data-table"><thead><tr><th>NOMBRE</th><th>CORREO</th><th>TELÉFONO</th></tr></thead><tbody>{orgUsers.map(person => <tr key={person.uid}><td>{person.displayName}</td><td>{person.email}</td><td>{person.phone ?? '—'}</td></tr>)}</tbody></table> : <EmptyState icon="users" title="Aún no hay usuarios" description="Creá el primer usuario." />}</ContentPanel>
    <CreateUserModal show={show} functions={functions} teams={teams} campaigns={campaign ? [{ id:campaign.campId, name:'Campaña actual' }] : []} onHide={() => setShow(false)} onSubmit={create} />
    {notice && <Toast message={notice.message} variant={notice.variant} onClose={() => setNotice(null)} />}
  </PageContainer>;
}
