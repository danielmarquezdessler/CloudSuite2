import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const voterFixture = fileURLToPath(new URL('./fixtures/execution-voter.csv', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

async function createCampaign(name) {
  await page.getByRole('button', { name: 'Crear nueva campaña', exact: true }).first().click();
  await page.locator('#campaign-name').fill(name);
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && /\/api\/organizations\/[^/]+\/campaigns$/.test(new URL(candidate.url()).pathname));
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  const result = await response;
  if (!result.ok()) throw new Error(`Crear “${name}” falló: HTTP ${result.status()} ${await result.text()}`);
  await page.goto(`${app}/organization/campaigns`);
  await page.getByText(name, { exact: true }).waitFor();
}

async function selectActiveCampaign(name) {
  await page.getByRole('button', { name: /Cambiar campaña activa:/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Campaña activa' });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

try {
  console.log('E2E comparador: login Firebase real');
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  const { db } = await import('../../server/dist/config/firebase.js');
  const userSnap = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  const orgId = userSnap.docs[0]?.data().orgIds?.[0];
  const candidates = await db.collection('organizations').doc(orgId).collection('campaigns').get();
  const measured = await Promise.all(candidates.docs.map(async (item) => ({ item, voters: (await item.ref.collection('voters').get()).size })));
  const first = measured.find(({ voters }) => voters > 0);
  const second = measured.find(({ voters, item }) => voters === 0 && item.id !== first?.item.id);
  if (!first || !second) throw new Error(`No hay dos campañas reales con conteos distintos para comparar: ${JSON.stringify(measured.map(({ item, voters }) => ({ id: item.id, voters })))}.`);
  const campaignA = String(first.item.data().nombre);
  const campaignB = String(second.item.data().nombre);
  console.log(`E2E comparador: Firestore confirma ${campaignA}=${first.voters} elector(es), ${campaignB}=${second.voters}`);
  await page.goto(`${app}/organization/campaigns`);
  await page.getByRole('button', { name: 'Comparar campañas', exact: true }).click();
  await page.getByLabel(`Comparar ${campaignA}`).check();
  await page.getByLabel(`Comparar ${campaignB}`).check();
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  await page.getByRole('heading', { name: 'Resultados comparados', exact: true }).waitFor();
  const resultTable = page.locator('.cd-data-table').last();
  const tableText = await resultTable.textContent();
  if (!tableText?.includes(campaignA) || !tableText.includes(campaignB) || !tableText.includes('Electores')) throw new Error(`El resultado visual no muestra ambas campañas: ${tableText}`);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'campaign-compare-e2e-real.png'), fullPage: true });
  console.log('Comparador E2E real OK: dos campañas aisladas, números distintos en Firestore y columnas reales en pantalla.');
} finally {
  await browser.close();
}
