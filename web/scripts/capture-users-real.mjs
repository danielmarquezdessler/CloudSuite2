import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1600, height: 980 } });
page.setDefaultTimeout(15_000);

try {
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${app}/organization/users`);
  await page.getByRole('heading', { name: 'Miembros de la campaña', exact: true }).waitFor();
  await page.locator('.cd-users-table').first().waitFor();
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'users-ui-real.png'), fullPage: true });
  console.log('Captura real de Usuarios generada.');
} finally {
  await browser.close();
}
