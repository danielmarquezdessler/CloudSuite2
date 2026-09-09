import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
try {
  await page.goto(`${appUrl}/`);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  const usersResponse = page.waitForResponse((response) => response.request().method() === 'GET' && /\/api\/organizations\/[^/]+\/users(?:\?|$)/.test(response.url()));
  await page.goto(`${appUrl}/organization/users`, { waitUntil: 'domcontentloaded' });
  const profiles = await (await usersResponse).json();
  const profilePhotoUrls = profiles.map((profile) => profile.photoURL).filter((photoURL) => typeof photoURL === 'string' && photoURL.length > 0);
  await page.waitForTimeout(900);

  if (profilePhotoUrls.length) await page.waitForFunction((photoUrls) => photoUrls.every((photoUrl) => [...document.querySelectorAll('.cd-user-identity__avatar')].some((image) => image.getAttribute('src') === photoUrl && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)), profilePhotoUrls, { timeout: 15_000 });

  const renderedAvatars = await page.locator('.cd-user-identity__avatar').evaluateAll((images) => images.map((image) => ({
    source: image.getAttribute('src'),
    loaded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  })));
  if (!profilePhotoUrls.length) throw new Error('La API no devolvió ningún usuario con foto para validar.');
  const missing = profilePhotoUrls.filter((photoURL) => !renderedAvatars.some((avatar) => avatar.source === photoURL && avatar.loaded));
  if (missing.length) {
    const missingEmails = profiles.filter((profile) => missing.includes(profile.photoURL)).map((profile) => profile.email).join(', ');
    throw new Error(`Avatar incompleto: ${missing.length}/${profilePhotoUrls.length} foto(s) de la API no cargaron en el DOM. Usuarios afectados: ${missingEmails}`);
  }
  await mkdir(screenshotsDir, { recursive: true });
  await page.screenshot({ path: resolve(screenshotsDir, 'users-avatars-real.png'), fullPage: true });
  console.log(`Avatar E2E real OK: ${profilePhotoUrls.length}/${profilePhotoUrls.length} foto(s) de Firebase Storage cargadas.`);
} finally {
  await browser.close();
}
