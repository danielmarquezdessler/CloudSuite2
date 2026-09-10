import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const app = process.env.E2E_WEB_URL ?? 'https://app.politicfy.com';
const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));

if (!env.E2E_EMAIL || !env.E2E_PASSWORD) throw new Error('Faltan E2E_EMAIL o E2E_PASSWORD en web/.env.test.');

function isApiPath(response, expression) {
  try { return expression.test(new URL(response.url()).pathname); } catch { return false; }
}

async function selectOption(page, ariaLabel, index = 1) {
  await page.getByLabel(ariaLabel).click();
  const options = page.locator('.cd-select-dropdown__menu .dropdown-item');
  const count = await options.count();
  if (count <= index) {
    await page.keyboard.press('Escape');
    return false;
  }
  await options.nth(index).click();
  return true;
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const context = await browser.newContext({ viewport: { width: 1600, height: 1024 } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on('console', (message) => { if (message.type() === 'error') console.error(`[browser] ${message.text()}`); });

try {
  console.log(`Brief 43 producción: abriendo ${app}`);
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/\/dashboard(?:\?|$)/);
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible' });

  await page.evaluate(() => localStorage.removeItem('cloudsuite.sidebar.modules'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('nav.pc-sidebar').waitFor({ state: 'visible' });
  const groupState = async (id) => page.locator(`[data-sidebar-module="${id}"] > button`).getAttribute('aria-expanded');
  const expected = { organization: 'true', 'electoral-conversion': 'false', planning: 'false', execution: 'false' };
  for (const [id, value] of Object.entries(expected)) {
    const actual = await groupState(id);
    if (actual !== value) throw new Error(`Sidebar inválido para ${id}: esperado ${value}, recibido ${actual}.`);
  }
  console.log('Sidebar de producción OK: Organización expandido; otros módulos colapsados.');

  const orgChartLoaded = page.waitForResponse((response) => response.ok() && isApiPath(response, /\/org-chart$/));
  await page.goto(`${app}/organization/functions`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Funciones', exact: true }).waitFor();
  await orgChartLoaded;
  await page.getByRole('button', { name: 'Organigrama', exact: true }).click();
  await page.getByTestId('org-chart').waitFor({ state: 'visible' });
  const chartNodes = await page.locator('.cd-org-chart__node').count();
  if (!chartNodes) throw new Error('El Organigrama se mostró sin miembros reales.');
  console.log(`Organigrama de producción OK: ${chartNodes} miembro(s) visibles.`);

  const usersLoaded = page.waitForResponse((response) => response.ok() && isApiPath(response, /\/campaigns\/[^/]+\/members$/));
  await page.goto(`${app}/organization/users`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Usuarios', exact: true }).waitFor();
  await usersLoaded;
  const memberRowsBefore = await page.locator('.cd-users-table').first().locator('tbody tr').count();
  if (!memberRowsBefore) throw new Error('La tabla de miembros no tiene datos de producción para verificar.');
  const firstMemberName = (await page.locator('.cd-users-table').first().locator('tbody tr').first().locator('td').first().innerText()).split(/\r?\n/)[0].trim();
  const pageSizeChanged = await selectOption(page, 'Filas por página de miembros');
  if (!pageSizeChanged) throw new Error('El selector de paginación de miembros no ofreció tamaños alternativos.');
  if (!(await page.getByLabel('Filas por página de miembros').innerText()).includes('25')) throw new Error('El selector de paginación no actualizó el tamaño de página a 25.');
  await page.getByLabel('Buscar miembros de la campaña').fill(firstMemberName);
  await page.locator('.cd-users-table').first().locator('tbody tr').first().waitFor();
  const filterUsed = await selectOption(page, 'Filtrar miembros por función');
  if (filterUsed) await page.locator('.cd-users-table').first().locator('tbody tr').first().waitFor();
  console.log(`Usuarios de producción OK: búsqueda, filtro ${filterUsed ? 'con datos' : 'sin opciones adicionales'} y selector de paginación respondieron sobre datos reales.`);
  await page.screenshot({ path: resolve(screenshots, 'brief43-production-users.png'), fullPage: false });

  const groupsLoaded = page.waitForResponse((response) => response.ok() && isApiPath(response, /\/candidate-groups$/));
  await page.goto(`${app}/organization/candidates`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Candidatos', exact: true }).waitFor();
  await groupsLoaded;
  await page.getByRole('tab', { name: 'Listas y grupos', exact: true }).click();
  await page.getByRole('heading', { name: 'Listas de candidatos', exact: true }).waitFor();
  const groupSelector = page.getByLabel('Elegir lista de candidatos');
  await groupSelector.waitFor({ state: 'visible' });
  await groupSelector.click();
  const existingGroups = page.locator('.cd-select-dropdown__menu .dropdown-item');
  const groupCount = await existingGroups.count();
  if (!groupCount) throw new Error('No hay grupos de candidatos reales disponibles en producción.');
  const selectedGroupLabel = (await existingGroups.first().innerText()).trim();
  await existingGroups.first().click();
  await page.getByText('Titulares', { exact: true }).waitFor();
  await page.getByText('Suplentes', { exact: true }).waitFor();
  console.log(`Grupos de candidatos de producción OK: lista "${selectedGroupLabel}" cargó sus columnas Titulares/Suplentes.`);
  await page.screenshot({ path: resolve(screenshots, 'brief43-production-candidates.png'), fullPage: false });
  console.log('Brief 43 E2E de producción OK sin mocks ni interceptación HTTP.');
} finally {
  await browser.close();
}
