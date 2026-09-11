import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const parseEnv = async (url) => Object.fromEntries((await readFile(url, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)];
}));
const env = await parseEnv(new URL('../.env.test', import.meta.url));
const webEnv = await parseEnv(new URL('../.env', import.meta.url));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const api = process.env.E2E_API_URL ?? 'http://127.0.0.1:8080';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const suffix = Date.now().toString(36);
const tag = `Selección territorial ${suffix}`;
const groupName = `Grupo Terra Draw ${suffix}`;
const names = ['A', 'B', 'C'].map(letter => `Mapa selección ${letter} ${suffix}`);
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(15_000);
const browserErrors = [];
const voterRequests = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('response', (response) => { if (/\/voters(?:\?|$)/.test(response.url())) voterRequests.push(`${response.status()} ${response.url()}`); });

try {
  console.log('Selección E2E: iniciando sesión Firebase real…');
  await page.goto(app, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  const selector = page.getByRole('button', { name: /Cambiar campaña activa:/ });
  await selector.waitFor();
  await page.waitForFunction(button => !button.disabled, await selector.elementHandle());
  const campId = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cloudsuite.activeCampaign.'))?.[1]);
  if (!campId) throw new Error('No se encontró la campaña activa del usuario E2E.');
  const { db } = await import('../../server/dist/config/firebase.js');
  const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  if (profile.empty) throw new Error('No se encontró el perfil E2E en Firestore.');
  const orgId = profile.docs[0].data().orgIds?.[0];
  const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, returnSecureToken: true }) });
  const auth = await authResponse.json();
  if (!auth.idToken) throw new Error(`Firebase Auth no devolvió token para la prueba: ${JSON.stringify(auth)}`);
  const headers = { Authorization: `Bearer ${auth.idToken}`, 'content-type': 'application/json' };
  const coordinates = [{ lat: -31.4168, lng: -64.1835 }, { lat: -31.4162, lng: -64.1828 }, { lat: -31.4173, lng: -64.1824 }];
  const created = [];
  for (let index = 0; index < names.length; index += 1) {
    const response = await fetch(`${api}/api/organizations/${orgId}/campaigns/${campId}/voters`, { method: 'POST', headers, body: JSON.stringify({ name: names[index], address: `Selección E2E ${suffix} ${index + 1}, Córdoba`, ...coordinates[index] }) });
    if (response.status !== 201) throw new Error(`No se pudo crear el elector de selección: ${response.status} ${await response.text()}`);
    created.push(await response.json());
  }
  console.log(`Selección E2E: creados=${JSON.stringify(created.map(item => ({ id: item.id, name: item.name, lat: item.lat, lng: item.lng })))}`);

  console.log('Selección E2E: tres electores reales creados; abriendo el mapa…');

  await page.goto(`${app}/electoral-conversion/mapa`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  if (browserErrors.length) throw new Error(`El mapa produjo errores de navegador: ${browserErrors.join(' | ')}`);
  console.log(`Selección E2E: estado inicial=${(await page.locator('body').innerText()).slice(-600)}`);
  console.log(`Selección E2E: mapa DOM=${await page.locator('[data-google-map-status]').count()} rect=${JSON.stringify(await page.locator('[data-google-map-status]').first().evaluate(node => ({ status: node.getAttribute('data-google-map-status'), rect: node.getBoundingClientRect().toJSON(), display: getComputedStyle(node).display })))}`);
  const map = page.locator('[data-google-map-status]');
  await page.waitForFunction(() => ['ready', 'error', 'missing'].includes(document.querySelector('[data-google-map-status]')?.getAttribute('data-google-map-status') ?? ''), { timeout: 30_000 });
  if (await page.locator('[data-google-map-status]').getAttribute('data-google-map-status') !== 'ready') throw new Error(`Google Maps no quedó listo: ${await page.locator('[data-google-map-status]').getAttribute('data-google-map-status')}`);
  await page.waitForFunction(() => Number(document.querySelector('[data-google-map-status]')?.getAttribute('data-google-map-marker-count') ?? '0') >= 3, { timeout: 30_000 }).catch(() => { throw new Error(`El mapa no recibió electores tras cargar: ${voterRequests.join(' | ') || 'sin respuesta de /voters'}`); });
  await page.waitForTimeout(500);
  const search = page.getByLabel('Buscar elector en el mapa');
  await search.fill(suffix);
  await page.waitForTimeout(750);
  await page.waitForFunction(() => document.querySelector('[data-google-map-status]')?.getAttribute('data-google-map-marker-count') === '3', { timeout: 30_000 });
  const layersTitle = page.getByText('Capas del mapa', { exact: true });
  const searchBox = await search.boundingBox(); const layersBox = await layersTitle.boundingBox();
  if (!searchBox || !layersBox || searchBox.y + searchBox.height > layersBox.y) throw new Error('El buscador no quedó visualmente arriba del filtro de capas.');

  console.log('Selección E2E: buscador lateral confirmado; activando dibujo…');

  await page.getByRole('button', { name: 'Dibujar selección', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar dibujo', exact: true }).waitFor();
  await page.waitForTimeout(500);
  const mapBox = await map.boundingBox();
  if (!mapBox) throw new Error('No pudimos medir el lienzo del mapa para trazar el polígono.');
  const inset = 36;
  const vertices = [[mapBox.x + inset, mapBox.y + inset], [mapBox.x + mapBox.width - inset, mapBox.y + inset], [mapBox.x + mapBox.width - inset, mapBox.y + mapBox.height - inset], [mapBox.x + inset, mapBox.y + mapBox.height - inset], [mapBox.x + inset, mapBox.y + inset]];
  for (const [vertexX, vertexY] of vertices) await page.mouse.click(vertexX, vertexY);
  await page.getByRole('region', { name: 'Resultado de selección' }).waitFor();
  console.log(`Selección E2E: resultado=${await page.getByRole('region', { name: 'Resultado de selección' }).innerText()}`);
  await page.getByText('3 electores encontrados', { exact: true }).waitFor();
  await page.getByLabel('Etiqueta en bloque').fill(tag);
  await page.getByRole('button', { name: 'Etiquetar en bloque', exact: true }).click();
  await page.getByText('3 electores actualizados.', { exact: true }).waitFor();
  console.log('Selección E2E: polígono y actualización en bloque realizados; leyendo Firestore…');
  const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(campId);
  const stored = await Promise.all(created.map(item => campaign.collection('voters').doc(item.id).get()));
  if (!stored.every(doc => Array.isArray(doc.data()?.tags) && doc.data().tags.includes(tag))) throw new Error('Firestore no confirmó la etiqueta aplicada en bloque a los tres electores.');
  await page.getByLabel('Nombre del grupo').fill(groupName);
  await page.getByRole('button', { name: 'Crear grupo desde esta selección', exact: true }).click();
  await page.getByRole('tab', { name: /Grupos/ }).waitFor();
  await page.getByText(groupName, { exact: true }).waitFor();
  await page.waitForFunction(() => Number(document.querySelector('[data-google-map-status]')?.getAttribute('data-google-map-polygon-count') ?? '0') >= 1);
  const groupSnapshot = await campaign.collection('zones').where('name', '==', groupName).limit(1).get();
  const groupData = groupSnapshot.docs[0]?.data();
  if (groupSnapshot.empty || groupData?.source !== 'map_group' || !Array.isArray(groupData.polygon) || groupData.polygon.length < 3) throw new Error('Firestore no confirmó el grupo creado desde el polígono Terra Draw.');
  console.log(`Selección E2E: grupo persistente ${groupSnapshot.docs[0].id} verificado en Firestore.`);
  await mkdir(fileURLToPath(new URL('../.screenshots/', import.meta.url)), { recursive: true });
  await page.screenshot({ path: resolve(fileURLToPath(new URL('../.screenshots/', import.meta.url)), 'map-selection-e2e-real.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Capas', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSearch = await search.boundingBox(); const drawButton = await page.getByRole('button', { name: 'Dibujar selección', exact: true }).boundingBox();
  if (!mobileSearch || !drawButton || !(mobileSearch.y + mobileSearch.height < drawButton.y || drawButton.y + drawButton.height < mobileSearch.y)) throw new Error('En mobile el buscador se superpone con el control de dibujo.');
  console.log(`Selección territorial E2E real OK: polígono trazado, ${created.length} electores etiquetados y Firestore verificado.`);
} finally {
  await browser.close();
}
