import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${app}/electoral-conversion/mapa`, { waitUntil: 'domcontentloaded' });
  await page.getByText('INTELIGENCIA TERRITORIAL', { exact: true }).waitFor();
  await page.getByText(/Última actualización: Hoy/).waitFor();
  await page.getByRole('region', { name: 'Resumen del mapa' }).waitFor();
  await page.getByRole('region', { name: 'Resumen territorial' }).waitFor();
  const map = page.locator('[data-google-map-status]');
  await map.waitFor({ state: 'visible' });
  await page.waitForFunction((element) => ['ready', 'error', 'missing'].includes(element.getAttribute('data-google-map-status') ?? ''), await map.elementHandle());
  if (await map.getAttribute('data-google-map-status') !== 'ready') throw new Error(`Google Maps no quedó listo: ${await map.getAttribute('data-google-map-status')}`);
  const votersCount = await page.getByLabel('Capa Electores').locator('xpath=following-sibling::span').textContent();
  const renderedCount = await map.getAttribute('data-google-map-marker-count');
  if (Number(votersCount) !== Number(renderedCount)) throw new Error(`El chip/capa reportó ${votersCount} electores pero el mapa renderizó ${renderedCount}.`);
  await page.screenshot({ path: fileURLToPath(new URL('../.screenshots/voters-map-upgrade-e2e-real.png', import.meta.url)), fullPage: true });
  console.log(`Mapa UI E2E real OK: ${renderedCount} electores visibles, live timestamp y resumen territorial verificados.`);
} finally {
  await browser.close();
}
