import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const apiUrl = 'http://127.0.0.1:8081';
const webUrl = 'http://127.0.0.1:5194';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const pause = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

let api;
let vite;
let browser;
let restore;

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Process is starting. */ }
    await pause(350);
  }
  throw new Error(`${label} no respondió.`);
}

async function verifyExternalAddon(page, href) {
  const sourceUrl = page.url();
  const link = page.locator(`a[href="${href}"]`);
  if (await link.getAttribute('target') !== '_blank' || await link.getAttribute('rel') !== 'noopener noreferrer') throw new Error(`${href}: el enlace externo no está protegido para abrir en otra pestaña.`);
  const popupPromise = page.context().waitForEvent('page');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  if (page.url() !== sourceUrl) throw new Error(`${href}: el launcher reemplazó la pestaña de CloudSuite.`);
  await popup.close();
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
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8081' }, stdio: 'ignore' });
  await waitFor(`${apiUrl}/health`, 'La API temporal');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5194'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' });
  await waitFor(webUrl, 'Vite');

  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  const profileLoaded = page.waitForResponse((response) => response.ok() && new URL(response.url()).pathname === '/api/me', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  const profileResponse = await profileLoaded;
  const profileData = await profileResponse.json();
  if (profileData.organization?.id !== orgId || profileData.organization?.enabledAddons?.smartPlanner !== true) throw new Error(`La sesión E2E no recibió SmartPlanner habilitado: ${JSON.stringify({ expectedOrgId: orgId, receivedOrgId: profileData.organization?.id, smartPlanner: profileData.organization?.enabledAddons?.smartPlanner })}`);
  await page.getByLabel('Abrir addons').click();

  const launcher = page.locator('.cloudsuite-launcher-menu');
  const names = ['SmartPlanner', 'Ballot Box', 'Civica Pulse', 'Governo Hub', 'Termómetro Comunitario', 'Apolo', 'Lazzarus'];
  for (const name of names) await launcher.getByText(name, { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.cloudsuite-launcher-card')].some((card) => card.textContent?.includes('SmartPlanner') && !card.classList.contains('is-disabled')));
  if (await launcher.locator('.cloudsuite-launcher-card').count() !== 7) throw new Error('El launcher no muestra exactamente siete addons.');
  const desktopGrid = await launcher.locator('.cloudsuite-launcher-card').evaluateAll((cards) => cards.map((card) => {
    const box = card.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y) };
  }));
  if (new Set(desktopGrid.slice(0, 4).map((card) => card.y)).size !== 1 || desktopGrid[4]?.y <= desktopGrid[0]?.y) {
    throw new Error(`El launcher desktop debe distribuirse en cuatro columnas y dos filas: ${JSON.stringify(desktopGrid)}.`);
  }
  const comingSoonCount = await launcher.locator('.badge').count();
  if (comingSoonCount !== 1) {
    const states = await launcher.locator('.cloudsuite-launcher-card').evaluateAll((cards) => cards.map((card) => ({ label: card.textContent?.trim(), disabled: card.classList.contains('is-disabled') })));
    throw new Error(`Ballot Box no conserva su estado Próximamente (badges visibles: ${comingSoonCount}; cards: ${JSON.stringify(states)}).`);
  }
  await verifyExternalAddon(page, 'http://apolo.politicfy.com/');
  await verifyExternalAddon(page, 'https://lazzarusapp.com/');
  console.log('Addons OK: 7 ítems en cuatro columnas desktop; Apolo y Lazzarus abren en pestañas externas protegidas.');
} finally {
  await browser?.close();
  await restore?.();
  vite?.kill();
  api?.kill();
}
