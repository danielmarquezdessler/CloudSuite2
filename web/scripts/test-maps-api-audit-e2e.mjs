import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(20_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  console.log('Auditoría Maps E2E: iniciando sesión Firebase real…');
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto(`${app}/execution/heatmap`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Intensidad territorial', { exact: true }).waitFor();
  await page.waitForTimeout(750);
  if (errors.length) throw new Error(`La página de heatmap produjo errores de navegador: ${errors.join(' | ')}`);
  if (await page.getByText('No pudimos cargar el mapa', { exact: true }).count()) throw new Error('La API de heatmap devolvió un error funcional.');

  const map = page.locator('[data-google-map-status]');
  if (await map.count()) {
    await page.waitForFunction(() => ['ready', 'error', 'missing'].includes(document.querySelector('[data-google-map-status]')?.getAttribute('data-google-map-status') ?? ''), { timeout: 30_000 });
    const status = await map.getAttribute('data-google-map-status');
    if (status !== 'ready') throw new Error(`El heatmap quedó en estado ${status}.`);
    console.log('Auditoría Maps E2E: heatmap renderizado con círculos nativos, sin HeatmapLayer.');
  } else {
    await page.getByText('Sin puntos para este indicador', { exact: true }).waitFor();
    console.log('Auditoría Maps E2E: la página respondió correctamente, pero la campaña no tiene puntos para el indicador Apoyo.');
  }
  await mkdir(fileURLToPath(new URL('../.screenshots/', import.meta.url)), { recursive: true });
  await page.screenshot({ path: resolve(fileURLToPath(new URL('../.screenshots/', import.meta.url)), 'maps-api-audit-e2e-real.png'), fullPage: true });
  console.log('Auditoría Maps E2E real OK.');
} finally {
  await browser.close();
}
