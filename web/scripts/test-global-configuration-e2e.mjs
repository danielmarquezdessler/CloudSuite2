import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parse = (value) => Object.fromEntries(value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
let browser; let restore;
try {
  const env = parse(await readFile(envPath, 'utf8')); const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const account = await adminAuth.getUserByEmail(env.E2E_EMAIL); const profile = await db.collection('users').doc(account.uid).get(); const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  if (!orgId) throw new Error('No se encontró la organización E2E.');
  const organization = db.collection('organizations').doc(orgId); const before = (await organization.get()).data() ?? {}; const originalConfig = before.globalConfiguration; const originalAddons = before.enabledAddons ?? {};
  restore = async () => { const patch = { enabledAddons: originalAddons, globalConfiguration: originalConfig ?? {} }; await organization.set(patch, { merge: true }); };
  await organization.set({ enabledAddons: { ...originalAddons, smartPlanner: true } }, { merge: true });
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath }); const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(30_000);
  await page.goto(webUrl); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/smartplanner/settings`); await page.getByRole('heading', { name: 'Configuración', exact: true }).waitFor();
  const suffix = String(Date.now()); await page.getByLabel('Partido político').fill(`Partido E2E ${suffix}`); await page.getByLabel('Sigla del partido').fill('E2E'); await page.getByLabel('Dirección principal').fill('Av. Colón 123, Córdoba, Argentina'); await page.getByLabel('Latitud del partido').fill('-31.4167'); await page.getByLabel('Longitud del partido').fill('-64.1833');
  const logoInput = page.getByLabel('Subir logo del partido'); if (await logoInput.count() !== 1) throw new Error(`No encontramos el input de logo esperado; encontrados: ${await page.locator('input[type=file]').count()}.`); const uploadResponse = page.waitForResponse((response) => response.url().includes('/global-configuration/party-logo')); await logoInput.setInputFiles({ name: 'logo-e2e.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+9zC6WQAAAABJRU5ErkJggg==', 'base64') }); const logoResponse = await uploadResponse; if (!logoResponse.ok()) throw new Error(`No se pudo subir el logo del partido: ${logoResponse.status()} ${await logoResponse.text()}`); await page.getByText('Logo del partido actualizado.', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Guardar configuración global', exact: true }).click(); await page.getByText('Configuración global guardada.', { exact: true }).waitFor();
  const saved = (await organization.get()).data()?.globalConfiguration; if (saved?.partyName !== `Partido E2E ${suffix}` || saved?.lat !== -31.4167 || saved?.lng !== -64.1833 || !saved?.partyLogoUrl) throw new Error(`La Configuración Global no persistió correctamente en Firestore/Storage: ${JSON.stringify(saved)}.`);
  await page.goto(`${webUrl}/dashboard`); const globe = page.locator('.campaign-globe[data-campaign-location="configured"]'); await globe.waitFor(); const canvas = globe.locator('canvas'); if (!(await canvas.evaluate((node) => node.getBoundingClientRect().width > 250 && node.getBoundingClientRect().height > 250))) throw new Error('El globo no quedó visible en el dashboard.'); console.log('Configuración Global E2E OK: datos de partido, logo Storage, ubicación y globo con pin real persistieron.');
} finally { await browser?.close(); await restore?.(); }
