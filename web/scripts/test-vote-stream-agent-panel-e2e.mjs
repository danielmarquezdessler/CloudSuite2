import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const serverDir = resolve(rootDir, 'server');
const testEnvPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5199';
const apiUrl = 'http://127.0.0.1:8085';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let api; let vite; let browser; let restore;

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* El proceso todavía inicia. */ }
    await pause(300);
  }
  throw new Error(`${label} no respondió.`);
}

try {
  const testEnv = parseEnv(await readFile(testEnvPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const agent = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const profile = await db.collection('users').doc(agent.uid).get();
  const orgId = testEnv.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = testEnv.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver el contexto E2E de Vote Stream.');

  const suffix = Date.now().toString(36);
  const orgRef = db.collection('organizations').doc(orgId);
  const campaignRef = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const streamIds = [`agent-panel-active-${suffix}`, `agent-panel-pending-${suffix}`, `agent-panel-closed-${suffix}`];
  restore = async () => {
    await Promise.all(streamIds.map((id) => db.recursiveDelete(campaignRef.collection('voteStreams').doc(id)).catch(() => undefined)));
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
  };
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), voteStream: true } }, { merge: true });
  const activeRef = campaignRef.collection('voteStreams').doc(streamIds[0]);
  const pendingRef = campaignRef.collection('voteStreams').doc(streamIds[1]);
  const closedRef = campaignRef.collection('voteStreams').doc(streamIds[2]);
  const fixture = db.batch();
  for (const [ref, name, status] of [[activeRef, `Panel Agente Activa ${suffix}`, 'activa'], [pendingRef, `Panel Agente Pendiente ${suffix}`, 'pendiente'], [closedRef, `Panel Agente Cerrada ${suffix}`, 'cerrada']]) {
    fixture.set(ref, { name, status, location: 'Villa del Totoral', date: '2026-09-17', electoralSystem: 'mayoritario_uninominal', createdAt: new Date() });
    fixture.set(ref.collection('agents').doc(agent.uid), { assignedAt: new Date() });
  }
  fixture.set(activeRef.collection('candidates').doc('candidate-uno'), { name: 'Candidata Uno', party: 'Frente E2E', order: 1 });
  fixture.set(activeRef.collection('candidates').doc('candidate-dos'), { name: 'Candidato Dos', party: 'Partido E2E', order: 2 });
  fixture.set(activeRef.collection('subLocations').doc('escuela-central'), { name: 'Escuela Central' });
  fixture.set(activeRef.collection('genderOptions').doc('femenino'), { name: 'Femenino' });
  fixture.set(activeRef.collection('ageRanges').doc('30-45'), { name: '30 a 45' });
  await fixture.commit();

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8085' }, stdio: 'ignore' });
  await waitFor(`${apiUrl}/health`, 'La API temporal');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5199'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' });
  await waitFor(webUrl, 'Vite');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(25_000);
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(testEnv.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(testEnv.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  const agentMenu = page.getByRole('link', { name: 'Mi panel de Sondeo', exact: true });
  await agentMenu.waitFor();
  await agentMenu.click();
  await page.getByRole('heading', { name: 'Mi panel de Sondeo', exact: true }).waitFor();
  for (const title of ['Activas', 'Pendientes', 'Cerradas']) await page.getByRole('heading', { name: title, exact: true }).waitFor();
  console.log('1/5 OK: el agente vio Vote Streams reales agrupadas en activas, pendientes y cerradas.');

  const activeCard = page.locator('.vote-agent-stream', { hasText: `Panel Agente Activa ${suffix}` });
  await activeCard.getByRole('button', { name: 'Cargar resultados', exact: true }).click();
  await page.getByRole('heading', { name: new RegExp(`Carga de datos · Panel Agente Activa ${suffix}`) }).waitFor();
  await page.getByLabel('Votos para Candidata Uno').fill('17');
  for (const [label, option] of [['Sub-ubicación', 'Escuela Central'], ['Género', 'Femenino'], ['Rango de edad', '30 a 45']]) {
    await page.getByLabel(label).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes(`/vote-stream/${activeRef.id}/submissions`));
  await page.getByRole('button', { name: 'Enviar resultado', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click();
  if (!(await response).ok()) throw new Error('La UI no pudo crear la submission del agente.');
  await page.getByText('Resultado de Candidata Uno enviado.', { exact: true }).waitFor();
  const submissions = await activeRef.collection('submissions').where('submittedBy', '==', agent.uid).get();
  if (submissions.size !== 1 || submissions.docs[0].data()?.candidateId !== 'candidate-uno' || submissions.docs[0].data()?.votes !== 17 || submissions.docs[0].data()?.subLocationId !== 'escuela-central') throw new Error('La submission UI no quedó persistida por candidato con sus segmentos.');
  console.log('2/5 OK: se enviaron resultados reales con sub-ubicación, género y edad; Firestore confirmó la persistencia.');

  await page.getByRole('heading', { name: 'Mis envíos', exact: true }).waitFor();
  await page.getByText('Candidata Uno', { exact: true }).last().waitFor();
  await page.getByText('17 votos', { exact: true }).last().waitFor();
  console.log('3/5 OK: la submission apareció en Mis envíos, con desglose de solo lectura.');

  await Promise.all(streamIds.map((id) => campaignRef.collection('voteStreams').doc(id).collection('agents').doc(agent.uid).delete()));
  await page.goto(`${webUrl}/dashboard`);
  await page.waitForTimeout(900);
  if (await page.getByRole('link', { name: 'Mi panel de Sondeo', exact: true }).count()) throw new Error('El menú sigue mostrando Mi panel de Sondeo para un usuario sin asignaciones.');
  console.log('4/5 OK: al quitar todas las asignaciones del agente, la opción ya no apareció en el menú.');
  console.log('5/5 pendiente de padding-audit, ejecutado por el comando de verificación del brief.');
} finally {
  await browser?.close();
  vite?.kill();
  api?.kill();
  await restore?.();
}
