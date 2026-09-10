import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
await mkdir(screenshotsDir, { recursive: true });

const login = async (email, password) => {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
};
const logout = async () => {
  await page.getByLabel('Perfil').click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.locator('a.dropdown-item').filter({ hasText: 'Cerrar sesión' }).click();
  await page.waitForURL('http://127.0.0.1:5173/');
};
const createUser = async (email, password, firstName) => {
  await page.goto('http://127.0.0.1:5173/organization/users');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).first().click();
  await page.getByLabel('Nombre').fill(firstName);
  await page.getByLabel('Apellido').fill('E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Campaña', exact: true }).click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.getByText('Campaña actual', { exact: true }).click();
  const response = page.waitForResponse((request) => request.request().method() === 'POST' && /\/organizations\/[^/]+\/users$/.test(new URL(request.url()).pathname) && request.status() === 201);
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).last().click();
  return (await response).json();
};

try {
  const suffix = Date.now().toString(36);
  const campaignEmail = `e2e-unlink-${suffix}@cloudsuite.local`;
  const deletedEmail = `e2e-delete-${suffix}@cloudsuite.local`;
  const password = 'CloudSuite-E2E-User-2026!';
  await login(env.E2E_EMAIL, env.E2E_PASSWORD);
  await createUser(campaignEmail, password, 'Desvincular');
  await createUser(deletedEmail, password, 'Eliminar');

  const campaignPanel = page.locator('article.cd-card').filter({ has: page.getByRole('heading', { name: 'Miembros de la campaña', exact: true }) });
  const organizationPanel = page.locator('article.cd-card').filter({ has: page.getByRole('heading', { name: 'Usuarios de la organización', exact: true }) });
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('Buscar miembros de la campaña').fill(campaignEmail);
  await page.getByLabel('Buscar usuarios de la organización').fill(campaignEmail);
  await campaignPanel.locator('tr', { hasText: campaignEmail }).waitFor();
  await organizationPanel.locator('tr', { hasText: campaignEmail }).waitFor();
  await page.screenshot({ path: join(screenshotsDir, 'users-actions-real.png'), fullPage: true });
  const unlinkResponse = page.waitForResponse((request) => request.request().method() === 'DELETE' && /\/members\//.test(new URL(request.url()).pathname));
  const campaignRow = campaignPanel.locator('tr', { hasText: campaignEmail });
  await campaignRow.getByLabel(/Más acciones para/).click();
  await page.locator('.dropdown-menu.show').getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar de campaña', exact: true }).click();
  const unlinkResult = await unlinkResponse;
  if (unlinkResult.status() !== 204) throw new Error(`La desvinculación respondió ${unlinkResult.status()}: ${await unlinkResult.text()}`);
  await campaignPanel.locator('tr', { hasText: campaignEmail }).waitFor({ state: 'detached' });
  await organizationPanel.locator('tr', { hasText: campaignEmail }).waitFor();

  await logout();
  await login(campaignEmail, password);
  await logout();
  await login(env.E2E_EMAIL, env.E2E_PASSWORD);
  await page.goto('http://127.0.0.1:5173/organization/users');
  const destructivePanel = page.locator('article.cd-card').filter({ has: page.getByRole('heading', { name: 'Usuarios de la organización', exact: true }) });
  await page.getByLabel('Buscar usuarios de la organización').fill(deletedEmail);
  await destructivePanel.locator('tr', { hasText: deletedEmail }).waitFor();
  const destructiveRow = destructivePanel.locator('tr', { hasText: deletedEmail });
  await destructiveRow.getByLabel(/Más acciones para/).click();
  await page.locator('.dropdown-menu.show').getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
  await page.getByLabel('Para confirmar, escribí el email de la persona').fill(deletedEmail);
  const deleteResponse = page.waitForResponse((request) => request.request().method() === 'DELETE' && /\/organizations\/[^/]+\/users\//.test(new URL(request.url()).pathname));
  await page.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click();
  const deleteResult = await deleteResponse;
  if (deleteResult.status() !== 204) throw new Error(`La eliminación de cuenta respondió ${deleteResult.status()}: ${await deleteResult.text()}`);
  await destructivePanel.locator('tr', { hasText: deletedEmail }).waitFor({ state: 'detached' });

  await logout();
  await page.getByLabel('Email').fill(deletedEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('alert').waitFor();
  if (!/auth\/(invalid-credential|user-not-found)/.test(await page.getByRole('alert').innerText())) throw new Error(`El usuario eliminado aún pudo iniciar sesión: ${await page.getByRole('alert').innerText()}`);
  const { adminAuth } = await import('../../server/dist/config/firebase.js');
  await adminAuth.getUserByEmail(deletedEmail).then(() => { throw new Error('La cuenta eliminada sigue existiendo en Firebase Auth.'); }, (error) => {
    if (error.code !== 'auth/user-not-found') throw error;
  });
  console.log(`E2E acciones de usuarios OK: ${campaignEmail} fue desvinculado y pudo iniciar sesión; ${deletedEmail} fue eliminado de Firebase Auth.`);
} finally {
  await browser.close();
}
