import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { backfillVoteStreamAgentAccess } from '../dist/services/voteStreamService.js';
import { adminAuth, db } from '../dist/config/firebase.js';

const env = Object.fromEntries((await readFile(new URL('../../web/.env.test', import.meta.url), 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const owner = await adminAuth.getUserByEmail(env.E2E_EMAIL);
const ownerProfile = await db.collection('users').doc(owner.uid).get();
const orgId = env.E2E_ORG_ID || ownerProfile.data()?.orgIds?.[0];
const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
if (!orgId || !campId) throw new Error('No se pudo resolver el contexto E2E para verificar el backfill legacy.');

const suffix = randomUUID().slice(0, 8);
const email = `legacy-vote-agent-${suffix}@cloudsuite.local`;
const password = `Legacy!${suffix}A9`;
const orgRef = db.collection('organizations').doc(orgId);
const campaignRef = orgRef.collection('campaigns').doc(campId);
const streamRef = campaignRef.collection('voteStreams').doc(`legacy-backfill-${suffix}`);
const originalAddons = (await orgRef.get()).data()?.enabledAddons;
let agent;

try {
  agent = await adminAuth.createUser({ email, password, displayName: 'Agente legacy Vote Stream' });
  await adminAuth.setCustomUserClaims(agent.uid, { orgId, role: 'usuario', camps: {} });
  const batch = db.batch();
  batch.set(db.collection('users').doc(agent.uid), { email, displayName: 'Agente legacy Vote Stream', orgIds: [orgId], createdAt: new Date() });
  batch.set(orgRef.collection('members').doc(agent.uid), { email, displayName: 'Agente legacy Vote Stream', role: 'usuario', createdAt: new Date() });
  batch.set(streamRef, { name: `Legacy access ${suffix}`, status: 'pendiente', createdAt: new Date() });
  // This mirrors the legacy state: linked to a Stream but missing the campaign
  // membership and claim that the application needs during bootstrap.
  batch.set(streamRef.collection('agents').doc(agent.uid), { assignedAt: new Date(), assignedBy: 'legacy-fixture' });
  await batch.commit();

  await backfillVoteStreamAgentAccess(true);
  const [organization, membership, claims] = await Promise.all([orgRef.get(), campaignRef.collection('members').doc(agent.uid).get(), adminAuth.getUser(agent.uid)]);
  if (organization.data()?.enabledAddons?.voteStream !== true) throw new Error('El backfill no habilitó Vote Stream para la organización del agente legacy.');
  if (!membership.exists) throw new Error('El backfill no creó la membresía de campaña del agente legacy.');
  if (claims.customClaims?.orgId !== orgId || claims.customClaims?.camps?.[campId] !== true) throw new Error('El backfill no reparó orgId/camps en los custom claims del agente legacy.');
  console.log(`BACKFILL LEGACY OK: agente=${agent.uid}, campaña=${campId}, claim camps[${campId}]=true, membresía de campaña presente y Vote Stream habilitado.`);
} finally {
  await db.recursiveDelete(streamRef).catch(() => undefined);
  if (agent) {
    await Promise.all([
      db.collection('users').doc(agent.uid).delete().catch(() => undefined),
      orgRef.collection('members').doc(agent.uid).delete().catch(() => undefined),
      campaignRef.collection('members').doc(agent.uid).delete().catch(() => undefined),
      adminAuth.deleteUser(agent.uid).catch(() => undefined)
    ]);
  }
  await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
}
