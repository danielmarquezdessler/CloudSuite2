import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36);
const fullName = `Elector completo ${suffix}`;
const manualName = `Elector manual ${suffix}`;
const manualAddress = `Paraje inexistente CloudSuite ${suffix}, Córdoba`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(25_000);

async function openCreate() {
  await page.getByRole('button', { name: 'Crear elector', exact: true }).click();
  await page.locator('[data-places-status="ready"]').waitFor();
}

async function chooseRealAddress() {
  const input = page.locator('#voter-address');
  await input.pressSequentially('Avenida Colón 600, Córdoba', { delay: 30 });
  const suggestion = page.locator('.pac-container:visible .pac-item:visible').first();
  await suggestion.waitFor({ state: 'visible' });
  const overlay = await suggestion.evaluate((item) => {
    const box = item.getBoundingClientRect(); const parent = item.parentElement; const style = parent ? getComputedStyle(parent) : null;
    return { zIndex: style?.zIndex, visibleAtCenter: document.elementFromPoint(box.left + 12, box.top + 12)?.closest('.pac-container') === parent };
  });
  if (!overlay.visibleAtCenter) throw new Error(`La sugerencia de Places quedó detrás del modal: ${JSON.stringify(overlay)}`);
  await suggestion.click();
  await page.getByText('Dirección verificada y lista para el mapa.', { exact: true }).waitFor();
}

async function createAndRead(name, expectCoordinates) {
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && /\/voters$/.test(new URL(item.url()).pathname) && item.status() === 201);
  await page.getByRole('button', { name: 'Crear elector', exact: true }).last().click();
  const body = await (await response).json();
  if (expectCoordinates && (!Number.isFinite(body.lat) || !Number.isFinite(body.lng))) throw new Error(`El elector geocodificado no devolvió coordenadas: ${JSON.stringify(body)}`);
  if (!expectCoordinates && (body.lat !== null || body.lng !== null)) throw new Error(`La dirección manual debería conservarse sin coordenadas: ${JSON.stringify(body)}`);
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText(name, { exact: true }).waitFor();
  return body;
}

try {
  console.log('Brief 45 E2E real: login Firebase');
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${app}/electoral-conversion/voters`, { waitUntil: 'domcontentloaded' });

  console.log('Brief 45 E2E real: Places visible + elector con datos completos');
  await openCreate(); await page.locator('#voter-name').fill(fullName); await chooseRealAddress();
  await page.locator('#voter-neighborhood').fill('Nueva Córdoba'); await page.locator('#voter-dni').fill('40123456');
  await page.getByLabel('Sexo').click(); await page.getByText('Femenino', { exact: true }).click();
  await page.getByRole('button', { name: 'Sé la fecha exacta', exact: true }).click(); await page.locator('#voter-birthdate').fill('1990-05-20');
  await page.getByText('Edad calculada:', { exact: false }).waitFor();
  await page.locator('#voter-phone').fill('3515551234'); await page.locator('#voter-email').fill(`brief45-${suffix}@cloudsuite.local`); await page.locator('#voter-observations').fill('Observación E2E real del Brief 45.');
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'brief45-create-voter-modal.png'), fullPage: true });
  const full = await createAndRead(fullName, true);

  const { db } = await import('../../server/dist/config/firebase.js');
  const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  if (profile.empty) throw new Error('No se encontró el usuario E2E para validar Firestore.');
  const orgId = profile.docs[0].data().orgIds[0];
  const campId = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cloudsuite.activeCampaign.'))?.[1]);
  if (!campId) throw new Error('No se encontró la campaña activa en localStorage.');
  const fullDoc = await db.collection('organizations').doc(orgId).collection('campaigns').doc(campId).collection('voters').doc(full.id).get();
  const fields = fullDoc.data();
  const expected = { dni: '40123456', sexo: 'F', fechaNacimiento: '1990-05-20', edadAproximada: null, barrio: 'Nueva Córdoba', observaciones: 'Observación E2E real del Brief 45.' };
  for (const [field, value] of Object.entries(expected)) if (fields?.[field] !== value) throw new Error(`Firestore no guardó ${field}: esperado ${JSON.stringify(value)}, recibido ${JSON.stringify(fields?.[field])}`);

  console.log('Brief 45 E2E real: dirección manual sin sugerencia');
  await openCreate(); await page.locator('#voter-name').fill(manualName); await page.locator('#voter-address').pressSequentially(manualAddress, { delay: 15 });
  await page.waitForTimeout(1200);
  if (await page.locator('.pac-container:visible .pac-item:visible').count()) throw new Error('La dirección de fallback recibió una sugerencia inesperada; elegí un valor de prueba menos ambiguo.');
  await page.getByRole('button', { name: 'Solo sé la edad', exact: true }).click(); await page.locator('#voter-approximate-age').fill('47');
  const manual = await createAndRead(manualName, false);
  const manualDoc = await db.collection('organizations').doc(orgId).collection('campaigns').doc(campId).collection('voters').doc(manual.id).get();
  if (manualDoc.data()?.address !== manualAddress || manualDoc.data()?.lat !== null || manualDoc.data()?.lng !== null || manualDoc.data()?.edadAproximada !== 47) throw new Error(`Firestore no conservó el fallback manual: ${JSON.stringify(manualDoc.data())}`);
  await page.screenshot({ path: resolve(screenshots, 'brief45-voters-result.png'), fullPage: true });
  console.log(`Brief 45 E2E real OK: Places visible, ${fullName} guardó todos los campos y ${manualName} quedó guardado manualmente sin coordenadas.`);
} finally { await browser.close(); }
