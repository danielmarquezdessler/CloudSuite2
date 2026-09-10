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
const storageKey = 'cloudsuite.sidebar.modules';

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
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:\?|$)/);
  // URL navigation happens before Firebase finishes restoring the authenticated layout.
  // Wait for the real post-login shell before exercising a page refresh.
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible', timeout: 40_000 });

  // A first visit without the saved preference must start with Organization only.
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible', timeout: 40_000 });
  await page.locator('[data-sidebar-module="organization"] > button').waitFor();
  for (const [id, expected] of [['organization', 'true'], ['electoral-conversion', 'false'], ['planning', 'false'], ['execution', 'false']]) {
    const value = await expanded(page, id);
    if (value !== expected) throw new Error(`Estado inicial incorrecto para ${id}: esperado ${expected}, recibido ${value}.`);
  }
  console.log('Estado inicial OK: solo Organización expandido.');

  // On a direct Planning route, its group must expand even if no preference was saved for it.
  await page.goto(`${webUrl}/planning/calendar`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Calendario Electoral/i }).first().waitFor();
  if (await expanded(page, 'planning') !== 'true') throw new Error('Planificación no se autoexpandió al entrar directamente en /planning/calendar.');
  await page.screenshot({ path: resolve(screenshots, 'sidebar-module-planning-debug.png'), fullPage: false });
  await page.locator('[data-sidebar-module="planning"] a[data-page="calendar"]').waitFor({ state: 'visible' });
  console.log('Autoexpansión por ruta activa OK: Planificación.');

  // Persist an independent user choice while on Dashboard, where none of these modules is active.
  await page.goto(`${webUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-sidebar-module="organization"] > button').click();
  await page.locator('[data-sidebar-module="electoral-conversion"] > button').click();
  if (await expanded(page, 'organization') !== 'false' || await expanded(page, 'electoral-conversion') !== 'true') throw new Error('No se pudo alternar el estado manual de los módulos.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (await expanded(page, 'organization') !== 'false' || await expanded(page, 'electoral-conversion') !== 'true') throw new Error('El estado de los módulos no persistió tras recargar.');
  await page.screenshot({ path: resolve(screenshots, 'sidebar-module-groups.png'), fullPage: false });
  console.log('Persistencia localStorage OK: estado restaurado tras recarga.');
  console.log('E2E sidebar OK: estado inicial, autoexpansión y persistencia verificados sin mocks.');
} finally {
  await browser?.close();
  viteProcess?.kill();
  apiProcess?.kill();
}
