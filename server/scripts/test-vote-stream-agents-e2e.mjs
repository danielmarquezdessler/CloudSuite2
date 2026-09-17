import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const serverDir = fileURLToPath(new URL('../', import.meta.url));
const testEnvPath = fileURLToPath(new URL('../../web/.env.test', import.meta.url));
const webEnvPath = fileURLToPath(new URL('../../web/.env', import.meta.url));
const apiUrl = 'http://127.0.0.1:8084';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let api;
let restore;

async function waitForApi() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(`${apiUrl}/health`)).ok) return; } catch { /* Backend is starting. */ }
    await pause(300);
  }
  throw new Error('La API temporal no respondió para Vote Stream Agentes.');
}

async function signIn(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const result = await response.json();
  if (!response.ok || !result.idToken) throw new Error(`No se obtuvo token Firebase para ${email}: ${result.error?.message ?? response.status}.`);
  return result.idToken;
}

async function apiRequest(token, path, init = {}) {
  return fetch(`${apiUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
}

try {
  const [testEnv, webEnv] = await Promise.all([readFile(testEnvPath, 'utf8').then(parseEnv), readFile(webEnvPath, 'utf8').then(parseEnv)]);
  const { adminAuth, db } = await import('../dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const ownerProfile = await db.collection('users').doc(owner.uid).get();
  const orgId = testEnv.E2E_ORG_ID || ownerProfile.data()?.orgIds?.[0];
  const campId = testEnv.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId || !webEnv.VITE_FIREBASE_API_KEY) throw new Error('Faltan IDs E2E o la clave pública Firebase local.');

  const suffix = Date.now().toString(36);
  const password = `Agent-${suffix}-Seguro!7`;
  const createdUsers = [];
  const streamIds = [];
  const orgRef = db.collection('organizations').doc(orgId);
  const campaign = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  restore = async () => {
    await Promise.all(streamIds.map((id) => db.recursiveDelete(campaign.collection('voteStreams').doc(id))));
    await Promise.all(createdUsers.map((uid) => adminAuth.deleteUser(uid).catch(() => undefined)));
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
  };

  const createAgent = async (name) => {
    const user = await adminAuth.createUser({ email: `vote-agent-${name}-${suffix}@cloudsuite.local`, password, displayName: `Agente ${name}` });
    createdUsers.push(user.uid);
    await adminAuth.setCustomUserClaims(user.uid, { orgId, role: 'militante', camps: { [campId]: true } });
    return user;
  };
  const [agentOne, agentTwo, outsider] = await Promise.all([createAgent('uno'), createAgent('dos'), createAgent('externo')]);
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), voteStream: true } }, { merge: true });

  const activeRef = campaign.collection('voteStreams').doc(`agents-active-${suffix}`);
  const pendingRef = campaign.collection('voteStreams').doc(`agents-pending-${suffix}`);
  streamIds.push(activeRef.id, pendingRef.id);
  const candidateOne = activeRef.collection('candidates').doc('candidate-one');
  const candidateTwo = activeRef.collection('candidates').doc('candidate-two');
  const location = activeRef.collection('subLocations').doc('location-central');
  const gender = activeRef.collection('genderOptions').doc('gender-f');
  const ageRange = activeRef.collection('ageRanges').doc('age-30-45');
  const fixture = db.batch();
  fixture.set(activeRef, { name: 'Activa Agentes E2E', status: 'activa', location: 'Villa del Totoral', date: '2026-09-17', electoralSystem: 'mayoritario_uninominal', createdAt: new Date() });
  fixture.set(candidateOne, { name: 'Candidata Uno', order: 1 }); fixture.set(candidateTwo, { name: 'Candidato Dos', order: 2 }); fixture.set(location, { name: 'Escuela Central' }); fixture.set(gender, { name: 'Femenino' }); fixture.set(ageRange, { name: '30 a 45' });
  fixture.set(activeRef.collection('agents').doc(agentOne.uid), { assignedAt: new Date() }); fixture.set(activeRef.collection('agents').doc(agentTwo.uid), { assignedAt: new Date() });
  fixture.set(pendingRef, { name: 'Pendiente Agentes E2E', status: 'pendiente', location: 'Villa del Totoral', date: '2026-09-18', electoralSystem: 'mayoritario_uninominal', createdAt: new Date() }); fixture.set(pendingRef.collection('candidates').doc('candidate-pending'), { name: 'Candidata Pendiente', order: 1 }); fixture.set(pendingRef.collection('agents').doc(agentOne.uid), { assignedAt: new Date() });
  await fixture.commit();

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8084' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForApi();
  const [agentOneToken, agentTwoToken, outsiderToken] = await Promise.all([
    signIn(webEnv.VITE_FIREBASE_API_KEY, agentOne.email, password), signIn(webEnv.VITE_FIREBASE_API_KEY, agentTwo.email, password), signIn(webEnv.VITE_FIREBASE_API_KEY, outsider.email, password)
  ]);
  const base = `/api/organizations/${orgId}/campaigns/${campId}/vote-stream`;

  const mineResponse = await apiRequest(agentOneToken, `${base}/mine`);
  const mine = await mineResponse.json();
  if (!mineResponse.ok || !Array.isArray(mine)) throw new Error(`/mine falló: ${mineResponse.status} ${JSON.stringify(mine)}.`);
  const activeMine = mine.find((stream) => stream.id === activeRef.id);
  if (!activeMine || activeMine.candidates.length !== 2 || activeMine.subLocations[0]?.id !== location.id || activeMine.genderOptions[0]?.id !== gender.id || activeMine.ageRanges[0]?.id !== ageRange.id) throw new Error(`/mine no devolvió la configuración completa: ${JSON.stringify(mine)}.`);
  console.log('1/5 OK: /mine devolvió las Vote Streams asignadas con candidatos y opciones reales.');

  const payload = { subLocationId: location.id, genderId: gender.id, ageRangeId: ageRange.id, votesByCandidate: { [candidateOne.id]: 14, [candidateTwo.id]: 6 } };
  const submissionResponse = await apiRequest(agentOneToken, `${base}/${activeRef.id}/submissions`, { method: 'POST', body: JSON.stringify(payload) });
  const submission = await submissionResponse.json();
  const storedSubmission = await activeRef.collection('submissions').doc(submission.id).get();
  if (submissionResponse.status !== 201 || !storedSubmission.exists || storedSubmission.data()?.submittedBy !== agentOne.uid || storedSubmission.data()?.votesByCandidate?.[candidateOne.id] !== 14) throw new Error(`La submission válida no persistió: ${JSON.stringify(submission)}.`);
  console.log('2/5 OK: submission válida creada por API y persistida en Firestore.');

  const invalidCandidate = await apiRequest(agentOneToken, `${base}/${activeRef.id}/submissions`, { method: 'POST', body: JSON.stringify({ votesByCandidate: { 'candidate-ajeno': 1 } }) });
  const invalidOption = await apiRequest(agentOneToken, `${base}/${activeRef.id}/submissions`, { method: 'POST', body: JSON.stringify({ subLocationId: 'location-ajena', votesByCandidate: { [candidateOne.id]: 1 } }) });
  if (invalidCandidate.status !== 400 || invalidOption.status !== 400) throw new Error(`No se validaron IDs de configuración: candidato=${invalidCandidate.status}, ubicación=${invalidOption.status}.`);
  console.log('Validaciones OK: candidateId y subLocationId ajenos fueron rechazados por el backend.');

  const otherSubmission = await apiRequest(agentTwoToken, `${base}/${activeRef.id}/submissions`, { method: 'POST', body: JSON.stringify({ votesByCandidate: { [candidateOne.id]: 3 } }) });
  if (otherSubmission.status !== 201) throw new Error(`El segundo agente no pudo crear su submission: ${otherSubmission.status} ${await otherSubmission.text()}`);
  const forbidden = await apiRequest(outsiderToken, `${base}/${activeRef.id}/submissions`, { method: 'POST', body: JSON.stringify({ votesByCandidate: { [candidateOne.id]: 1 } }) });
  if (forbidden.status !== 403) throw new Error(`Un no-agente no fue rechazado con 403: ${forbidden.status} ${await forbidden.text()}`);
  console.log('3/5 OK: un usuario no asignado recibió 403 al intentar enviar datos.');

  const pending = await apiRequest(agentOneToken, `${base}/${pendingRef.id}/submissions`, { method: 'POST', body: JSON.stringify({ votesByCandidate: { 'candidate-pending': 1 } }) });
  const pendingBody = await pending.json();
  if (pending.status !== 400 || !String(pendingBody.message).includes('no está activa')) throw new Error(`La Vote Stream pendiente no devolvió el error claro esperado: ${pending.status} ${JSON.stringify(pendingBody)}`);
  console.log('4/5 OK: una Vote Stream pendiente rechazó el envío con “no está activa”.');

  const myResponse = await apiRequest(agentOneToken, `${base}/${activeRef.id}/my-submissions`);
  const mySubmissions = await myResponse.json();
  if (!myResponse.ok || mySubmissions.length !== 1 || mySubmissions.some((item) => item.submittedBy !== agentOne.uid)) throw new Error(`/my-submissions expuso submissions ajenas: ${JSON.stringify(mySubmissions)}.`);
  console.log('5/5 OK: /my-submissions devolvió exclusivamente la submission del agente autenticado.');
} finally {
  api?.kill();
  await restore?.();
}
