import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36);
const voterName = `Elector Places Córdoba ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(20_000);
const consoleMessages = [];
page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(`${message.type()}: ${message.text()}`); });

try {
  console.log('E2E creación manual: login Firebase real');
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto(`${app}/electoral-conversion/voters`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Crear elector', exact: true }).click();
  await page.locator('#voter-name').fill(voterName);
  // Places listens to keyboard input, so type like an operator rather than
  // assigning the value programmatically with fill().
  await page.locator('#voter-address').pressSequentially('Avenida Colón 600, Córdoba', { delay: 35 });
  const suggestion = page.locator('.pac-container:visible .pac-item:visible').first();
  try { await suggestion.waitFor({ state: 'visible', timeout: 20_000 }); } catch (caught) {
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: resolve(screenshots, 'voter-places-e2e-failure.png'), fullPage: true });
    const places = await page.locator('.pac-container').evaluateAll((items) => items.map((item) => ({ display: getComputedStyle(item).display, visibility: getComputedStyle(item).visibility, text: item.textContent?.trim() ?? '' })));
    throw new Error(`Google Places no mostró una sugerencia visible. containers=${JSON.stringify(places)} console=${consoleMessages.join(' | ')} cause=${caught instanceof Error ? caught.message : String(caught)}`);
  }
  try { await suggestion.click(); } catch (caught) {
    const clickState = await suggestion.evaluate((item) => {
      const box = item.getBoundingClientRect(); const style = getComputedStyle(item.parentElement);
      return { parentZIndex: style.zIndex, parentPosition: style.position, atCenter: document.elementFromPoint(box.left + 10, box.top + 10)?.className ?? '', box: { left: box.left, top: box.top, width: box.width, height: box.height } };
    });
    throw new Error(`Google Places mostró la sugerencia, pero no quedó sobre el modal: ${JSON.stringify(clickState)}. ${caught instanceof Error ? caught.message : String(caught)}`);
  }
  await page.getByText('Dirección verificada y lista para el mapa.', { exact: true }).waitFor();
  await page.locator('#voter-phone').fill('3515551234');
  await page.locator('#voter-email').fill(`places-${suffix}@cloudsuite.local`);
  const createdResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/voters$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Crear elector', exact: true }).last().click();
  const created = await (await createdResponse).json();
  if (!Number.isFinite(created.lat) || !Number.isFinite(created.lng)) throw new Error(`El backend creó el elector sin coordenadas: ${JSON.stringify(created)}`);
  await page.getByText(voterName, { exact: true }).waitFor();

  await page.goto(`${app}/electoral-conversion/mapa`, { waitUntil: 'domcontentloaded' });
  await page.getByText(String(created.lat), { exact: false }).count();
  const map = page.locator('[data-google-map-status]');
  await map.waitFor({ state: 'visible' });
  await map.evaluate((node) => new Promise((resolveReady, reject) => {
    const deadline = window.setTimeout(() => reject(new Error(`El mapa quedó en estado ${node.getAttribute('data-google-map-status')}`)), 20_000);
    const observe = new MutationObserver(() => {
      const status = node.getAttribute('data-google-map-status');
      if (status === 'ready') { clearTimeout(deadline); observe.disconnect(); resolveReady(undefined); }
      if (status === 'error' || status === 'missing') { clearTimeout(deadline); observe.disconnect(); reject(new Error(`Google Maps terminó en estado ${status}`)); }
    });
    observe.observe(node, { attributes: true, attributeFilter: ['data-google-map-status'] });
    if (node.getAttribute('data-google-map-status') === 'ready') { clearTimeout(deadline); observe.disconnect(); resolveReady(undefined); }
  }));
  await page.getByLabel('Buscar una ubicación').fill(voterName);
  await page.locator('[data-google-map-status="ready"]').waitFor();
  const renderedCount = page.locator('[data-google-map-marker-count="1"]');
  await renderedCount.waitFor();
  const marker = page.locator(`[title="${voterName}"]`);
  await marker.waitFor({ state: 'attached' });
  await page.getByLabel('Capa Electores').uncheck();
  await page.locator('[data-google-map-marker-count="0"]').waitFor();
  await marker.waitFor({ state: 'detached' });
  await page.getByLabel('Capa Electores').check();
  await renderedCount.waitFor();
  await marker.waitFor({ state: 'attached' });
  for (const layer of ['Capa Zonas y Barrios', 'Capa Territorios', 'Capa Rutas de visita']) {
    const control = page.getByLabel(layer);
    await control.check();
    if (!await control.isChecked()) throw new Error(`${layer} no se activó.`);
    await control.uncheck();
    if (await control.isChecked()) throw new Error(`${layer} no se desactivó.`);
  }
  await page.waitForTimeout(500);
  await page.locator('[data-google-map-status="ready"]').waitFor();
  await page.locator('.cs-google-map__state').waitFor({ state: 'hidden' });
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'voter-places-e2e-real.png'), fullPage: true });
  console.log(`Creación manual E2E real OK: ${voterName}; coordenadas ${created.lat},${created.lng}; marker real creado y capa Electores oculta/restaurada.`);
} finally {
  await browser.close();
}
