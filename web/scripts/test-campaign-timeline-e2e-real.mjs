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
const campaignName = `Cronología E2E ${suffix}`;
const candidateName = `Candidato cronología ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(12_000);

try {
  console.log('E2E historial: login Firebase real');
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  console.log('E2E historial: creando campaña real y verificando su evento de creación');
  await page.goto(`${app}/organization/campaigns`);
  await page.locator('.cd-data-table tbody tr').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Crear nueva campaña', exact: true }).first().click();
  await page.locator('#campaign-name').fill(campaignName);
  const createdResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/campaigns$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  const creation = await createdResponse;
  if (!creation.ok()) throw new Error(`La creación de campaña falló: HTTP ${creation.status()} ${await creation.text()}`);
  const created = await creation.json();
  if (!created?.id) throw new Error(`La creación de campaña devolvió datos inválidos: ${JSON.stringify(created)}`);
  await page.getByRole('button', { name: `Cambiar campaña activa: ${campaignName}`, exact: true }).waitFor();

  console.log('E2E historial: creando y marcando candidato Principal mediante UI real');
  await page.goto(`${app}/organization/candidates`);
  await page.getByRole('heading', { name: 'Candidatos', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Agregar candidato', exact: true }).first().click();
  await page.locator('#candidate-name').fill(candidateName);
  await page.locator('#candidate-type').click();
  await page.locator('.cd-select-dropdown__menu').getByRole('button', { name: 'Intendente', exact: true }).click();
  const candidateResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/candidates$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar candidato', exact: true }).click();
  const candidate = await (await candidateResponse).json();
  const candidateRow = page.locator('tr', { hasText: candidateName });
  const principalResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/candidates/${candidate.id}/set-principal`));
  await candidateRow.getByRole('button', { name: 'Marcar como Principal', exact: true }).click();
  const principal = await principalResponse;
  if (!principal.ok()) throw new Error(`Marcar candidato Principal falló: HTTP ${principal.status()} ${await principal.text()}`);

  console.log('E2E historial: generando 100 visitas reales de datos para los hitos calculados');
  const { db } = await import('../../server/dist/config/firebase.js');
  const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  const orgId = profile.docs[0]?.data().orgIds?.[0];
  if (typeof orgId !== 'string') throw new Error('No se encontró la organización del usuario E2E.');
  const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(created.id);
  const batch = db.batch();
  for (let index = 0; index < 100; index += 1) {
    const voter = campaign.collection('voters').doc(`timeline-voter-${suffix}-${index}`);
    const visit = campaign.collection('visits').doc(`timeline-visit-${suffix}-${index}`);
    batch.set(voter, { name: `Elector cronología ${index}`, state: 'converted_yes', createdAt: new Date(), visitedAt: new Date() });
    batch.set(visit, { voterId: voter.id, visitUid: profile.docs[0].id, startedAt: new Date(), completedAt: new Date(), state: 'completed', conversion: { decision: 'yes' } });
  }
  await batch.commit();

  await page.goto(`${app}/organization/campaigns`);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByText('Campaña creada', { exact: true }).waitFor();
  await page.getByText(`Candidato principal: ${candidateName}`, { exact: true }).waitFor();
  await page.getByText('100 visitas registradas', { exact: true }).waitFor();
  await page.getByText('50% de cobertura alcanzada', { exact: true }).waitFor();
  const auditActions = await campaign.collection('auditLog').where('action', 'in', ['CAMPAIGN_CREATED', 'SET_PRINCIPAL_CANDIDATE']).get();
  if (auditActions.size < 2) throw new Error(`Faltan eventos persistentes de auditoría: se encontraron ${auditActions.size}.`);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'campaign-timeline-e2e-real.png'), fullPage: true });
  console.log(`Historial E2E real OK: creación, Principal ${candidateName}, 100 visitas y 50% cobertura visibles en orden cronológico.`);
} finally {
  await browser.close();
}
