import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5193';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parse = (value) => Object.fromEntries(value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

let browser; let vite; let restore;
try {
  const env = parse(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const account = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(account.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const org = db.collection('organizations').doc(orgId);
  const original = (await org.get()).data()?.enabledAddons ?? {};
  restore = () => org.set({ enabledAddons: original }, { merge: true });
  await org.set({ enabledAddons: { ...original, smartPlanner: true } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5193'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: 'http://127.0.0.1:8080' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 60; attempt += 1) { try { if ((await fetch(webUrl)).ok) break; } catch {} await wait(250); if (attempt === 59) throw new Error('Vite local no inició para el gate de SmartPlanner.'); }
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(30_000);
  const failures = []; page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto(webUrl); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/smartplanner`); await page.getByRole('heading', { name: 'Cuartel de campaña', exact: true }).waitFor();
  await page.locator('.cloudsuite-sidebar-addon.is-enabled a[href="/smartplanner"]').waitFor();
  if (await page.getByText('Este addon no está habilitado en tu plan').count()) throw new Error('El gate quedó bloqueado pese al flag verdadero en Firestore.');
  if (failures.length) throw new Error(`La verificación del gate recibió respuestas fallidas: ${failures.join(' | ')}`);
  console.log('SmartPlanner addon gate E2E OK: Firestore habilitado, sidebar y Home disponibles.');
} finally { await browser?.close(); await restore?.(); vite?.kill(); }
