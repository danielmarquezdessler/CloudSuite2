import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const avatarPath = join(screenshotsDir, 'e2e-realistic-avatar.jpg');
await mkdir(screenshotsDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

async function chooseDropdown(label, option) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.locator('.dropdown-item').filter({ hasText: option }).click();
}

async function createRealisticAvatar() {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'e2e-realistic-avatar-source';
    canvas.width = 2300;
    canvas.height = 2300;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo crear el canvas de prueba.');
    const image = context.createImageData(canvas.width, canvas.height);
    let seed = 987654321;
    for (let index = 0; index < image.data.length; index += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed & 255;
      image.data[index] = noise;
      image.data[index + 1] = (noise * 5 + (index / 4) % 255) & 255;
      image.data[index + 2] = (noise * 11 + (index / 16) % 255) & 255;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    document.body.append(canvas);
  });
  const dataUrl = await page.locator('#e2e-realistic-avatar-source').evaluate((canvas) => canvas.toDataURL('image/jpeg', .92));
  await writeFile(avatarPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const bytes = (await stat(avatarPath)).size;
  if (bytes < 3 * 1024 * 1024 || bytes > 5 * 1024 * 1024) throw new Error(`Fixture de avatar fuera del rango requerido (3–5 MB): ${bytes} bytes.`);
  return bytes;
}

try {
  const suffix = Date.now().toString(36);
  const email = `e2e-user-${suffix}@cloudsuite.local`;
  const password = 'CloudSuite-E2E-User-2026!';
  const functionName = `Función E2E ${suffix}`;
  const teamName = `Equipo E2E ${suffix}`;
  await page.goto('http://127.0.0.1:5173/');
  const avatarBytes = await createRealisticAvatar();
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto('http://127.0.0.1:5173/organization/functions');
  await page.getByRole('button', { name: 'Crear nueva función', exact: true }).first().click();
  await page.getByLabel('Nombre').fill(functionName);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(functionName, { exact: true }).waitFor();

  await page.goto('http://127.0.0.1:5173/organization/teams');
  await page.getByRole('button', { name: 'Crear nuevo equipo', exact: true }).first().click();
  await page.getByLabel('Nombre').fill(teamName);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText(teamName, { exact: true }).waitFor();

  await page.goto('http://127.0.0.1:5173/organization/users');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).first().click();
  await page.getByLabel('Nombre').fill('Usuario');
  await page.getByLabel('Apellido').fill('E2E');
  await page.getByLabel('Teléfono').fill('+5493515550000');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await chooseDropdown('Campaña', 'Campaña actual');
  await chooseDropdown('Función', functionName);
  await chooseDropdown('Equipo', teamName);
  await page.locator('#avatar').setInputFiles(avatarPath);
  await page.getByRole('button', { name: 'Confirmar recorte', exact: true }).click();
  await page.getByText('Foto lista para subir', { exact: true }).waitFor();
  await page.screenshot({ path: join(screenshotsDir, 'create-user-credentials.png') });
  const response = page.waitForResponse((request) => request.request().method() === 'POST' && /\/organizations\/[^/]+\/users$/.test(new URL(request.url()).pathname) && request.status() === 201);
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).last().click();
  const created = await (await response).json();
  const { db, storage } = await import('../../server/dist/config/firebase.js');
  const [avatarExists] = await storage.bucket().file(created.photoURL.replace(/^gs:\/\/[^/]+\//, '')).exists();
  if (!avatarExists) throw new Error('Avatar no existe en Storage.');
  const campaignMember = await db.collection('organizations').doc(created.orgId).collection('campaigns').doc(created.campaignId).collection('members').doc(created.uid).get();
  if (campaignMember.data()?.functionId !== created.functionId || campaignMember.data()?.teamId !== created.teamId) throw new Error(`Asignación de Firestore inválida: ${JSON.stringify(campaignMember.data())}`);
  if (!campaignMember.exists) throw new Error('No se encontró el miembro creado en Firestore.');

  await page.getByLabel('Perfil').click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  await menu.locator('a.dropdown-item').filter({ hasText: 'Cerrar sesión' }).click();
  await page.waitForURL('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  console.log(`E2E usuario real OK: ${email}; avatar de ${avatarBytes} bytes, Storage, Firestore (functionId y teamId), logout y login verificados.`);
} finally {
  await browser.close();
}
