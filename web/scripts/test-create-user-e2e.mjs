import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(15_000);

try {
  const suffix = Date.now().toString(36);
  const email = `e2e-user-${suffix}@cloudsuite.local`;
  const password = 'CloudSuite-E2E-User-2026!';
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto('http://127.0.0.1:5173/organization/users');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).first().click();
  await page.getByLabel('Nombre').fill('Usuario');
  await page.getByLabel('Apellido').fill('E2E');
  await page.getByLabel('Teléfono').fill('+5493515550000');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Campaña', exact: true }).click();
  const campaigns = page.locator('.dropdown-menu.show').last();
  await campaigns.waitFor({ state: 'visible' });
  await campaigns.locator('.dropdown-item').nth(1).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5AAAAAElFTkSuQmCC', 'base64');
  await page.locator('#avatar').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Confirmar recorte', exact: true }).click();
  await page.getByText('Foto lista para subir', { exact: true }).waitFor();
  const response = page.waitForResponse((request) => request.request().method() === 'POST' && /\/organizations\/[^/]+\/users$/.test(new URL(request.url()).pathname) && request.status() === 201);
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).last().click();
  const created = await (await response).json();
  const { storage } = await import('../../server/dist/config/firebase.js');
  const [exists] = await storage.bucket().file(created.photoURL.replace(/^gs:\/\/[^/]+\//, '')).exists();
  if (!exists) throw new Error('Avatar no existe en Storage');
  await page.getByLabel('Perfil').click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.locator('a.dropdown-item').filter({ hasText: 'Cerrar sesión' }).click();
  await page.waitForURL('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  console.log(`E2E usuario real OK: ${email}; Auth, Firestore, Storage, logout y login verificados.`);
} finally {
  await browser.close();
}
