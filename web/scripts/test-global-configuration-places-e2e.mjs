import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parse = (value) => Object.fromEntries(value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

let browser;
try {
  const env = parse(await readFile(envPath, 'utf8'));
  const browserErrors = [];
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`); });

  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/settings`);
  await page.getByRole('heading', { name: 'Configuración', exact: true }).waitFor();

  const address = page.getByLabel('Dirección principal');
  await page.locator('[data-places-status="ready"]').waitFor();
  await address.click();
  await address.pressSequentially('Avenida Colón 600, Córdoba', { delay: 30 });
  const suggestion = page.locator('.pac-container:visible .pac-item:visible').first();
  await suggestion.waitFor({ state: 'visible', timeout: 20_000 });
  const overlay = await suggestion.evaluate((item) => {
    const box = item.getBoundingClientRect();
    const container = item.closest('.pac-container');
    const style = container ? getComputedStyle(container) : null;
    return { zIndex: style?.zIndex, visibleAtCenter: document.elementFromPoint(box.left + 12, box.top + 12)?.closest('.pac-container') === container };
  });
  if (!overlay.visibleAtCenter) throw new Error(`Google Places quedó detrás o recortado: ${JSON.stringify(overlay)}.`);
  await suggestion.click();
  await page.locator('[data-places-status="ready"]').waitFor();
  if (browserErrors.some((message) => /google|maps|places/i.test(message))) throw new Error(`Google Places emitió errores: ${browserErrors.join(' | ')}`);
  console.log(`Google Places Configuración Global E2E OK: sugerencia visible, seleccionable y z-index=${overlay.zIndex}.`);
} finally {
  await browser?.close();
}
