import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36);
const sourceName = `Origen clonado E2E ${suffix}`;
const cloneName = `${sourceName} (copia)`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  console.log('E2E clonación: login Firebase real');
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(owner.uid).get();
  const orgId = profile.data()?.orgIds?.[0];
  if (typeof orgId !== 'string') throw new Error('El usuario E2E no tiene una organización disponible.');
  const campaigns = await db.collection('organizations').doc(orgId).collection('campaigns').get();
  const source = campaigns.docs.find((item) => String(item.data().nombre) === sourceName) ?? campaigns.docs[0];
  if (!source) throw new Error('No existe una campaña fuente para la clonación.');

  console.log('E2E clonación: sembrando estructura real en Firestore para la campaña fuente');
  await Promise.all([
    source.ref.update({ nombre: sourceName }),
    source.ref.collection('teams').doc(`team-${suffix}`).set({ name: `Equipo ${suffix}`, description: 'Equipo de origen', leaderId: owner.uid, deleted: false, createdAt: new Date() }),
    source.ref.collection('teams').doc(`team-${suffix}`).collection('members').doc(owner.uid).set({ uid: owner.uid, role: 'cliente' }),
    source.ref.collection('functions').doc(`function-${suffix}`).set({ name: `Función ${suffix}`, description: 'Función de origen', color: '#0060F0', deleted: false, createdAt: new Date() }),
    source.ref.collection('questionSets').doc(`questions-${suffix}`).set({ name: `Preguntas ${suffix}`, active: true, questions: [{ id: 'q1', text: '¿Pregunta de prueba?', type: 'text' }], createdAt: new Date() }),
    source.ref.collection('candidates').doc(`candidate-${suffix}`).set({ name: `Candidato ${suffix}`, type: 'Intendente', party: 'Partido E2E', isPrincipal: true, createdAt: new Date() }),
    source.ref.collection('voters').doc(`voter-${suffix}`).set({ name: `Elector que no debe copiarse ${suffix}`, state: 'unvisited', createdAt: new Date() }),
    source.ref.collection('visits').doc(`visit-${suffix}`).set({ voterId: `voter-${suffix}`, completedAt: new Date() })
  ]);

  await page.goto(`${app}/organization/campaigns`);
  await page.getByRole('heading', { name: 'Gestión de Campañas', exact: true }).waitFor();
  const sourceRow = page.locator('tr', { hasText: sourceName });
  await sourceRow.getByRole('button', { name: 'Duplicar', exact: true }).click();
  await page.locator('#campaign-clone-name').fill(cloneName);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/campaigns/${source.id}/clone`) && response.status() === 201);
  await page.getByRole('button', { name: 'Duplicar campaña', exact: true }).click();
  const response = await responsePromise;
  const created = await response.json();
  if (!created?.id || created.nombre !== cloneName) throw new Error(`La clonación respondió datos inválidos: ${JSON.stringify(created)}`);
  await page.waitForURL(/dashboard/);
  await page.getByRole('button', { name: `Cambiar campaña activa: ${cloneName}`, exact: true }).waitFor();

  const target = db.collection('organizations').doc(orgId).collection('campaigns').doc(created.id);
  const [targetDoc, teams, functions, questions, candidates, voters, visits] = await Promise.all([
    target.get(), target.collection('teams').get(), target.collection('functions').get(), target.collection('questionSets').get(), target.collection('candidates').get(), target.collection('voters').get(), target.collection('visits').get()
  ]);
  if (!targetDoc.exists) throw new Error('La campaña clonada no existe en Firestore.');
  if (teams.empty || functions.empty || questions.empty || candidates.empty) throw new Error(`La estructura no se copió completa: equipos=${teams.size}, funciones=${functions.size}, preguntas=${questions.size}, candidatos=${candidates.size}.`);
  if (!voters.empty || !visits.empty) throw new Error(`La clonación copió datos prohibidos: electores=${voters.size}, visitas=${visits.size}.`);
  const clonedTeam = teams.docs[0];
  if (clonedTeam.data().leaderId !== null || !(await clonedTeam.ref.collection('members').get()).empty) throw new Error('El equipo clonado conservó líder o miembros, cuando debía iniciar vacío.');
  if (candidates.docs.some((item) => item.data().isPrincipal === true)) throw new Error('La clonación conservó un candidato Principal.');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'campaign-clone-e2e-real.png'), fullPage: true });
  console.log(`Clonación E2E real OK: ${sourceName} -> ${cloneName}; estructura copiada, equipos sin miembros/líder, candidatos sin Principal y 0 electores/0 visitas.`);
} finally {
  await browser.close();
}
