import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const host = '127.0.0.1';
const apiUrl = 'http://127.0.0.1:8080';
const webUrl = `http://${host}:5189`;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const storageKey = 'cloudsuite.sidebar.openModule';
const legacyStorageKey = 'cloudsuite.sidebar.modules';

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function waitForOutput(child, needle, label) {
  return new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} no inició dentro de 25 segundos.`)), 25_000);
    const inspect = (chunk) => { if (chunk.toString().includes(needle)) { clearTimeout(timeout); resolveReady(); } };
    child.stdout.on('data', inspect); child.stderr.on('data', inspect); child.once('error', reject);
  });
}

async function apiHealthy() {
  try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; }
}

async function waitForApi() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await apiHealthy()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('La API real no respondió en /health dentro de 25 segundos.');
}

async function waitForWeb() {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(webUrl, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch { /* Vite is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  }
  throw new Error('Vite no respondió dentro de 25 segundos.');
}

const expanded = async (page, id) => page.locator(`[data-sidebar-module="${id}"] > button`).getAttribute('aria-expanded');

let apiProcess;
let viteProcess;
let browser;
let restoreAdminVerification = null;

async function login(page, env) {
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:\?|$)/);
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible', timeout: 40_000 });
}

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD) throw new Error('Faltan E2E_EMAIL o E2E_PASSWORD en web/.env.test.');
  if (!(await apiHealthy())) {
    apiProcess = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PROJECT_ID: 'politicfy-cloudsuite' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForOutput(apiProcess, 'CloudSuite server listening', 'La API real');
    await waitForApi();
  }
  viteProcess = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', '5189'], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb();
  await mkdir(screenshots, { recursive: true });

  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(20_000);
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[browser] ${message.text()}`); });
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  await login(page, env);

  // A first visit without a saved preference must start with Organization only.
  await page.evaluate(([key, legacyKey]) => { localStorage.removeItem(key); localStorage.removeItem(legacyKey); }, [storageKey, legacyStorageKey]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible', timeout: 40_000 });
  await page.locator('[data-sidebar-module="organization"] > button').waitFor();
  for (const [id, expected] of [['organization', 'true'], ['electoral-conversion', 'false'], ['planning', 'false'], ['execution', 'false']]) {
    const value = await expanded(page, id);
    if (value !== expected) throw new Error(`Estado inicial incorrecto para ${id}: esperado ${expected}, recibido ${value}.`);
  }
  const transition = await page.locator('[data-sidebar-module="organization"] > ul').evaluate((element) => getComputedStyle(element).transitionProperty);
  if (!transition.includes('max-height')) throw new Error(`La transición del acordeón no está configurada (transition-property=${transition}).`);
  if (await page.locator('.cloudsuite-sidebar-addon__badge').getByText('Próximamente').count() !== 1) throw new Error('SmartPlanner debería mostrarse bloqueado con el badge Próximamente.');
  if (!await page.locator('.cloudsuite-sidebar-addon__button').isDisabled()) throw new Error('SmartPlanner debe quedar no navegable cuando el add-on está deshabilitado.');
  console.log('Estado inicial OK: solo Organización expandido; transición y gate de SmartPlanner verificados.');

  // On a direct Planning route, its group must expand even if no preference was saved for it.
  await page.goto(`${webUrl}/planning/calendar`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Calendario Electoral/i }).first().waitFor();
  if (await expanded(page, 'planning') !== 'true' || await expanded(page, 'organization') !== 'false') throw new Error('Planificación no se autoexpandió de forma exclusiva al entrar directamente en /planning/calendar.');
  await page.screenshot({ path: resolve(screenshots, 'sidebar-module-planning-debug.png'), fullPage: false });
  await page.locator('[data-sidebar-module="planning"] a[data-page="calendar"]').waitFor({ state: 'visible' });
  console.log('Autoexpansión por ruta activa OK: Planificación.');

  // A manual change is an accordion: opening a module must close the previous one and persist one ID only.
  await page.goto(`${webUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-sidebar-module="organization"] > button').click();
  await page.locator('[data-sidebar-module="electoral-conversion"] > button').click();
  if (await expanded(page, 'organization') !== 'false' || await expanded(page, 'electoral-conversion') !== 'true') throw new Error('No se pudo alternar el estado manual de los módulos.');
  const storedOpenModule = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  if (storedOpenModule !== '"electoral-conversion"') throw new Error(`La preferencia debería guardar un único módulo, recibió ${storedOpenModule}.`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await expanded(page, 'organization') !== 'false' || await expanded(page, 'electoral-conversion') !== 'true') throw new Error('El estado de los módulos no persistió tras recargar.');
  await page.screenshot({ path: resolve(screenshots, 'sidebar-module-groups.png'), fullPage: false });
  console.log('Persistencia localStorage OK: un único módulo restaurado tras recarga.');

  // The persistent E2E account is a Cliente. Temporarily grant only its test
  // token the existing admin role, exercise the real API/UI gate, and restore
  // both claims and the exact Firestore add-on document in finally.
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (typeof orgId !== 'string' || typeof campId !== 'string') throw new Error('No fue posible resolver la organización/campaña E2E para verificar SmartPlanner.');
  const orgRef = db.collection('organizations').doc(orgId);
  const organization = await orgRef.get();
  const originalClaims = authUser.customClaims ?? {};
  const originalEnabledAddons = organization.data()?.enabledAddons;
  restoreAdminVerification = async () => {
    await adminAuth.setCustomUserClaims(authUser.uid, originalClaims);
    if (originalEnabledAddons === undefined) await orgRef.set({ enabledAddons: { smartPlanner: false } }, { merge: true });
    else await orgRef.set({ enabledAddons: originalEnabledAddons }, { merge: true });
  };
  await adminAuth.setCustomUserClaims(authUser.uid, { ...originalClaims, role: 'admin', orgId, camps: { ...((originalClaims.camps && typeof originalClaims.camps === 'object') ? originalClaims.camps : {}), [campId]: true } });

  await browser.close();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const adminPage = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  adminPage.setDefaultTimeout(20_000);
  await login(adminPage, env);
  await adminPage.goto(`${webUrl}/system/addons`, { waitUntil: 'domcontentloaded' });
  await adminPage.getByRole('heading', { name: 'Administración de add-ons' }).waitFor();
  const enableRequest = adminPage.waitForResponse((response) => response.request().method() === 'PUT' && /\/addons\/smart-planner$/.test(new URL(response.url()).pathname) && response.status() === 200);
  await adminPage.getByRole('button', { name: 'Habilitar SmartPlanner', exact: true }).click();
  await enableRequest;
  await adminPage.locator('.cloudsuite-sidebar-addon__button').waitFor({ state: 'visible' });
  await adminPage.waitForFunction(() => {
    const button = document.querySelector('.cloudsuite-sidebar-addon__button');
    return Boolean(button && !button.disabled);
  });
  if (await adminPage.locator('.cloudsuite-sidebar-addon__button').isDisabled()) throw new Error('SmartPlanner siguió deshabilitado después de habilitar el add-on.');
  if (await adminPage.locator('.cloudsuite-sidebar-addon__badge').count()) throw new Error('El badge Próximamente siguió visible después de habilitar SmartPlanner.');
  console.log('Gate de SmartPlanner OK: administrador habilitó el add-on real y el sidebar reflejó el cambio.');
  console.log('E2E sidebar OK: estado inicial, transición, acordeón estricto, autoexpansión, persistencia y SmartPlanner bloqueado verificados sin mocks.');
} finally {
  await browser?.close();
  await restoreAdminVerification?.();
  viteProcess?.kill();
  apiProcess?.kill();
}
