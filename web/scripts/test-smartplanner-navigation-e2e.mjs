import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5192';
const apiUrl = 'http://127.0.0.1:8081';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const smartPlannerRoutes = [
  '/smartplanner/contributors', '/smartplanner/providers', '/smartplanner/invoices', '/smartplanner/contracts',
  '/smartplanner/materials', '/smartplanner/operations', '/smartplanner/crews', '/smartplanner/messages',
  '/smartplanner/war-room', '/smartplanner/promises', '/smartplanner/election-day', '/smartplanner/tickets',
  '/smartplanner/chat', '/smartplanner/staff', '/smartplanner/settings', '/smartplanner/reports'
];
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const pause = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

let vite;
let api;
let browser;
let restore;

async function waitForWeb() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(webUrl)).ok) return; } catch { /* Vite is starting. */ }
    await pause(350);
  }
  throw new Error('Vite no respondió para la navegación de SmartPlanner.');
}

async function waitForApi() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(`${apiUrl}/health`)).ok) return; } catch { /* The API is starting. */ }
    await pause(350);
  }
  throw new Error('La API temporal no respondió para la navegación de SmartPlanner.');
}

async function expectVisibleBackButtons(page, route) {
  const heroButton = page.locator('[data-back-button="hero"] .cd-back-button');
  const pageButton = page.locator('[data-back-button="page"] .cd-back-button');
  await heroButton.waitFor({ state: 'visible' }).catch(() => { throw new Error(`${route}: falta el BackButton visible dentro del Hero.`); });
  await pageButton.scrollIntoViewIfNeeded();
  await pageButton.waitFor({ state: 'visible' }).catch(() => { throw new Error(`${route}: falta el BackButton visible al final del contenido.`); });
  for (const [position, button] of [['Hero', heroButton], ['final', pageButton]]) {
    if (await button.getAttribute('href') !== '/smartplanner') throw new Error(`${route}: el BackButton de ${position} no navega a /smartplanner.`);
  }
}

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  if (!orgId) throw new Error('No se pudo resolver la organización E2E.');
  const orgRef = db.collection('organizations').doc(orgId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  restore = () => orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true });
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: false } }, { merge: true });

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8081' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForApi();
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5192'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[browser] ${message.text()}`); });
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  page.on('requestfailed', (request) => console.error(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => { if (response.status() >= 500) console.error(`[response ${response.status()}] ${response.url()}`); });
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  const profileLoaded = page.waitForResponse((response) => response.ok() && /\/api\/me$/.test(new URL(response.url()).pathname), { timeout: 60_000 });
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await profileLoaded;
  await page.goto(`${webUrl}/smartplanner`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Este addon no está habilitado en tu plan').waitFor();
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  const addonsLoaded = page.waitForResponse((response) => response.ok() && /\/api\/me$/.test(new URL(response.url()).pathname), { timeout: 60_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await addonsLoaded;
  await page.getByRole('heading', { name: 'Cuartel de campaña', exact: true }).waitFor();

  for (const route of smartPlannerRoutes) {
    await page.goto(`${webUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await expectVisibleBackButtons(page, route);
    console.log(`BackButton OK: ${route}`);
  }
  console.log(`BackButton navigation OK: ${smartPlannerRoutes.length}/${smartPlannerRoutes.length} rutas internas tienen controles arriba y abajo.`);

  await page.goto(`${webUrl}/smartplanner/tickets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-back-button="hero"] .cd-back-button').click();
  await page.waitForURL(`${webUrl}/smartplanner`);
  await page.goto(`${webUrl}/smartplanner/tickets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-back-button="page"] .cd-back-button').click();
  await page.waitForURL(`${webUrl}/smartplanner`);
  console.log('Navegación real OK: BackButton superior e inferior vuelven a /smartplanner.');

  await page.getByLabel(/Rol de /).first().click();
  const layering = await page.evaluate(() => {
    const dropdown = document.querySelector('.cd-select-dropdown.is-open');
    const menu = dropdown?.querySelector('.dropdown-menu.show');
    if (!dropdown || !menu) return null;
    const box = menu.getBoundingClientRect();
    const point = document.elementFromPoint(box.left + Math.min(16, box.width / 2), box.top + Math.min(16, box.height / 2));
    return {
      wrapperZIndex: Number.parseInt(getComputedStyle(dropdown).zIndex, 10),
      menuZIndex: Number.parseInt(getComputedStyle(menu).zIndex, 10),
      topElementIsMenu: Boolean(point?.closest('.dropdown-menu'))
    };
  });
  if (!layering || layering.wrapperZIndex < 1000 || layering.menuZIndex < 1000 || !layering.topElementIsMenu) throw new Error(`El SelectControl de Roles quedó detrás de su card: ${JSON.stringify(layering)}.`);
  console.log(`SelectControl Roles OK: menú por encima de la card (wrapper=${layering.wrapperZIndex}, menú=${layering.menuZIndex}).`);
} finally {
  await browser?.close();
  await restore?.();
  vite?.kill();
  api?.kill();
}
