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
const groupName = `Concejo Deliberante ${suffix}`;
const titularNames = [1, 2, 3].map((index) => `Titular Concejo ${index} ${suffix}`);
const suplenteNames = [1, 2].map((index) => `Suplente Concejo ${index} ${suffix}`);
const existingName = `Candidato existente ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(10_000);

async function choose(control, label) {
  await page.locator(control).click();
  await page.locator('.cd-select-dropdown__menu').getByRole('button', { name: label, exact: true }).click();
}

async function createCandidate(name, role) {
  await page.getByRole('button', { name: 'Agregar candidato', exact: true }).first().click();
  await page.locator('#candidate-name').fill(name);
  await choose('#candidate-type', 'Concejal');
  await choose('#candidate-group', groupName);
  await choose('#candidate-slate-role', role === 'titular' ? 'Titular' : 'Suplente');
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/candidates$/.test(new URL(response.url()).pathname) && response.status() === 201);
  const slate = page.waitForResponse((response) => response.request().method() === 'PUT' && /\/candidates\/[^/]+\/slate$/.test(new URL(response.url()).pathname) && response.ok());
  await page.getByRole('button', { name: 'Guardar candidato', exact: true }).click();
  const candidate = await (await created).json(); await slate;
  await page.getByText(name, { exact: true }).waitFor();
  return candidate;
}

async function createUngroupedCandidate(name) {
  await page.getByRole('button', { name: 'Agregar candidato', exact: true }).first().click();
  await page.locator('#candidate-name').fill(name);
  await choose('#candidate-type', 'Concejal');
  const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/candidates$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar candidato', exact: true }).click();
  const candidate = await (await created).json();
  await page.getByText(name, { exact: true }).waitFor();
  return candidate;
}

try {
  console.log('E2E grupos de candidatos: login Firebase real');
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${app}/organization/candidates`);
  await page.getByRole('heading', { name: 'Candidatos', exact: true }).waitFor();

  const { db } = await import('../../server/dist/config/firebase.js');
  const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  if (profile.empty) throw new Error('No se encontró el perfil E2E en Firestore.');
  const orgId = profile.docs[0].data().orgIds?.[0];
  const campaignId = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cloudsuite.activeCampaign.'))?.[1] ?? '');
  if (!orgId || !campaignId) throw new Error('No se pudo determinar la campaña activa E2E.');
  const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(campaignId);
  const principalBefore = (await campaign.collection('candidates').where('isPrincipal', '==', true).get()).docs.map((item) => item.id).sort().join(',');

  console.log('E2E grupos de candidatos: creando grupo real desde UI');
  await page.getByRole('button', { name: 'Crear grupo', exact: true }).click();
  await page.locator('#candidate-group-name').fill(groupName);
  const groupResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/candidate-groups$/.test(new URL(response.url()).pathname) && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click();
  const group = await (await groupResponse).json();

  console.log('E2E grupos de candidatos: creando tres titulares y dos suplentes reales');
  const titulars = []; for (const name of titularNames) titulars.push(await createCandidate(name, 'titular'));
  const suplentes = []; for (const name of suplenteNames) suplentes.push(await createCandidate(name, 'suplente'));
  const existing = await createUngroupedCandidate(existingName);

  await page.getByRole('tab', { name: 'Listas y grupos', exact: true }).click();
  await choose('[aria-label="Elegir lista de candidatos"]', `${groupName} · 3 titulares · 2 suplentes`);
  await page.getByText('Titulares', { exact: true }).waitFor();
  for (const name of [...titularNames, ...suplenteNames]) await page.getByText(name, { exact: true }).waitFor();
  const firstTitle = await page.getByText(titularNames[0], { exact: true }).count();
  const secondTitle = await page.getByText(titularNames[1], { exact: true }).count();
  if (firstTitle !== 1 || secondTitle !== 1) throw new Error('La lista no renderizó los titulares esperados en la vista de dos columnas.');

  console.log('E2E grupos de candidatos: reordenando un titular y verificando Firestore');
  await page.getByRole('button', { name: `Bajar a ${titularNames[0]}`, exact: true }).click();
  await page.locator('.cd-slate-candidate', { hasText: titularNames[0] }).getByText(/Orden 2/, { exact: false }).waitFor();
  const assigned = await Promise.all([...titulars, ...suplentes].map((candidate) => campaign.collection('candidates').doc(candidate.id).get()));
  const docs = assigned.map((snapshot) => snapshot.data());
  if (docs.filter((data) => data?.groupId === group.id && data?.slateRole === 'titular').length !== 3 || docs.filter((data) => data?.groupId === group.id && data?.slateRole === 'suplente').length !== 2) throw new Error(`Firestore no conservó 3 titulares y 2 suplentes: ${JSON.stringify(docs)}`);
  if (docs[0]?.order !== 2 || docs[1]?.order !== 1) throw new Error(`El orden reordenado no persistió en Firestore: titular1=${docs[0]?.order}, titular2=${docs[1]?.order}`);
  console.log('E2E grupos de candidatos: asignando un candidato existente desde la lista');
  await page.getByRole('button', { name: 'Agregar candidatos existentes', exact: true }).click();
  await choose('#existing-candidate', existingName);
  await choose('#existing-candidate-role', 'Suplente');
  const assignmentResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith(`/candidates/${existing.id}/slate`) && response.ok());
  await page.getByRole('button', { name: 'Agregar a la lista', exact: true }).click();
  await assignmentResponse;
  await page.locator('.cd-slate-candidate', { hasText: existingName }).waitFor();
  const assignedExisting = await campaign.collection('candidates').doc(existing.id).get();
  if (assignedExisting.data()?.groupId !== group.id || assignedExisting.data()?.slateRole !== 'suplente') throw new Error(`El candidato existente no quedó asignado a la lista: ${JSON.stringify(assignedExisting.data())}`);
  const principalAfter = (await campaign.collection('candidates').where('isPrincipal', '==', true).get()).docs.map((item) => item.id).sort().join(',');
  if (principalAfter !== principalBefore) throw new Error(`La gestión de listas alteró el candidato Principal: antes=${principalBefore}, después=${principalAfter}`);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'candidate-groups-e2e-real.png'), fullPage: true });
  console.log(`Grupos E2E real OK: ${groupName}; 3 titulares, 2 suplentes, candidato existente agregado, orden persistido y Principal sin cambios.`);
} finally {
  await browser.close();
}
