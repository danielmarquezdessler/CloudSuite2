import { DecodedIdToken } from 'firebase-admin/auth';
import { assertCampaignAccess, campaignRef } from './access.service.js';

type CacheValue = { expiresAt: number; value: unknown };
type Entity = Record<string, unknown> & { id: string };
const cache = new Map<string, CacheValue>();
const FIVE_MINUTES = 5 * 60 * 1000;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (value: unknown) => value && typeof (value as { toDate?: unknown }).toDate === 'function'
  ? (value as { toDate: () => Date }).toDate() : null;
const percentage = (part: number, total: number) => total ? Math.round((part / total) * 1000) / 10 : 0;
type DateRange = { start?: Date; end?: Date };
const inRange = (value: unknown, range?: DateRange) => { const date = toDate(value); return !range || !date || ((!range.start || date >= range.start) && (!range.end || date <= range.end)); };

export function invalidateAnalytics(orgId: string, campId: string) {
  for (const key of cache.keys()) if (key.startsWith(`${orgId}/${campId}/`)) cache.delete(key);
}

async function collect(orgId: string, campId: string) {
  const campaign = campaignRef(orgId, campId);
  const [campaignSnapshot, votersSnap, visitsSnap, membersSnap, teamsSnap, functionsSnap] = await Promise.all([
    campaign.get(), campaign.collection('voters').get(), campaign.collection('visits').get(), campaign.collection('members').get(),
    campaign.collection('teams').where('deleted', '!=', true).get(), campaign.collection('functions').where('deleted', '!=', true).get()
  ]);
  const voters = votersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entity));
  // A Principal change preserves the historical visits for auditability but begins a
  // new conversion measurement period. Older visits must not repopulate the KPIs.
  const resetAt = toDate(campaignSnapshot.data()?.metricsResetAt);
  const visits = visitsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as Entity))
    .filter(visit => !resetAt || (toDate(visit.startedAt) ?? toDate(visit.completedAt) ?? new Date(0)) >= resetAt);
  const members = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entity));
  const teams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entity));
  const functions = functionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Entity));
  return { voters, visits, members, teams, functions };
}

function dailyStats(visits: Array<Record<string, unknown>>, days: number) {
  const dates = Array.from({ length: days }, (_, i) => { const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() - (days - 1 - i)); return day; });
  const rows = new Map(dates.map(day => [dateKey(day), { date: dateKey(day), visits: 0, conversions_yes: 0, conversions_no: 0, undecided_additions: 0 }]));
  for (const visit of visits) {
    const when = toDate(visit.startedAt) ?? toDate(visit.completedAt); const row = when ? rows.get(dateKey(when)) : undefined;
    if (!row) continue;
    row.visits++;
    const decision = (visit.conversion as { decision?: string } | undefined)?.decision;
    if (decision === 'yes') row.conversions_yes++;
    if (decision === 'no') row.conversions_no++;
    if (decision === 'undecided') row.undecided_additions++;
  }
  let accumulatedYes = 0;
  return [...rows.values()].map(row => ({ ...row, accumulated_yes: accumulatedYes += row.conversions_yes }));
}

