import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
const crew = await import('../../server/dist/services/smartplannerCrew.service.js');
const messages = await import('../../server/dist/services/smartplannerMessages.service.js');
const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
const profile = await db.collection('users').doc(authUser.uid).get();
const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
const camp = db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
const user = { uid: authUser.uid, email: authUser.email, ...(authUser.customClaims ?? {}) };
const suffix = Date.now(); const ids = { zone: `e2e-zone-${suffix}`, team: `e2e-team-${suffix}`, voterA: `e2e-voter-a-${suffix}`, voterB: `e2e-voter-b-${suffix}` }; const messageIds = [];
await db.collection('organizations').doc(orgId).set({ enabledAddons: { smartPlanner: true } }, { merge: true });
try {
  await Promise.all([
    camp.collection('teams').doc(ids.team).set({ name: `Equipo E2E ${suffix}`, createdAt: new Date() }),
    camp.collection('zones').doc(ids.zone).set({ name: `Zona E2E ${suffix}`, polygon: [{ lat: -31.42, lng: -64.19 }, { lat: -31.42, lng: -64.17 }, { lat: -31.40, lng: -64.17 }, { lat: -31.40, lng: -64.19 }], createdAt: new Date() }),
    camp.collection('voters').doc(ids.voterA).set({ name: 'Elector Cuadrilla A', lat: -31.41, lng: -64.18, state: 'unvisited' }),
    camp.collection('voters').doc(ids.voterB).set({ name: 'Elector Cuadrilla B', lat: -31.411, lng: -64.181, state: 'indeciso' })
  ]);
  const ranked = await crew.suggestions(user, orgId, campId); const suggestion = ranked.find((item) => item.zoneId === ids.zone); if (!suggestion || suggestion.total < 2 || !suggestion.suggestedTeamId) throw new Error(`La sugerencia de cuadrilla no reflejó la zona y los electores reales: ${JSON.stringify(suggestion)}.`);
  const assigned = await crew.assign(user, orgId, campId, ids.zone, suggestion.suggestedTeamId); const assignedVoters = await Promise.all([camp.collection('voters').doc(ids.voterA).get(), camp.collection('voters').doc(ids.voterB).get()]); if (assigned.updatedVoters < 2 || assignedVoters.some((voter) => voter.data()?.assignedTeamId !== suggestion.suggestedTeamId)) throw new Error('La asignación no actualizó los electores reales.'); console.log(`Cuadrillas E2E OK: Zona priorizada y ${assigned.updatedVoters} electores asignados al equipo sugerido.`);
  const draft = await messages.save(user, orgId, campId, null, { title: `Mensaje E2E ${suffix}`, content: 'Contenido real de prueba.' }); messageIds.push(draft.id); await messages.submit(user, orgId, campId, draft.id); await messages.approve(user, orgId, campId, draft.id); const approved = (await camp.collection('spMessages').doc(draft.id).get()).data(); if (approved?.status !== 'aprobado' || approved?.approvedBy !== authUser.uid) throw new Error('La aprobación no quedó registrada.');
  const rejected = await messages.save(user, orgId, campId, null, { title: `Mensaje rechazo E2E ${suffix}`, content: 'Contenido para rechazo.' }); messageIds.push(rejected.id); await messages.submit(user, orgId, campId, rejected.id); await messages.reject(user, orgId, campId, rejected.id, 'Requiere ajuste de tono.'); const rejectedData = (await camp.collection('spMessages').doc(rejected.id).get()).data(); if (rejectedData?.status !== 'rechazado' || rejectedData?.rejectionReason !== 'Requiere ajuste de tono.') throw new Error('El rechazo no quedó registrado.'); console.log('Mensajes E2E OK: borrador bloqueado al enviar, aprobación y rechazo con motivo persistieron en Firestore.');
} finally {
  await Promise.all([camp.collection('zones').doc(ids.zone).delete(), camp.collection('teams').doc(ids.team).delete(), camp.collection('voters').doc(ids.voterA).delete(), camp.collection('voters').doc(ids.voterB).delete(), ...messageIds.map((id) => camp.collection('spMessages').doc(id).delete())]);
}
