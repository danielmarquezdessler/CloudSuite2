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
const sourceName = `Origen plantilla E2E ${suffix}`;
const templateName = `Plantilla E2E ${suffix}`;
const targetName = `Campaña desde plantilla ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  console.log('E2E plantillas: login Firebase real');
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
  const source = (await db.collection('organizations').doc(orgId).collection('campaigns').get()).docs[0];
  if (!source) throw new Error('No existe una campaña fuente para crear la plantilla.');
  await Promise.all([
    source.ref.update({ nombre: sourceName }),
    source.ref.collection('teams').doc(`team-${suffix}`).set({ name: `Equipo plantilla ${suffix}`, description: 'Estructura reutilizable', leaderId: owner.uid, deleted: false, createdAt: new Date() }),
    source.ref.collection('functions').doc(`function-${suffix}`).set({ name: `Función plantilla ${suffix}`, description: 'Estructura reutilizable', color: '#D6008C', deleted: false, createdAt: new Date() }),
    source.ref.collection('questionSets').doc(`questions-${suffix}`).set({ name: `Preguntas plantilla ${suffix}`, active: true, questions: [{ id: 'q1', text: 'Pregunta reutilizable', type: 'text' }], createdAt: new Date() })
  ]);

  await page.goto(`${app}/organization/campaigns`);
  const sourceRow = page.locator('tr', { hasText: sourceName });
  await sourceRow.getByRole('button', { name: 'Guardar plantilla', exact: true }).click();
  await page.locator('#campaign-template-name').fill(templateName);
  const saveResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/campaign-templates$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar plantilla', exact: true }).last().click();
  const template = await (await saveResponse).json();
  const storedTemplate = await db.collection('organizations').doc(orgId).collection('campaignTemplates').doc(template.id).get();
  if (!storedTemplate.exists || !storedTemplate.data()?.functions?.length || !storedTemplate.data()?.teams?.length || !storedTemplate.data()?.questionSets?.length) throw new Error('Firestore no guardó la estructura completa en la plantilla.');

  await page.getByRole('button', { name: 'Plantillas', exact: true }).click();
  await page.getByText(templateName, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Campañas', exact: true }).click();
  await page.getByRole('button', { name: 'Crear nueva campaña', exact: true }).first().click();
  await page.locator('#campaign-name').fill(targetName);
  await page.locator('#campaign-template').click();
  await page.locator('.cd-select-dropdown__menu').getByRole('button', { name: templateName, exact: true }).click();
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/campaigns$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  const created = await (await createResponse).json();
  const target = db.collection('organizations').doc(orgId).collection('campaigns').doc(created.id);
  const [teams, functions, questions, voters, visits] = await Promise.all([target.collection('teams').get(), target.collection('functions').get(), target.collection('questionSets').get(), target.collection('voters').get(), target.collection('visits').get()]);
  if (teams.empty || functions.empty || questions.empty) throw new Error(`La campaña creada desde plantilla no recibió estructura: equipos=${teams.size}, funciones=${functions.size}, preguntas=${questions.size}.`);
  if (!voters.empty || !visits.empty) throw new Error('Una plantilla trasladó electores o visitas, lo cual no está permitido.');

  await page.getByRole('button', { name: 'Plantillas', exact: true }).click();
  const templateRow = page.locator('tr', { hasText: templateName });
  await templateRow.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const deleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith(`/campaign-templates/${template.id}`) && response.ok());
  await page.getByRole('button', { name: 'Eliminar plantilla', exact: true }).click();
  await deleteResponse;
  if ((await storedTemplate.ref.get()).exists) throw new Error('La plantilla eliminada todavía existe en Firestore.');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'campaign-templates-e2e-real.png'), fullPage: true });
  console.log(`Plantillas E2E real OK: guardada ${templateName}, aplicada a ${targetName}, estructura real copiada sin electores/visitas y eliminada.`);
} finally {
  await browser.close();
}
