import { DecodedIdToken } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { assertCampaignAccess, campaignRef } from './access.service.js';

type Visit = { voterId?: string; visitUid?: string; startedAt?: Timestamp; completedAt?: Timestamp; conversion?: { decision?: string }; state?: string };
const dateValue = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;

export async function heatmapPoints(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const voters = await campaignRef(orgId, campId).collection('voters').get();
  return voters.docs.flatMap((doc) => {
    const data = doc.data();
    return typeof data.lat === 'number' && typeof data.lng === 'number'
      ? [{ id: doc.id, lat: data.lat, lng: data.lng, state: String(data.state ?? 'unvisited'), name: String(data.name ?? '') }]
      : [];
  });
}

export async function undecidedVoters(user: DecodedIdToken, orgId: string, campId: string) {
  assertCampaignAccess(user, orgId, campId);
  const campaign = campaignRef(orgId, campId);
  const [voters, visits, members, teams, functions] = await Promise.all([
    campaign.collection('voters').where('state', '==', 'undecided').get(),
    campaign.collection('visits').get(), campaign.collection('members').get(), campaign.collection('teams').get(), campaign.collection('functions').get()
  ]);
  const memberById = new Map(members.docs.map((doc) => [doc.id, doc.data()]));
  const teamNames = new Map(teams.docs.map((doc) => [doc.id, String(doc.data().name ?? '')]));
  const functionNames = new Map(functions.docs.map((doc) => [doc.id, String(doc.data().name ?? '')]));
  return voters.docs.map((voter) => {
    const relevant = visits.docs.map((doc) => doc.data() as Visit).filter((visit) => visit.voterId === voter.id);
    const last = relevant.sort((a, b) => (b.startedAt?.toMillis() ?? 0) - (a.startedAt?.toMillis() ?? 0))[0];
    const member = last?.visitUid ? memberById.get(last.visitUid) : undefined;
    const data = voter.data();
    return {
      id: voter.id, name: String(data.name ?? 'Elector sin nombre'), address: String(data.address ?? ''),
      visitCount: relevant.length, lastVisitAt: dateValue(last?.completedAt ?? last?.startedAt),
      lastVisitorUid: last?.visitUid ?? null, teamName: member?.teamId ? teamNames.get(String(member.teamId)) ?? null : null,
      functionName: member?.functionId ? functionNames.get(String(member.functionId)) ?? null : null
    };
  });
}
