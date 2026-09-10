import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const baseUrl = (process.env.E2E_PRODUCTION_URL ?? 'https://app.politicfy.com').replace(/\/$/, '');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

async function waitForDashboard(page) {
  const outcome = await Promise.race([
    page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 20_000 }).then(() => 'dashboard'),
    page.getByRole('alert').waitFor({ timeout: 20_000 }).then(() => 'error')
  ]);
  if (outcome === 'error') throw new Error((await page.getByRole('alert').textContent())?.trim() || 'El login mostró un error sin texto.');
}

let browser;
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) throw new Error('Faltan E2E_EMAIL o E2E_PASSWORD en web/.env.test.');
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20_000);
  page.on('requestfailed', (request) => console.log(`Request fallida: ${request.url()} :: ${request.failure()?.errorText ?? 'sin detalle'}`));

  console.log(`Abriendo producción: ${baseUrl}`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-e2e');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('alert').getByText('El email o la contraseña no son correctos.', { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'production-login-error.png'), fullPage: false });
  console.log('Login inválido mostró el mensaje amigable en español.');
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await waitForDashboard(page);

  const meResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/me' && response.status() === 200, { timeout: 20_000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
  const meResponse = await meResponsePromise;
  const me = await meResponse.json();
  if (!me.organization?.id || !me.campaigns?.length) throw new Error('La API de producción no devolvió organización y campañas para la sesión Firebase real.');
  console.log(`Login Firebase y GET /api/me reales OK: org=${me.organization.id}, campañas=${me.campaigns.length}.`);

  const functionName = `Función Producción ${Date.now().toString(36)}`;
  const functionsReady = page.waitForResponse((response) => response.request().method() === 'GET' && /\/campaigns\/[^/]+\/functions$/.test(new URL(response.url()).pathname) && response.status() === 200, { timeout: 20_000 });
  await page.goto(`${baseUrl}/organization/functions`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await functionsReady;
  await page.getByRole('button', { name: 'Crear nueva función', exact: true }).first().click();
  await page.getByLabel('Nombre').fill(functionName);
  await page.getByLabel('Descripción').fill('Dato verificable creado por la prueba E2E de producción.');
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/functions') && response.status() === 201, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await createResponse;
  await page.getByText(functionName, { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByText(functionName, { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'production-e2e.png'), fullPage: false });
  console.log(`Función creada y recargada desde Firestore: ${functionName}.`);
  console.log('E2E de producción OK sin mocks ni interceptación HTTP.');
} finally {
  await browser?.close();
}
