import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { assertCampaignAdmin, assertCampaignAccess, campaignRef, NotFoundError, ValidationError } from './access.service.js';
import { db } from '../config/firebase.js';

type MemberData = {
  email?: string;
  displayName?: string;
  functionId?: string | null;
  teamId?: string | null;
  reportsTo?: string | null;
};

export type OrgChartMember = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  functionId: string | null;
  functionName: string;
  functionColor: string;
  teamId: string | null;
  teamName: string;
  reportsTo: string | null;
};

function normalizeReportsTo(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError('La persona responsable no es válida.');
  return value;
}

async function membersById(orgId: string, campId: string) {
  const snapshot = await campaignRef(orgId, campId).collection('members').get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as MemberData]));
}

function assertNoCycle(memberId: string, reportsTo: string, members: Map<string, MemberData>) {
  if (memberId === reportsTo) throw new ValidationError('Una persona no puede reportarse a sí misma.');
  const visited = new Set<string>();
  let current: string | null = reportsTo;
  while (current) {
    if (current === memberId) throw new ValidationError('La asignación generaría una referencia circular en el organigrama.');
    if (visited.has(current)) throw new ValidationError('El organigrama contiene una referencia circular que debe corregirse antes de continuar.');
    visited.add(current);
    current = typeof members.get(current)?.reportsTo === 'string' ? members.get(current)!.reportsTo! : null;
  }
}

export async function setReportsTo(user: DecodedIdToken, orgId: string, campId: string, memberId: string, input: { reportsTo?: unknown }) {
  assertCampaignAdmin(user, orgId, campId);
  const members = await membersById(orgId, campId);
  if (!members.has(memberId)) throw new NotFoundError('El miembro no existe en esta campaña.');
  const reportsTo = normalizeReportsTo(input.reportsTo);
  if (reportsTo) {
    if (!members.has(reportsTo)) throw new ValidationError('La persona responsable debe pertenecer a la misma campaña.');
    assertNoCycle(memberId, reportsTo, members);
  }
  await campaignRef(orgId, campId).collection('members').doc(memberId).update({ reportsTo, updatedAt: FieldValue.serverTimestamp() });
  return { uid: memberId, reportsTo };
}

export async function getOrgChart(user: DecodedIdToken, orgId: string, campId: string): Promise<OrgChartMember[]> {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const [membersSnapshot, functionsSnapshot, teamsSnapshot] = await Promise.all([
    campaign.collection('members').get(),
    campaign.collection('functions').where('deleted', '!=', true).get(),
    campaign.collection('teams').where('deleted', '!=', true).get()
  ]);
  const functionById = new Map(functionsSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const teamById = new Map(teamsSnapshot.docs.map((doc) => [doc.id, doc.data()]));
  const profiles = await Promise.all(membersSnapshot.docs.map((member) => db.collection('users').doc(member.id).get()));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.data() ?? {}]));

  return membersSnapshot.docs.map((member) => {
    const data = member.data() as MemberData;
    const profile = profileById.get(member.id) ?? {};
    const role = data.functionId ? functionById.get(data.functionId) : undefined;
    const team = data.teamId ? teamById.get(data.teamId) : undefined;
    return {
      uid: member.id,
      email: String(data.email ?? profile.email ?? ''),
      displayName: String(data.displayName ?? profile.displayName ?? data.email ?? 'Sin nombre'),
      photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : null,
      functionId: typeof data.functionId === 'string' ? data.functionId : null,
      functionName: String(role?.name ?? 'Sin función'),
      functionColor: String(role?.color ?? '#6C757D'),
      teamId: typeof data.teamId === 'string' ? data.teamId : null,
      teamName: String(team?.name ?? 'Sin equipo'),
      reportsTo: typeof data.reportsTo === 'string' ? data.reportsTo : null
    };
  });
}
