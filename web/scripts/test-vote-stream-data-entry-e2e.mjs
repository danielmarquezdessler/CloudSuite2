import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const serverDir = resolve(rootDir, 'server');
const testEnvPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5213';
const apiUrl = 'http://127.0.0.1:8099';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const evidenceDir = resolve(webDir, '.screenshots/vote-stream-data-entry');
let api; let vite; let browser; let restore;

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Iniciando. */ }
    await pause(300);
  }
  throw new Error(`${label} no respondió.`);
}

async function signIn(page, email, password) {
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
}

try {
  const testEnv = parseEnv(await readFile(testEnvPath, 'utf8'));
  const { adminAuth, db, storage } = await import('../../server/dist/config/firebase.js');
  await mkdir(evidenceDir, { recursive: true });
  const admin = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const profile = await db.collection('users').doc(admin.uid).get();
  const orgId = testEnv.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = testEnv.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver el contexto E2E.');

  const suffix = Date.now().toString(36);
  const password = `Dato-${suffix}-Seguro!7`;
  const orgRef = db.collection('organizations').doc(orgId);
  const campaignRef = orgRef.collection('campaigns').doc(campId);
  const streamRef = campaignRef.collection('voteStreams').doc(`data-entry-${suffix}`);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const agent = await adminAuth.createUser({ email: `data-entry-${suffix}@cloudsuite.local`, password, displayName: 'Agente Data Entry E2E' });
  restore = async () => {
    await storage.bucket().file(`vote-streams/${streamRef.id}/candidates/candidate-one-photo`).delete({ ignoreNotFound: true });
    await campaignRef.collection('publicVoteRankings').doc(streamRef.id).delete();
    await db.recursiveDelete(streamRef).catch(() => undefined);
    await Promise.all([
      db.collection('users').doc(agent.uid).delete().catch(() => undefined),
      orgRef.collection('members').doc(agent.uid).delete().catch(() => undefined),
      campaignRef.collection('members').doc(agent.uid).delete().catch(() => undefined),
    ]);
    await adminAuth.deleteUser(agent.uid).catch(() => undefined);
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
  };
  await adminAuth.setCustomUserClaims(agent.uid, { orgId, role: 'militante', camps: { [campId]: true } });
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), voteStream: true } }, { merge: true });

  const candidateOne = streamRef.collection('candidates').doc('candidate-one');
  const candidateTwo = streamRef.collection('candidates').doc('candidate-two');
  const fixture = db.batch();
  fixture.set(db.collection('users').doc(agent.uid), { email: agent.email, displayName: agent.displayName, orgIds: [orgId], createdAt: new Date() });
  fixture.set(orgRef.collection('members').doc(agent.uid), { role: 'militante', createdAt: new Date() });
  fixture.set(campaignRef.collection('members').doc(agent.uid), { email: agent.email, displayName: agent.displayName, role: 'militante', joinedAt: new Date() });
  fixture.set(streamRef, { name: `Data Entry ${suffix}`, status: 'activa', location: 'Villa del Totoral', date: '2026-09-17', electoralSystem: 'mayoritario_uninominal', createdAt: new Date(), liveResults: { totals: { [candidateOne.id]: 5, [candidateTwo.id]: 10 }, totalVotes: 15, updatedAt: new Date() } });
  fixture.set(candidateOne, { name: 'Candidata Uno', party: 'Frente E2E', order: 1 });
  fixture.set(candidateTwo, { name: 'Candidato Dos', party: 'Partido E2E', order: 2 });
  fixture.set(streamRef.collection('submissions').doc('seed-one'), { submittedBy: admin.uid, submittedAt: new Date(), batchId: 'seed', candidateId: candidateOne.id, votes: 5 });
  fixture.set(streamRef.collection('submissions').doc('seed-two'), { submittedBy: admin.uid, submittedAt: new Date(), batchId: 'seed', candidateId: candidateTwo.id, votes: 10 });
  fixture.set(streamRef.collection('agents').doc(agent.uid), { assignedAt: new Date() });
  await fixture.commit();
  console.log('Preparado: fixture real creado.');

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8099' }, stdio: 'ignore' });
  await waitFor(`${apiUrl}/health`, 'La API temporal');
  console.log('Preparado: API temporal disponible.');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5213', '--strictPort'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' });
  vite.on('exit', (code, signal) => console.error(`Vite terminó (code=${code}, signal=${signal}).`));
  await waitFor(webUrl, 'Vite');
  console.log('Preparado: Vite disponible.');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const agentPage = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true });
  adminPage.setDefaultTimeout(60_000);
  agentPage.setDefaultTimeout(60_000);
  await signIn(adminPage, testEnv.E2E_EMAIL, testEnv.E2E_PASSWORD);
  console.log('Preparado: sesión administrativa iniciada.');
  await signIn(agentPage, agent.email, password);
  console.log('Preparado: sesión de agente iniciada.');

  await adminPage.goto(`${webUrl}/vote-stream/${streamRef.id}`);
  await adminPage.getByRole('heading', { name: `Data Entry ${suffix}`, exact: true }).waitFor();
  await adminPage.locator('[data-vote-ranking-id="candidate-two"]').getByText('10 votos', { exact: false }).waitFor();
  const firstBefore = await adminPage.locator('[data-vote-ranking-id]').first().getAttribute('data-vote-ranking-id');
  if (firstBefore !== 'candidate-two') throw new Error('El fixture no inició con Candidato Dos primero.');

  await adminPage.getByRole('button', { name: 'Abrir ranking en pantalla completa', exact: true }).click();
  await adminPage.waitForFunction(() => Boolean(document.fullscreenElement));
  const fullscreenUsage = await adminPage.locator('[data-vote-ranking-board] .cd-card').evaluate((card) => ({ cardHeight: card.getBoundingClientRect().height, viewportHeight: window.innerHeight }));
  if (fullscreenUsage.cardHeight < fullscreenUsage.viewportHeight * 0.75) throw new Error(`El ranking fullscreen solo usa ${Math.round(fullscreenUsage.cardHeight / fullscreenUsage.viewportHeight * 100)}% del alto disponible.`);
  console.log('1/4 OK: el ranking administrativo abrió pantalla completa desde la sesión autenticada.');
  await adminPage.evaluate(() => {
    window.__rankingFrames = [];
    const sample = () => {
      for (const card of document.querySelectorAll('[data-vote-ranking-id]')) {
        const transform = getComputedStyle(card).transform;
        if (transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') window.__rankingFrames.push(transform);
      }
      window.__rankingRaf = requestAnimationFrame(sample);
    };
    sample();
  });

  await agentPage.goto(`${webUrl}/vote-stream/mi-panel`);
  const activeCard = agentPage.locator('.vote-agent-stream', { hasText: `Data Entry ${suffix}` });
  await activeCard.getByRole('button', { name: 'Cargar resultados', exact: true }).click();
  await agentPage.getByLabel('Votos para Candidata Uno').fill('13');
  const submitted = agentPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/vote-stream/${streamRef.id}/submissions`));
  await agentPage.getByRole('button', { name: 'Enviar resultado', exact: true }).click();
  await agentPage.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click();
  if (!(await submitted).ok()) throw new Error('El agente no pudo enviar el dato de prueba.');
  await adminPage.locator('[data-vote-ranking-id="candidate-one"]').getByText('18 votos', { exact: false }).waitFor();
  const firstAfter = await adminPage.locator('[data-vote-ranking-id]').first().getAttribute('data-vote-ranking-id');
  if (firstAfter !== 'candidate-one') throw new Error('El ranking no reordenó el candidato que pasó al primer lugar.');
  await adminPage.waitForFunction(() => window.__rankingFrames.length > 1);
  if (!(await adminPage.evaluate(() => Boolean(document.fullscreenElement)))) throw new Error('Se perdió pantalla completa durante el envío.');
  await adminPage.waitForTimeout(500);
  await adminPage.screenshot({ path: resolve(evidenceDir, 'ranking-fullscreen.png') });
  await adminPage.evaluate(() => cancelAnimationFrame(window.__rankingRaf));
  await adminPage.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click();
  await adminPage.waitForFunction(() => !document.fullscreenElement);
  console.log('2/4 OK: una submission real reordenó el ranking en vivo y activó la animación de transición.');

  await adminPage.getByRole('button', { name: 'Editar foto de Candidata Uno', exact: true }).click();
  await adminPage.getByLabel('Foto de candidato', { exact: true }).setInputFiles(resolve(webDir, 'src/assets/images/user/avatar-1.jpg'));
  await adminPage.locator('.reactEasyCrop_Image').waitFor();
  await adminPage.getByLabel('Zoom de foto de candidato').fill('2');
  await adminPage.waitForTimeout(300);
  await adminPage.screenshot({ path: resolve(evidenceDir, 'candidate-crop.png') });
  await adminPage.getByRole('button', { name: 'Confirmar recorte', exact: true }).click();
  await adminPage.getByText('Recorte listo para subir', { exact: true }).waitFor();
  const uploaded = adminPage.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/candidates/${candidateOne.id}/assets`));
  await adminPage.getByRole('button', { name: 'Subir foto recortada', exact: true }).click();
  if (!(await uploaded).ok()) throw new Error('La foto recortada no llegó al endpoint de Storage.');
  const photoUrl = (await candidateOne.get()).data()?.photoUrl;
  if (!photoUrl || !(await fetch(photoUrl)).ok) throw new Error('La foto recortada no quedó accesible en Storage.');
  const [metadata] = await storage.bucket().file(`vote-streams/${streamRef.id}/candidates/candidate-one-photo`).getMetadata();
  if (metadata.contentType !== 'image/jpeg' || Number(metadata.size) <= 0) throw new Error('Storage no contiene la imagen JPEG recortada.');
  console.log('3/4 OK: la foto se eligió, se recortó en UI y quedó persistida y accesible en Storage.');

  await adminPage.getByRole('button', { name: 'Ver envío', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Editar envío de Candidata Uno', exact: true }).click();
  await adminPage.getByLabel('Votos corregidos para Candidata Uno').fill('20');
  const corrected = adminPage.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/submissions/`));
  await adminPage.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
  if (!(await corrected).ok()) throw new Error('La corrección administrativa no fue aceptada.');
  await adminPage.locator('[data-vote-ranking-id="candidate-one"]').getByText('25 votos', { exact: false }).waitFor();
  const storedSubmission = (await streamRef.collection('submissions').where('submittedBy', '==', agent.uid).get()).docs[0]?.data();
  if (storedSubmission?.votes !== 20 || (await streamRef.get()).data()?.liveResults?.totals?.['candidate-one'] !== 25) throw new Error('La corrección UI no recalculó el agregado en Firestore.');
  await adminPage.locator('.vote-agent-batch').screenshot({ path: resolve(evidenceDir, 'admin-correction.png') });
  console.log('4/4 OK: el administrador abrió el envío del agente, corrigió el valor desde UI y el ranking se recalculó en vivo.');
  await new Promise((resolveAudit, rejectAudit) => {
    const audit = spawn(process.execPath, [resolve(webDir, 'scripts/padding-audit.mjs')], {
      cwd: webDir,
      env: { ...process.env, E2E_WEB_URL: webUrl, PLAYWRIGHT_CHROMIUM_EXECUTABLE: chromiumPath, PADDING_AUDIT_ROUTES: `/vote-stream/${streamRef.id},/vote-stream/mi-panel` },
      stdio: 'inherit',
    });
    audit.on('error', rejectAudit);
    audit.on('exit', (code) => code === 0 ? resolveAudit() : rejectAudit(new Error(`Padding audit Vote Stream falló (${code}).`)));
  });
} finally {
  await browser?.close();
  vite?.kill();
  api?.kill();
  await restore?.();
}
