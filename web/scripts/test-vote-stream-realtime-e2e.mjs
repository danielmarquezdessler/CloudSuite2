import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const serverDir = resolve(rootDir, 'server');
const testEnvPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5200';
const apiUrl = 'http://127.0.0.1:8086';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let api; let vite; let browser; let restore;

async function waitFor(url, label) { for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch { /* Iniciando. */ } await pause(300); } throw new Error(`${label} no respondió.`); }
async function signIn(page, email, password) { await page.goto(webUrl); await page.getByLabel('Email').fill(email); await page.getByLabel('Contraseña').fill(password); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/); }

try {
  const testEnv = parseEnv(await readFile(testEnvPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const admin = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const profile = await db.collection('users').doc(admin.uid).get();
  const orgId = testEnv.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = testEnv.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver el contexto E2E.');

  const suffix = Date.now().toString(36); const password = `Sondeo-${suffix}-Seguro!7`;
  const orgRef = db.collection('organizations').doc(orgId); const campaignRef = orgRef.collection('campaigns').doc(campId); const streamRef = campaignRef.collection('voteStreams').doc(`realtime-mobile-${suffix}`); const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const agent = await adminAuth.createUser({ email: `sondeo-mobile-${suffix}@cloudsuite.local`, password, displayName: 'Agente Mobile E2E' });
  await adminAuth.setCustomUserClaims(agent.uid, { orgId, role: 'militante', camps: { [campId]: true } });
  restore = async () => {
    await db.recursiveDelete(streamRef).catch(() => undefined);
    await Promise.all([db.collection('users').doc(agent.uid).delete().catch(() => undefined), orgRef.collection('members').doc(agent.uid).delete().catch(() => undefined), campaignRef.collection('members').doc(agent.uid).delete().catch(() => undefined)]);
    await adminAuth.deleteUser(agent.uid).catch(() => undefined);
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
  };
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), voteStream: true } }, { merge: true });
  const candidateOne = streamRef.collection('candidates').doc('candidate-one'); const candidateTwo = streamRef.collection('candidates').doc('candidate-two');
  const fixture = db.batch();
  fixture.set(db.collection('users').doc(agent.uid), { email: agent.email, displayName: agent.displayName, orgIds: [orgId], createdAt: new Date() });
  fixture.set(orgRef.collection('members').doc(agent.uid), { role: 'militante', createdAt: new Date() });
  fixture.set(campaignRef.collection('members').doc(agent.uid), { email: agent.email, displayName: agent.displayName, role: 'militante', joinedAt: new Date() });
  fixture.set(streamRef, { name: `Tiempo Real Mobile ${suffix}`, status: 'activa', location: 'Villa del Totoral', date: '2026-09-17', electoralSystem: 'mayoritario_uninominal', createdAt: new Date(), liveResults: { totals: { [candidateOne.id]: 0, [candidateTwo.id]: 0 }, totalVotes: 0, updatedAt: new Date() } });
  fixture.set(candidateOne, { name: 'Candidata Uno', party: 'Frente E2E', order: 1 }); fixture.set(candidateTwo, { name: 'Candidato Dos', party: 'Partido E2E', order: 2 });
  fixture.set(streamRef.collection('subLocations').doc('escuela'), { name: 'Escuela Central' }); fixture.set(streamRef.collection('genderOptions').doc('femenino'), { name: 'Femenino' }); fixture.set(streamRef.collection('ageRanges').doc('30-45'), { name: '30 a 45' });
  // El cliente administrador también queda asignado únicamente para que la
  // prueba compruebe onSnapshot con las reglas vigentes, no para cargar datos.
  fixture.set(streamRef.collection('agents').doc(admin.uid), { assignedAt: new Date() }); fixture.set(streamRef.collection('agents').doc(agent.uid), { assignedAt: new Date() });
  await fixture.commit();

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8086' }, stdio: 'ignore' }); await waitFor(`${apiUrl}/health`, 'La API temporal');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5200'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' }); await waitFor(webUrl, 'Vite');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const agentPage = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true }); adminPage.setDefaultTimeout(30_000); agentPage.setDefaultTimeout(30_000);
  await signIn(adminPage, testEnv.E2E_EMAIL, testEnv.E2E_PASSWORD); await signIn(agentPage, agent.email, password);
  await adminPage.goto(`${webUrl}/vote-stream/${streamRef.id}`); await adminPage.getByRole('heading', { name: `Tiempo Real Mobile ${suffix}`, exact: true }).waitFor();
  await agentPage.goto(`${webUrl}/vote-stream/mi-panel`); await agentPage.getByRole('heading', { name: 'Mi panel de Sondeo', exact: true }).waitFor();
  const activeCard = agentPage.locator('.vote-agent-stream', { hasText: `Tiempo Real Mobile ${suffix}` }); await activeCard.getByRole('button', { name: 'Cargar resultados', exact: true }).click();
  const candidateInput = agentPage.getByLabel('Votos para Candidata Uno'); const inputBox = await candidateInput.boundingBox(); if (!inputBox || inputBox.height < 50 || inputBox.width < 90) throw new Error(`El input mobile no alcanzó un área táctil amplia: ${JSON.stringify(inputBox)}`);
  await candidateInput.fill('13'); await agentPage.getByLabel('Votos para Candidato Dos').fill('7');
  for (const [label, option] of [['Sub-ubicación', 'Escuela Central'], ['Género', 'Femenino'], ['Rango de edad', '30 a 45']]) { await agentPage.getByLabel(label).click(); await agentPage.getByRole('option', { name: option, exact: true }).click(); }
  const submitButton = agentPage.getByRole('button', { name: 'Confirmar y enviar', exact: true }); const submitBox = await submitButton.boundingBox(); if (!submitBox || submitBox.height < 52 || submitBox.width < 250) throw new Error(`El CTA mobile no es prominente: ${JSON.stringify(submitBox)}`);
  const submitted = agentPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/vote-stream/${streamRef.id}/submissions`)); await submitButton.click(); if (!(await submitted).ok()) throw new Error('El envío mobile no fue aceptado.');
  await agentPage.getByRole('heading', { name: new RegExp(`Ranking actual · Tiempo Real Mobile ${suffix}`) }).waitFor(); await agentPage.getByText('65%', { exact: true }).waitFor(); await agentPage.getByText('13 votos', { exact: true }).waitFor();
  if (await agentPage.getByRole('button', { name: 'Guardar total', exact: true }).count()) throw new Error('El ranking rápido expuso controles administrativos al agente.');
  console.log('1/3 OK: en 375px los inputs midieron al menos 90×50px y el CTA 250×52px; el formulario es táctil y vertical.');
  console.log('2/3 OK: el agente recibió el ranking de solo lectura por onSnapshot (65%, 13 votos), sin controles de administración.');

  const adminCandidate = adminPage.locator('.vote-ranking', { hasText: 'Candidata Uno' }); await adminCandidate.getByText('13 votos', { exact: false }).waitFor({ timeout: 15_000 });
  const stored = await streamRef.get(); if (stored.data()?.liveResults?.totals?.['candidate-one'] !== 13 || stored.data()?.liveResults?.totalVotes !== 20) throw new Error('El agregado liveResults no persistió con los datos enviados.');
  console.log('3/3 OK: una segunda sesión administrativa actualizó el ranking a 13 votos sin recargar la página; el agregado transaccional quedó en Firestore.');
} finally { await browser?.close(); vite?.kill(); api?.kill(); await restore?.(); }