export async function getSummary(user: DecodedIdToken, orgId: string, campId: string, range?: DateRange) {
  assertCampaignAccess(user, orgId, campId); const key = `${orgId}/${campId}/summary/${range?.start?.toISOString() ?? ''}/${range?.end?.toISOString() ?? ''}`; const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const { voters, visits: allVisits, members, teams, functions } = await collect(orgId, campId); const visits = allVisits.filter(visit => inRange(visit.startedAt, range));
  const totalVoters = voters.length;
  const visitedCount = new Set(visits.map(visit => String(visit.voterId ?? '')).filter(Boolean)).size;
  const convertedYes = visits.filter(visit => (visit.conversion as { decision?: string } | undefined)?.decision === 'yes').length;
  const convertedNo = visits.filter(visit => (visit.conversion as { decision?: string } | undefined)?.decision === 'no').length;
  const undecidedCount = visits.filter(visit => (visit.conversion as { decision?: string } | undefined)?.decision === 'undecided').length;
  const byMember = new Map<string, { visitsCount: number; conversionsCount: number }>();
  for (const visit of visits) { const uid = String(visit.visitUid ?? ''); if (!uid) continue; const stat = byMember.get(uid) ?? { visitsCount: 0, conversionsCount: 0 }; stat.visitsCount++; if ((visit.conversion as { decision?: string } | undefined)?.decision === 'yes') stat.conversionsCount++; byMember.set(uid, stat); }
  const byTeam = new Map<string, { visitsCount: number; conversionsCount: number }>();
  for (const member of members) { const teamId = typeof member.teamId === 'string' ? member.teamId : ''; if (!teamId) continue; const memberStat = byMember.get(member.id) ?? { visitsCount: 0, conversionsCount: 0 }; const stat = byTeam.get(teamId) ?? { visitsCount: 0, conversionsCount: 0 }; stat.visitsCount += memberStat.visitsCount; stat.conversionsCount += memberStat.conversionsCount; byTeam.set(teamId, stat); }
  const teamStats = teams.map(team => { const stat = byTeam.get(team.id) ?? { visitsCount: 0, conversionsCount: 0 }; const membersCount = members.filter(member => member.teamId === team.id).length; return { teamId: team.id, teamName: String(team.name ?? 'Sin nombre'), membersCount, ...stat, conversionRate: percentage(stat.conversionsCount, stat.visitsCount) }; });
  const functionStats = functions.map(func => { const membersWithFunction = members.filter(member => member.functionId === func.id); const stat = membersWithFunction.reduce<{ visitsCount: number; conversionsCount: number }>((total, member) => { const current = byMember.get(member.id) ?? { visitsCount: 0, conversionsCount: 0 }; return { visitsCount: total.visitsCount + current.visitsCount, conversionsCount: total.conversionsCount + current.conversionsCount }; }, { visitsCount: 0, conversionsCount: 0 }); return { functionId: func.id, functionName: String(func.name ?? 'Sin función'), ...stat }; });
  const topMilitants = members.map(member => { const stat = byMember.get(member.id) ?? { visitsCount: 0, conversionsCount: 0 }; return { uid: member.id, name: String(member.displayName ?? member.email ?? member.id), ...stat, conversionRate: percentage(stat.conversionsCount, stat.visitsCount) }; }).sort((a, b) => b.visitsCount - a.visitsCount).slice(0, 10);
  const value = { totalVoters, visitedCount, convertedYes, convertedNo, undecidedCount, conversionRate: percentage(convertedYes, visitedCount), coverageRate: percentage(visitedCount, totalVoters), daily: dailyStats(visits, 7), teamStats, functionStats, topMilitants };
  cache.set(key, { expiresAt: Date.now() + FIVE_MINUTES, value }); return value;
}

export async function getTimeline(user: DecodedIdToken, orgId: string, campId: string, range?: DateRange) { assertCampaignAccess(user, orgId, campId); const key = `${orgId}/${campId}/timeline/${range?.start?.toISOString() ?? ''}/${range?.end?.toISOString() ?? ''}`; const hit = cache.get(key); if (hit && hit.expiresAt > Date.now()) return hit.value; const { visits: allVisits } = await collect(orgId, campId); const visits = allVisits.filter(visit => inRange(visit.startedAt, range)); const days = range?.start && range?.end ? Math.max(1, Math.min(366, Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1)) : 30; const value = { daily: dailyStats(visits, days) }; cache.set(key, { expiresAt: Date.now() + FIVE_MINUTES, value }); return value; }
export async function getHeatmap(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAccess(user, orgId, campId); const { voters } = await collect(orgId, campId); const buckets = new Map<string, number>(); for (const voter of voters) { const state = String(voter.state ?? 'unvisited'); buckets.set(state, (buckets.get(state) ?? 0) + 1); } return [...buckets].map(([state, count]) => ({ state, count })); }
