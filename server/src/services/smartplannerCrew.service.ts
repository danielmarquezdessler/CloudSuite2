import { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';
import { assertCampaignAccess, campaignAuthorizationPolicy, ForbiddenError, NotFoundError, ValidationError } from './access.service.js';

const campaign = (orgId: string, campId: string) => db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
type Point = { lat: number; lng: number };
const inside = (point: Point, polygon: Point[]) => { let contained = false; for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) { const a = polygon[current]; const b = polygon[previous]; if (((a.lng > point.lng) !== (b.lng > point.lng)) && point.lat < ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng) + a.lat) contained = !contained; } return contained; };

async function readable(user: DecodedIdToken, orgId: string, campId: string) { assertCampaignAccess(user, orgId, campId); const org = await db.collection('organizations').doc(orgId).get(); if (org.data()?.enabledAddons?.smartPlanner !== true) throw new ForbiddenError('SmartPlanner no está habilitado en el plan de esta organización.'); }
async function writable(user: DecodedIdToken, orgId: string, campId: string) { await readable(user, orgId, campId); if (campaignAuthorizationPolicy.collaboratorsManageCampaignResources || ['cliente', 'admin'].includes(String(user.role))) return; const member = await campaign(orgId, campId).collection('members').doc(user.uid).get(); if (!['pm', 'contador'].includes(String(member.data()?.smartPlannerRole ?? 'miembro'))) throw new ForbiddenError('No tenés permisos para asignar cuadrillas.'); }

export async function suggestions(user: DecodedIdToken, orgId: string, campId: string) {
  await readable(user, orgId, campId); const ref = campaign(orgId, campId);
  // Firestore `!=` omite documentos que no tienen el campo. Las zonas
  // históricas no siempre guardan `deleted: false`, por eso filtramos luego
  // de leer la colección completa.
  const [zones, voters, teams, goals] = await Promise.all([ref.collection('zones').get(), ref.collection('voters').get(), ref.collection('teams').get(), ref.collection('goals').get()]);
  const activeTeams = teams.docs.filter((team) => !team.data().deleted).map((team) => ({ id: team.id, name: String(team.data().name ?? 'Equipo'), load: voters.docs.filter((voter) => voter.data().assignedTeamId === team.id).length }));
  return zones.docs.filter((zone) => !zone.data().deleted).map((zone) => {
    const polygon = Array.isArray(zone.data().polygon) ? zone.data().polygon as Point[] : []; const local = polygon.length >= 3 ? voters.docs.filter((voter) => typeof voter.data().lat === 'number' && typeof voter.data().lng === 'number' && inside({ lat: voter.data().lat, lng: voter.data().lng }, polygon)) : [];
    const visited = local.filter((voter) => voter.data().state !== 'unvisited').length; const total = local.length; const coverage = total ? Math.round((visited / total) * 100) : 0; const goal = goals.docs.find((item) => item.data().zoneId === zone.id && item.data().type === 'coverage' && !item.data().deleted); const target = Number(goal?.data().target ?? 100); const team = [...activeTeams].sort((left, right) => left.load - right.load)[0] ?? null;
    return { zoneId: zone.id, zoneName: String(zone.data().name ?? 'Zona'), total, visited, coverage, target, gap: Math.max(0, target - coverage), suggestedTeamId: team?.id ?? null, suggestedTeamName: team?.name ?? 'Sin equipos disponibles', assignedTeamId: zone.data().assignedTeamId ?? null };
  }).filter((zone) => zone.total > 0).sort((left, right) => right.gap - left.gap || left.coverage - right.coverage).slice(0, 10);
}

export async function assign(user: DecodedIdToken, orgId: string, campId: string, zoneId: string, teamId: string) {
  await writable(user, orgId, campId); const ref = campaign(orgId, campId); const [zone, team, voters] = await Promise.all([ref.collection('zones').doc(zoneId).get(), ref.collection('teams').doc(teamId).get(), ref.collection('voters').get()]); if (!zone.exists) throw new NotFoundError('La zona no existe.'); if (!team.exists || team.data()?.deleted) throw new ValidationError('El equipo seleccionado no existe.'); const polygon = Array.isArray(zone.data()?.polygon) ? zone.data()!.polygon as Point[] : []; if (polygon.length < 3) throw new ValidationError('La zona no tiene un polígono válido.'); const selected = voters.docs.filter((voter) => typeof voter.data().lat === 'number' && typeof voter.data().lng === 'number' && inside({ lat: voter.data().lat, lng: voter.data().lng }, polygon)); const batch = db.batch(); batch.update(zone.ref, { assignedTeamId: teamId, updatedAt: FieldValue.serverTimestamp() }); selected.forEach((voter) => batch.update(voter.ref, { assignedTeamId: teamId, updatedAt: FieldValue.serverTimestamp() })); await batch.commit(); return { zoneId, teamId, updatedVoters: selected.length };
}
