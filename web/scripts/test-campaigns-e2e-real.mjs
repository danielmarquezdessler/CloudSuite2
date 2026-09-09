import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const suffix = Date.now().toString(36);
const email = `e2e-campaign-owner-${suffix}@cloudsuite.local`;
const password = 'CloudSuite-Campaign-E2E-2026!';
const organizationName = `Organización E2E ${suffix}`;
const initialCampaignName = `Campaña base ${suffix}`;
const createdName = `Campaña temporal ${suffix}`;
const renamedName = `Campaña renombrada ${suffix}`;
const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  await page.goto(`${appUrl}/register`);
  await page.getByLabel('Nombre de la organización').fill(organizationName);
  await page.getByLabel('Nombre de la primera campaña').fill(initialCampaignName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto(`${appUrl}/organization/campaigns`);
  await page.getByRole('heading', { name: 'Gestión de Campañas', exact: true }).waitFor();
  const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/organizations\/[^/]+\/campaigns$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Crear nueva campaña', exact: true }).first().click();
  await page.locator('#campaign-name').fill(createdName);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  const created = await (await createResponse).json();
  await page.getByText(createdName, { exact: true }).waitFor();

  const createdRow = page.locator('tr', { hasText: createdName });
  const renameResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/campaigns/${created.id}`) && response.status() === 200);
  await createdRow.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('#campaign-name').fill(renamedName);
  await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
  await renameResponse;
  await page.getByText(renamedName, { exact: true }).waitFor();

  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(email);
  const campaignRef = db.collection('organizations').doc(created.id ? (await db.collection('users').doc(owner.uid).get()).data().orgIds[0] : '').collection('campaigns').doc(created.id);
  const beforeDeleteClaims = (await adminAuth.getUser(owner.uid)).customClaims?.camps ?? {};
  if (!beforeDeleteClaims[created.id]) throw new Error('La campaña creada no fue agregada a las custom claims del propietario.');
  const collections = ['voters', 'visits', 'teams', 'functions', 'calendar', 'circuitos', 'zones', 'goals', 'routes', 'questionSets', 'budgets', 'aiSuggestions', 'auditLog'];
  await Promise.all(collections.map((name) => campaignRef.collection(name).doc('e2e').set({ seededBy: 'test-campaigns-e2e-real' })));
  await campaignRef.collection('teams').doc('e2e').collection('members').doc(owner.uid).set({ seededBy: 'test-campaigns-e2e-real' });

  const renamedRow = page.locator('tr', { hasText: renamedName });
  const deleteResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith(`/campaigns/${created.id}`) && response.status() === 200);
  await renamedRow.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.locator('#campaign-delete-confirmation').fill(renamedName);
  await page.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await deleteResponse;
  await renamedRow.waitFor({ state: 'hidden' });

  if ((await campaignRef.get()).exists) throw new Error('El documento de la campaña eliminada todavía existe.');
  for (const name of collections) {
    const leftovers = await campaignRef.collection(name).get();
    if (!leftovers.empty) throw new Error(`Quedaron ${leftovers.size} documento(s) en la subcolección ${name}.`);
  }
  const afterDeleteUser = await adminAuth.getUser(owner.uid);
  if (afterDeleteUser.customClaims?.camps?.[created.id]) throw new Error('La custom claim de la campaña eliminada sigue presente.');
  if (!await adminAuth.getUser(owner.uid)) throw new Error('La cuenta del propietario fue eliminada por error.');

  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.getByText('Cerrar sesión', { exact: true }).click();
  await page.waitForURL(`${appUrl}/`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  const remainingCampaigns = await db.collection('organizations').doc((await db.collection('users').doc(owner.uid).get()).data().orgIds[0]).collection('campaigns').get();
  if (remainingCampaigns.size !== 1) throw new Error(`El entorno aislado esperaba una sola campaña restante y encontró ${remainingCampaigns.size}.`);
  const lastCampaign = remainingCampaigns.docs[0];
  await page.goto(`${appUrl}/organization/campaigns`);
  const lastRow = page.locator('tr', { hasText: String(lastCampaign.data().nombre) });
  await lastRow.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.locator('#campaign-delete-confirmation').fill(String(lastCampaign.data().nombre));
  const blockedResponse = page.waitForResponse((response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith(`/campaigns/${lastCampaign.id}`) && response.status() === 400);
  await page.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  const blockedBody = await (await blockedResponse).json();
  if (blockedBody.message !== 'Debe existir al menos una campaña.') throw new Error(`Mensaje incorrecto al bloquear última campaña: ${JSON.stringify(blockedBody)}`);
  await mkdir(screenshotsDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotsDir, 'campaigns-e2e-real.png'), fullPage: true });
  console.log(`Campaigns E2E real OK: crear, renombrar, cascada de ${collections.length} subcolecciones, claims, login y bloqueo de última campaña verificados para ${email}.`);
} finally {
  await browser.close();
}
