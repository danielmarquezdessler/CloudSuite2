import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5196';
const apiUrl = 'http://127.0.0.1:8083';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

let api;
let vite;
let browser;

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Startup is in progress. */ }
    await pause(300);
  }
  throw new Error(`${label} no respondió.`);
}

async function assertTransition(page, route) {
  await page.goto(`${webUrl}${route}`, { waitUntil: 'domcontentloaded' });
  const bar = page.locator('[data-global-loading-bar]');
  await bar.waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('[data-global-loading-bar]')?.getAttribute('data-loading-state') !== 'idle');
  const appearance = await bar.evaluate((element) => {
    const barStyle = getComputedStyle(element);
    const fillStyle = getComputedStyle(element.querySelector('span'));
    const box = element.getBoundingClientRect();
    return { height: Math.round(box.height), color: fillStyle.backgroundColor, zIndex: Number.parseInt(barStyle.zIndex, 10) };
  });
  if (appearance.height !== 3 || appearance.color !== 'rgb(0, 96, 240)' || appearance.zIndex !== 100) {
    throw new Error(`${route}: estilo inválido de la barra ${JSON.stringify(appearance)}.`);
  }
  await page.waitForFunction(() => document.querySelector('[data-global-loading-bar]')?.getAttribute('data-loading-state') === 'idle');
  if ((await page.locator('body').innerText()).includes('Cargando sesión')) throw new Error(`${route}: sigue visible el loader de sesión en texto.`);
  console.log(`Transición OK: ${route}`);
}

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8083' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(`${apiUrl}/health`, 'La API E2E');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5196'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(webUrl, 'Vite E2E');

  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  for (const route of ['/dashboard', '/organization/functions', '/electoral-conversion/voters', '/smartplanner/backlog']) await assertTransition(page, route);

  await page.getByLabel('Tema').click();
  await page.getByText('Modo oscuro', { exact: true }).click();
  await assertTransition(page, '/dashboard');
  const darkColor = await page.locator('[data-global-loading-bar] span').evaluate((element) => getComputedStyle(element).backgroundColor);
  if (darkColor !== 'rgb(0, 96, 240)') throw new Error(`Modo oscuro: color de barra incorrecto (${darkColor}).`);
  await page.getByLabel('Tema').click();
  await page.getByText('Modo claro', { exact: true }).click();
  console.log('Modo claro y oscuro OK: barra visible con el color de marca.');
  console.log('Global loading bar E2E OK: 4 transiciones reales, sin loader de sesión en texto.');
} finally {
  await browser?.close();
  vite?.kill();
  api?.kill();
}
