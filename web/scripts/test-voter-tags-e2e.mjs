import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36); const firstName = `Elector Tags A ${suffix}`; const secondName = `Elector Tags B ${suffix}`; const commonTag = `Docente E2E ${suffix}`; const secondTag = `Comerciante E2E ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(20_000);

async function selectPlace() {
  await page.locator('#voter-address').pressSequentially('Avenida Colón 600, Córdoba', { delay: 25 });
  const item = page.locator('.pac-container:visible .pac-item:visible').first(); await item.waitFor({ state: 'visible' }); await item.click();
  await page.getByText('Dirección verificada y lista para el mapa.', { exact: true }).waitFor();
}
async function addTag(tag) { const input = page.getByRole('combobox', { name: 'Tags', exact: true }); await input.fill(tag); await input.press('Enter'); await page.waitForTimeout(150); const tags = await page.locator('.cs-tag-input__tag').allTextContents(); if (!tags.some((item) => item.includes(tag))) throw new Error(`El chip ${tag} no se creó al presionar Enter. Chips visibles: ${JSON.stringify(tags)}`); }
async function create(name, tags) {
  await page.getByRole('button', { name: 'Crear elector', exact: true }).click();
  await page.locator('#voter-name').fill(name); await selectPlace();
  for (const tag of tags) await addTag(tag);
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/voters$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Crear elector', exact: true }).last().click();
  const body = await (await created).json(); await page.getByRole('dialog', { name: /Crear elector/ }).waitFor({ state: 'hidden' }); return body;
}

try {
  console.log('E2E tags: login Firebase real');
  await page.goto(app, { waitUntil: 'domcontentloaded' }); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${app}/electoral-conversion/voters`, { waitUntil: 'domcontentloaded' });
  console.log('E2E tags: creando dos electores con tags reales');
  const first = await create(firstName, [commonTag]); await page.getByText(firstName, { exact: true }).waitFor();
  const second = await create(secondName, [secondTag]); await page.getByText(secondName, { exact: true }).waitFor();
  if (!first.tags?.includes(commonTag) || !second.tags?.includes(secondTag)) throw new Error(`El POST no guardó los tags: ${JSON.stringify({ first, second })}`);

  console.log('E2E tags: editando y reutilizando un tag de la campaña');
  const row = page.locator('tr', { hasText: firstName }); await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await addTag(secondTag);
  const updated = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/voters/${first.id}`) && response.status() === 200);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); const updatedBody = await (await updated).json();
  if (!updatedBody.tags?.includes(commonTag) || !updatedBody.tags?.includes(secondTag)) throw new Error(`La edición no persistió ambos tags: ${JSON.stringify(updatedBody)}`);

  console.log('E2E tags: aplicando filtro múltiple por tag');
  await page.getByLabel('Filtrar por tags').click();
  const menu = page.locator('.cs-multi-select__menu'); await menu.getByText(commonTag, { exact: true }).click();
  await page.getByText(firstName, { exact: true }).waitFor();
  const secondRows = await page.locator('tr', { hasText: secondName }).count();
  if (secondRows !== 0) throw new Error('El filtro por tag no redujo la lista: mostró un elector sin el tag elegido.');
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'voter-tags-e2e-real.png'), fullPage: true });
  console.log(`Tags E2E real OK: ${firstName} y ${secondName}; creación, edición, badges y filtro por ${commonTag} confirmados.`);
} finally { await browser.close(); }
