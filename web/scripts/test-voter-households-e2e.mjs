import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173'; const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'; const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36); const firstName = `Hogar E2E Uno ${suffix}`; const secondName = `Hogar E2E Dos ${suffix}`;
const browser = await chromium.launch({ headless: true, executablePath }); const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(20_000);

async function create(name) {
  await page.getByRole('button', { name: 'Crear elector', exact: true }).click(); await page.locator('#voter-name').fill(name); await page.locator('#voter-address').pressSequentially('Avenida Colón 600, Córdoba', { delay: 20 });
  const place = page.locator('.pac-container:visible .pac-item:visible').first(); await place.waitFor({ state: 'visible' }); await place.click(); await page.getByText('Dirección verificada y lista para el mapa.', { exact: true }).waitFor();
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && /\/voters$/.test(new URL(item.url()).pathname) && item.status() === 201); await page.getByRole('button', { name: 'Crear elector', exact: true }).last().click(); const body = await (await response).json(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); return body;
}
async function next() { await page.getByRole('button', { name: 'Siguiente', exact: true }).click(); }

try {
  console.log('E2E hogares: login Firebase real'); await page.goto(app); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${app}/electoral-conversion/voters`); const first = await create(firstName); await page.getByText(firstName, { exact: true }).waitFor(); const second = await create(secondName); await page.getByText(secondName, { exact: true }).waitFor();
  if (!first.householdId && !second.householdId) throw new Error(`La segunda creación no asignó householdId: ${JSON.stringify({ first, second })}`);
  await page.getByRole('button', { name: 'Agrupar por hogar', exact: true }).click(); const householdRow = page.locator('details.cs-household', { hasText: firstName }); await householdRow.waitFor(); await householdRow.getByText(secondName, { exact: true }).waitFor();
  console.log('E2E hogares: completando una visita única para el hogar'); await page.getByRole('button', { name: 'Vista individual', exact: true }).click(); await page.locator('tr', { hasText: firstName }).getByRole('button', { name: 'Visitar', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar visita para todo el hogar', exact: true }).click();
  const advance = async (nextStep) => { await next(); await page.getByText(`Paso ${nextStep} de 4`, { exact: false }).waitFor({ timeout: 25_000 }); };
  const radios = page.locator('input[type="radio"]'); const names = new Set(await radios.evaluateAll((items) => items.map((item) => item.getAttribute('name')).filter(Boolean))); for (const name of names) { const firstRadio = page.locator(`input[type="radio"][name="${name}"]`).first(); if (!(await firstRadio.isChecked())) await firstRadio.check(); }
  await advance(2);
  const textInputs = page.locator('input.form-control'); for (let index = 0; index < await textInputs.count(); index += 1) await textInputs.nth(index).fill(`Respuesta hogar 2-${index + 1}`);
  await advance(3);
  await page.locator('#visit-notes').fill('Visita única real para el hogar E2E.'); await advance(4);
  const householdComplete = page.getByRole('button', { name: 'Registrar visitas del hogar', exact: true }); if (!(await householdComplete.count())) { await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'voter-households-e2e-failure.png'), fullPage: true }); throw new Error(`No se alcanzó la decisión del hogar. Alertas: ${JSON.stringify(await page.locator('[role="alert"]').allTextContents())}`); } await householdComplete.click(); await page.waitForTimeout(1200); const alerts = await page.locator('[role="alert"]').allTextContents(); if (alerts.some((text) => /No se pudo|necesita conexión|Elegí una decisión/i.test(text))) throw new Error(`La visita de hogar falló en la UI: ${JSON.stringify(alerts)}`);
  const { db } = await import('../../server/dist/config/firebase.js'); const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get(); const orgId = profile.docs[0].data().orgIds[0]; const campId = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cloudsuite.activeCampaign.'))?.[1]); const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
  const members = await Promise.all([first.id, second.id].map((id) => campaign.collection('voters').doc(id).get())); const householdId = members[0].data()?.householdId; if (!householdId || householdId !== members[1].data()?.householdId) throw new Error('Firestore no dejó ambos electores en el mismo hogar.');
  const visits = await campaign.collection('visits').where('householdId', '==', householdId).get(); if (visits.docs.filter((item) => [first.id, second.id].includes(item.data().voterId)).length !== 2) throw new Error('Firestore no conservó una visita de hogar para cada integrante.');
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'voter-households-e2e-real.png'), fullPage: true }); console.log(`Hogares E2E real OK: ${firstName} y ${secondName}; agrupación y dos visitas persistidas.`);
} finally { await browser.close(); }
