import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const suffix = Date.now().toString(36);
const secondCampaignName = `Campaña secundaria ${suffix}`;
const firstVoter = `Elector campaña inicial ${suffix}`;
const secondVoter = `Elector campaña secundaria ${suffix}`;
const firstFunction = `Función inicial ${suffix}`;
const secondFunction = `Función secundaria ${suffix}`;
const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const envFile = new URL('../.env.test', import.meta.url);
const testEnv = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(25_000);

async function openSelector() {
  const trigger = page.getByRole('button', { name: /Cambiar campaña activa:/ });
  await trigger.waitFor({ state: 'visible' });
  await trigger.click();
  const modal = page.getByRole('dialog', { name: 'Campaña activa' });
  await modal.waitFor({ state: 'visible' });
  return modal;
}

async function selectCampaign(name) {
  const modal = await openSelector();
  await modal.locator('button.list-group-item', { hasText: name }).click();
  await modal.waitFor({ state: 'hidden' });
}

try {
  console.log('1/7 Iniciando sesión Firebase real con el usuario E2E persistente…');
  await page.goto(`${appUrl}/`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  console.log('  Login cargado; completando credenciales…');
  await page.getByLabel('Email').fill(testEnv.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(testEnv.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  const loginOutcome = await Promise.race([
    page.waitForURL(/dashboard/, { timeout: 7_500 }).then(() => 'dashboard'),
    page.getByRole('alert').waitFor({ timeout: 7_500 }).then(() => 'error')
  ]);
  if (loginOutcome === 'error') throw new Error(`El login real falló: ${(await page.getByRole('alert').textContent())?.trim() ?? 'sin mensaje'}`);

  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(testEnv.E2E_EMAIL);
  const userProfile = await db.collection('users').doc(owner.uid).get();
  const orgId = userProfile.data()?.orgIds?.[0];
  if (typeof orgId !== 'string') throw new Error('El usuario E2E no tiene una organización.');
  const campaignsSnapshot = await db.collection('organizations').doc(orgId).collection('campaigns').orderBy('createdAt', 'asc').get();
  const firstCampaign = campaignsSnapshot.docs[0];
  if (!firstCampaign) throw new Error('El usuario E2E no tiene una campaña para usar como base.');
  const firstCampaignName = String(firstCampaign.data().nombre);
  await page.getByRole('button', { name: /Cambiar campaña activa:/ }).waitFor();
  await selectCampaign(firstCampaignName);

  console.log('2/7 Sembrando datos aislados de la campaña base…');
  await Promise.all([
    firstCampaign.ref.collection('voters').doc(`e2e-first-voter-${suffix}`).set({ name: firstVoter, address: 'Córdoba, Argentina', state: 'unvisited', createdAt: new Date() }),
    firstCampaign.ref.collection('functions').doc(`e2e-first-function-${suffix}`).set({ name: firstFunction, description: 'Dato aislado para E2E', color: '#0060F0', active: true, deleted: false, createdAt: new Date() })
  ]);
  await page.goto(`${appUrl}/electoral-conversion/voters`);
  await page.getByText(firstVoter, { exact: true }).waitFor();

  console.log('3/7 Creando una segunda campaña desde el selector…');
  const creationModal = await openSelector();
  await creationModal.getByText('Nueva campaña', { exact: true }).click();
  const creationResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/organizations\/[^/]+\/campaigns$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await creationModal.locator('#navbar-campaign-name').fill(secondCampaignName);
  await creationModal.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  const created = await (await creationResponse).json();
  if (!created?.id || created.nombre !== secondCampaignName) throw new Error(`La creación desde el selector devolvió un resultado inválido: ${JSON.stringify(created)}`);
  await page.getByRole('button', { name: `Cambiar campaña activa: ${secondCampaignName}`, exact: true }).waitFor();

  const secondCampaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(created.id);
  await Promise.all([
    secondCampaign.collection('voters').doc(`e2e-second-voter-${suffix}`).set({ name: secondVoter, address: 'Rosario, Argentina', state: 'unvisited', createdAt: new Date() }),
    secondCampaign.collection('functions').doc(`e2e-second-function-${suffix}`).set({ name: secondFunction, description: 'Dato aislado para E2E', color: '#D6008C', active: true, deleted: false, createdAt: new Date() })
  ]);

  console.log('4/7 Verificando filtrado real de Electores…');
  await page.goto(`${appUrl}/electoral-conversion/voters`);
  await page.getByText(secondVoter, { exact: true }).waitFor();
  if (await page.getByText(firstVoter, { exact: true }).count()) throw new Error('Electores de la campaña base aparecen después de cambiar de campaña.');

  console.log('5/7 Verificando filtrado real de Funciones…');
  await page.goto(`${appUrl}/organization/functions`);
  await page.getByText(secondFunction, { exact: true }).waitFor();
  if (await page.getByText(firstFunction, { exact: true }).count()) throw new Error('Funciones de la campaña base aparecen en la campaña secundaria.');

  console.log('6/7 Volviendo a la campaña base y comprobando ambas páginas…');
  await selectCampaign(firstCampaignName);
  await page.getByText(firstFunction, { exact: true }).waitFor();
  await page.goto(`${appUrl}/electoral-conversion/voters`);
  await page.getByText(firstVoter, { exact: true }).waitFor();

  console.log('7/7 Verificando persistencia tras recarga y capturando el selector…');
  await selectCampaign(secondCampaignName);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: `Cambiar campaña activa: ${secondCampaignName}`, exact: true }).waitFor();
  await page.goto(`${appUrl}/organization/functions`);
  await page.getByText(secondFunction, { exact: true }).waitFor();
  await mkdir(screenshotsDir, { recursive: true });
  const finalModal = await openSelector();
  await finalModal.getByText(secondCampaignName, { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshotsDir, 'active-campaign-e2e-real.png'), fullPage: true });
  console.log(`Active campaign E2E real OK: ${testEnv.E2E_EMAIL}; selector creó “${secondCampaignName}”, alternó datos aislados en Electores y Funciones, y persistió tras refresh.`);
} finally {
  await browser.close();
}
