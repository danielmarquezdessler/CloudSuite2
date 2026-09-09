import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const suffix = Date.now().toString(36);
const email = `e2e-auto-campaign-${suffix}@cloudsuite.local`;
const password = 'CloudSuite-Auto-Campaign-2026!';
const organizationName = `Organización automática ${suffix}`;
const automaticName = 'Campaña Electoral';
const renamedName = `Campaña Electoral ${suffix}`;
const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  await page.goto(`${appUrl}/register`);
  if (await page.getByLabel('Nombre de la primera campaña').count()) throw new Error('El campo de nombre de primera campaña sigue visible en el registro.');
  await mkdir(screenshotsDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotsDir, 'auto-campaign-register.png'), fullPage: true });
  await page.getByLabel('Nombre de la organización').fill(organizationName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.waitForURL(/dashboard/);

  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(email);
  const profile = await db.collection('users').doc(owner.uid).get();
  const orgId = profile.data()?.orgIds?.[0];
  if (typeof orgId !== 'string') throw new Error('El perfil del Cliente nuevo no tiene organización.');
  const campaigns = await db.collection('organizations').doc(orgId).collection('campaigns').get();
  if (campaigns.size !== 1) throw new Error(`Se esperaba una sola campaña automática y se encontraron ${campaigns.size}.`);
  const automaticCampaign = campaigns.docs[0];
  if (automaticCampaign.data().nombre !== automaticName) throw new Error(`Nombre automático incorrecto: ${automaticCampaign.data().nombre}`);

  await page.goto(`${appUrl}/organization/campaigns`);
  const row = page.locator('tr', { hasText: automaticName });
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#campaign-name').fill(renamedName);
  const renameResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/campaigns/${automaticCampaign.id}`) && response.status() === 200);
  await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
  await renameResponse;
  if ((await automaticCampaign.ref.get()).data()?.nombre !== renamedName) throw new Error('El renombre desde Gestión de Campañas no se persistió en Firestore.');
  await page.screenshot({ path: resolve(screenshotsDir, 'auto-campaign-e2e-real.png'), fullPage: true });
  console.log(`Auto-campaign E2E real OK: ${email}; Firestore creó “${automaticName}” y Gestión de Campañas la renombró a “${renamedName}”.`);
} finally {
  await browser.close();
}
