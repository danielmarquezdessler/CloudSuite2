import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const url = 'http://127.0.0.1:5211';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));

async function waitForVite() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Vite is booting. */ }
    await pause(250);
  }
  throw new Error('Vite no respondió para el E2E de scroll.');
}

async function scrollToFooter(page) {
  // Let the previous route's post-layout reset finish before reproducing a
  // user who has deliberately reached the footer.
  await pause(1_200);
  await page.mouse.wheel(0, 10_000);
  let prior = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await pause(100);
    const top = await page.evaluate(() => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, ...[...document.querySelectorAll('.pc-container, .pc-content, main')].map((target) => target.scrollTop)));
    if (top > 100 && Math.abs(top - prior) < 1) return;
    prior = top;
  }
  throw new Error(`La vista de origen no llegó a una posición de scroll estable y verificable (${prior}px).`);
}

async function assertAtTop(page, label) {
  const top = await page.evaluate(() => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop, ...[...document.querySelectorAll('.pc-container, .pc-content, main')].map((target) => target.scrollTop)));
  // Mobile Chromium keeps a transient sticky-header offset after navigation;
  // anything beyond that first viewport edge is a stale page position.
  if (top > 120) throw new Error(`${label}: la ruta nueva quedó en scrollTop=${top}, no en el inicio.`);
}

async function navigateFromScrolledPage(page, target, heading, label) {
  await scrollToFooter(page);
  await target.click({ force: true });
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await pause(1_100);
  await assertAtTop(page, label);
}

async function navigateByHistory(page, path, heading, label) {
  await scrollToFooter(page);
  await page.evaluate((nextPath) => { window.history.pushState({}, '', nextPath); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  await pause(1_100);
  await assertAtTop(page, label);
}

let vite; let browser; let restore;
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import(pathToFileURL(resolve(rootDir, 'server', 'dist', 'config', 'firebase.js')).href);
  const user = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(user.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  if (!orgId) throw new Error('No se pudo resolver la organización E2E para el scroll.');
  const orgRef = db.collection('organizations').doc(orgId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  restore = async () => orgRef.set({ enabledAddons: originalAddons ?? {} }, { merge: true });
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), finance: true, smartPlanner: true } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5211'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: 'http://127.0.0.1:8080' }, stdio: 'ignore' });
  await waitForVite();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });

  for (const viewport of [{ width: 1440, height: 900, label: 'desktop' }, { width: 375, height: 844, label: 'mobile' }]) {
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(30_000);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const me = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/me' && response.status() === 200);
    await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL(/dashboard/);
    await me;

    await page.goto(`${url}/treo`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Treo', exact: true }).waitFor();
    await page.getByText('Treo no está habilitado', { exact: true }).waitFor({ state: 'hidden' });
    await navigateFromScrolledPage(page, page.getByRole('button', { name: 'Nueva partida', exact: true }), 'Nueva partida presupuestaria', `${viewport.label} Treo → Nueva partida`);

    await page.goto(`${url}/treo`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Treo', exact: true }).waitFor();
    await navigateByHistory(page, '/electoral-conversion/voters', 'Electores', `${viewport.label} Treo → Electores`);

    await page.goto(`${url}/treo`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Treo', exact: true }).waitFor();
    await navigateByHistory(page, '/planning/calendar', 'Calendario Electoral', `${viewport.label} Treo → Calendario`);

    await page.goto(`${url}/treo`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Treo', exact: true }).waitFor();
    await navigateByHistory(page, '/smartplanner', 'SmartPlanner', `${viewport.label} Treo → SmartPlanner`);
    await page.close();
    console.log(`${viewport.label} OK: Treo, Electores, Calendario y SmartPlanner reinician el scroll al navegar.`);
  }
  console.log('SCROLL-TO-TOP E2E OK: navegación SPA global verificada en desktop y mobile.');
} finally {
  await browser?.close(); vite?.kill(); await restore?.();
}
