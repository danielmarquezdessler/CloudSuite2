import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const screenshotDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const env = Object.fromEntries((await readFile(envPath, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));

async function ensureGoogleMap(page, label) {
  try {
    await page.locator('[data-google-map-status="ready"]').waitFor({ timeout: 30000 });
  } catch {
    const state = await page.locator('[data-google-map-status]').getAttribute('data-google-map-status').catch(() => 'missing');
    const message = await page.locator('.cs-google-map__state').textContent().catch(() => 'sin mensaje');
    throw new Error(`${label}: Google Maps no quedó listo (estado=${state}; detalle=${message?.trim()}).`);
  }
  try {
    await page.locator('.gm-style').first().waitFor({ state: 'attached', timeout: 10000 });
  } catch {
    throw new Error(`${label}: el SDK indicó listo, pero no renderizó el contenedor real de Google Maps.`);
  }
}

async function completeIndecisiveVisit(page, voterName) {
  const row = page.locator('tr').filter({ hasText: voterName });
  await row.getByRole('button', { name: 'Visitar', exact: true }).click();
  await page.getByText('Paso 1 de 4').waitFor();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 2 de 4').waitFor();
  for (const input of await page.locator('input.form-control:visible').all()) await input.fill('respuesta E2E Brief 35');
  const radioNames = await page.locator('input[type=radio]:visible').evaluateAll((inputs) => [...new Set(inputs.map((input) => input.getAttribute('name')).filter(Boolean))]);
  for (const name of radioNames) await page.locator(`input[type=radio][name="${name}"]:visible`).first().check();
  const checkboxNames = await page.locator('input[type=checkbox]:visible').evaluateAll((inputs) => [...new Set(inputs.map((input) => input.getAttribute('name')).filter(Boolean))]);
  for (const name of checkboxNames) await page.locator(`input[type=checkbox][name="${name}"]:visible`).first().check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 3 de 4').waitFor();
  await page.locator('textarea:visible').fill('Visita de validación real para el mapa de calor.');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 4 de 4').waitFor();
  await page.getByRole('button', { name: 'INDECISO', exact: true }).click();
  await page.waitForURL(/electoral-conversion\/voters/);
  console.log('E2E Brief 35: visita real de elector indeciso OK');
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  await mkdir(screenshotDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('request', (request) => {
    if (request.url().includes('/ai-suggestions/')) console.log(`E2E Brief 35: solicitud Asesor ${request.method()} ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.url().includes('/ai-suggestions/')) console.log(`E2E Brief 35: respuesta Asesor ${response.status()} ${response.url()}`);
  });

  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  console.log('E2E Brief 35: login Firebase real OK');

  const suffix = Date.now().toString(36);
  const campaignName = `Maps Gemini E2E ${suffix}`;
  const campaignSelector = page.locator('.cs-campaign-selector');
  await campaignSelector.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.cs-campaign-selector')?.hasAttribute('disabled'));
  await campaignSelector.click();
  await page.locator('.cs-campaign-modal').waitFor({ state: 'visible' });
  await page.locator('#navbar-campaign-name').fill(campaignName);
  const campaignResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/campaigns$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await campaignResponse;
  await page.getByRole('button', { name: new RegExp(`Cambiar campaña activa: ${campaignName}`) }).waitFor();
  await page.getByLabel('Cerrar selector de campaña').click();
  console.log(`E2E Brief 35: campaña creada y activa (${campaignName})`);

  const voterName = `Elector Maps Real ${suffix}`;
  const csv = `Nombre,Dirección,Teléfono\n${voterName},"Av. Colón 1000, Córdoba, Argentina",3515550100\nElector Maps Centro ${suffix},"Obispo Trejo 242, Córdoba, Argentina",3515550101\nElector Maps Sur ${suffix},"Avenida Hipólito Yrigoyen 325, Córdoba, Argentina",3515550102\n`;
  await page.goto(`${app}/electoral-conversion/voters`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Importar electores', exact: true }).first().click();
  await page.locator('input[type=file]').setInputFiles({ name: `maps-real-${suffix}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const importResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/voters/import') && response.status() === 201);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  const report = await (await importResponse).json();
  if (report.importedCount !== 3 || report.noGeoCount !== 0) throw new Error(`Importación geocodificada inválida: ${JSON.stringify(report)}`);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByText(voterName, { exact: true }).waitFor();
  console.log(`E2E Brief 35: importación real OK (${report.importedCount} electores; ${report.noGeoCount} sin geocodificar)`);

  await page.goto(`${app}/electoral-conversion/mapa`, { waitUntil: 'domcontentloaded' });
  await ensureGoogleMap(page, 'Mapa de electores');
  await page.screenshot({ path: `${webDir}.screenshots/brief35-voters-map.png`, fullPage: true });
  console.log('E2E Brief 35: mapa de electores real OK');

  await page.goto(`${app}/electoral-conversion/voters`, { waitUntil: 'domcontentloaded' });
  await completeIndecisiveVisit(page, voterName);
  await page.goto(`${app}/execution/heatmap`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Apoyo').click();
  await page.locator('.cd-select-dropdown__menu.show').getByText('Indecisos', { exact: true }).click();
  await ensureGoogleMap(page, 'Mapa de calor');
  await page.screenshot({ path: `${webDir}.screenshots/brief35-heatmap.png`, fullPage: true });
  console.log('E2E Brief 35: mapa de calor real OK');

  await page.goto(`${app}/planning/advisor`, { waitUntil: 'domcontentloaded' });
  const advisorButton = page.locator('.cd-hero').getByRole('button', { name: 'Pedir análisis', exact: true });
  await advisorButton.waitFor({ state: 'visible' });
  console.log(`E2E Brief 35: acción Asesor disponible=${await advisorButton.isEnabled()}`);
  const advisorResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/ai-suggestions/request'));
  await advisorButton.click();
  const advisorHttp = await advisorResponse;
  const suggestions = await advisorHttp.json();
  if (advisorHttp.status() !== 201) throw new Error(`El Asesor respondió ${advisorHttp.status()}: ${JSON.stringify(suggestions)}`);
  const recommendation = suggestions?.[0]?.content ?? '';
  if (typeof recommendation !== 'string' || recommendation.length < 25) throw new Error(`Gemini no devolvió una recomendación utilizable: ${JSON.stringify(suggestions)}`);
  await page.getByRole('paragraph').filter({ hasText: recommendation }).first().waitFor();
  console.log(`E2E Brief 35: análisis Gemini real OK (${recommendation.length} caracteres)`);

  await page.goto(`${app}/execution/daily-summary`, { waitUntil: 'domcontentloaded' });
  const summaryResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/execution/daily-summary') && response.status() === 200);
  await page.getByRole('button', { name: 'Generar resumen de hoy', exact: true }).first().click();
  const summaryResult = await (await summaryResponse).json();
  if (typeof summaryResult.summary !== 'string' || summaryResult.summary.length < 40) throw new Error(`Gemini no devolvió un resumen utilizable: ${JSON.stringify(summaryResult)}`);
  await page.getByText(summaryResult.summary, { exact: true }).waitFor();
  const pdfDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar a PDF', exact: true }).click(); const pdf = await pdfDownload;
  const excelDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar a Excel', exact: true }).click(); const excel = await excelDownload;
  if (!pdf.suggestedFilename().endsWith('.pdf') || !excel.suggestedFilename().endsWith('.xls')) throw new Error('Las exportaciones de resumen no produjeron los formatos esperados.');
  console.log(`E2E Brief 35: resumen Gemini y exportaciones OK (${summaryResult.summary.length} caracteres)`);

  await page.goto(`${app}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Mapa de electores', exact: true }).waitFor();
  await ensureGoogleMap(page, 'Widget de mapa del Dashboard');
  await page.screenshot({ path: `${webDir}.screenshots/brief35-dashboard-map.png`, fullPage: true });
  await Promise.all([page.waitForURL(/\/electoral-conversion\/mapa/), page.getByRole('link', { name: 'Ver mapa completo', exact: true }).first().click()]);
  console.log('E2E Brief 35: widget del Dashboard y enlace al mapa completo OK');

  if (consoleErrors.length) throw new Error(`Errores de consola: ${consoleErrors.join(' | ')}`);
  console.log(JSON.stringify({
    imported: report.importedCount,
    noGeoCount: report.noGeoCount,
    recommendationLength: recommendation.length,
    summaryLength: summaryResult.summary.length,
    pdf: pdf.suggestedFilename(),
    excel: excel.suggestedFilename()
  }));
} finally {
  await browser.close();
}
