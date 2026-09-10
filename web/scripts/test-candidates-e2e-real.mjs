import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const photoFixture = 'C:/Users/Admin/Documents/PoliticFY/Logo/cloud-suite-fav-icon.png';
const voterFixture = fileURLToPath(new URL('./fixtures/execution-voter.csv', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36);
const campaignName = `Campaña candidatos E2E ${suffix}`;
const juan = `Juan Candidato ${suffix}`;
const maria = `María Candidata ${suffix}`;

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);

async function selectCandidateType(value) {
  await page.locator('#candidate-type').click();
  await page.locator('.cd-select-dropdown__menu').getByRole('button', { name: value, exact: true }).click();
}

async function createCandidate({ name, type, photo = false }) {
  await page.getByRole('button', { name: 'Agregar candidato', exact: true }).first().click();
  await page.locator('#candidate-name').fill(name);
  await selectCandidateType(type);
  if (photo) {
    await page.locator('#candidate-photo').setInputFiles(photoFixture);
    await page.getByRole('button', { name: 'Confirmar recorte', exact: true }).click();
    await page.getByText('Foto lista para subir', { exact: true }).waitFor();
  }
  const response = page.waitForResponse((candidateResponse) => candidateResponse.request().method() === 'POST' && /\/candidates$/.test(new URL(candidateResponse.url()).pathname) && candidateResponse.status() === 201);
  await page.getByRole('button', { name: 'Guardar candidato', exact: true }).click();
  const created = await (await response).json();
  await page.getByText(name, { exact: true }).waitFor();
  return created;
}

async function completeYesVisit(expectedQuestion) {
  await page.goto(`${app}/electoral-conversion/voters`);
  await page.getByRole('button', { name: 'Importar electores', exact: true }).first().click();
  await page.locator('input[type=file]').setInputFiles(voterFixture);
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await page.getByText(/Importados|duplicados/i).waitFor();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const voterRow = page.locator('tr', { hasText: 'Elector Ejecución Real' }).last();
  await voterRow.getByRole('button', { name: 'Visitar', exact: true }).click();
  await page.getByText('Paso 1 de 4').waitFor();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 2 de 4').waitFor();
  for (const input of await page.locator('input.form-control:visible').all()) await input.fill('respuesta candidatos E2E');
  const radioNames = await page.locator('input[type=radio]:visible').evaluateAll((inputs) => [...new Set(inputs.map((input) => input.getAttribute('name')).filter(Boolean))]);
  for (const name of radioNames) await page.locator(`input[type=radio][name="${name}"]:visible`).first().check();
  const checkboxNames = await page.locator('input[type=checkbox]:visible').evaluateAll((inputs) => [...new Set(inputs.map((input) => input.getAttribute('name')).filter(Boolean))]);
  for (const name of checkboxNames) await page.locator(`input[type=checkbox][name="${name}"]:visible`).first().check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 3 de 4').waitFor();
  await page.locator('textarea:visible').fill('Visita real para candidato Principal');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 4 de 4').waitFor();
  await page.getByRole('heading', { name: expectedQuestion, exact: true }).waitFor();
  await page.getByRole('button', { name: 'SI', exact: true }).click();
  await page.waitForURL(/electoral-conversion\/voters/);
}

try {
  console.log('E2E candidatos: login Firebase real');
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  console.log('E2E candidatos: creando campaña aislada real');
  await page.goto(`${app}/organization/campaigns`);
  await page.getByRole('button', { name: 'Crear nueva campaña', exact: true }).first().click();
  await page.locator('#campaign-name').fill(campaignName);
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click();
  await page.getByText(campaignName, { exact: true }).waitFor();
  await page.getByRole('button', { name: /Cambiar campaña activa:/ }).click();
  const campaignDialog = page.getByRole('dialog', { name: 'Campaña activa' });
  await campaignDialog.getByText(campaignName, { exact: true }).click();
  await campaignDialog.waitFor({ state: 'hidden' });

  console.log('E2E candidatos: creando Juan con foto real y María');
  await page.goto(`${app}/organization/candidates`);
  await page.getByRole('heading', { name: 'Candidatos', exact: true }).waitFor();
  const juanResult = await createCandidate({ name: juan, type: 'Intendente', photo: true });
  const mariaResult = await createCandidate({ name: maria, type: 'Gobernador' });
  await page.getByRole('img', { name: `Foto de ${juan}`, exact: true }).waitFor();

  const { db, storage } = await import('../../server/dist/config/firebase.js');
  const users = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get();
  if (users.empty) throw new Error('No se encontró el perfil del usuario E2E en Firestore.');
  const orgId = users.docs[0].data().orgIds?.[0];
  const campaigns = await db.collection('organizations').doc(orgId).collection('campaigns').where('nombre', '==', campaignName).limit(1).get();
  if (campaigns.empty) throw new Error('No se encontró la campaña aislada creada por la interfaz.');
  const campId = campaigns.docs[0].id;
  const storedPhoto = await storage.bucket().file(`candidates/${juanResult.id}.jpg`).exists();
  if (!storedPhoto[0]) throw new Error('La foto del candidato no quedó almacenada en Firebase Storage.');
  const juanDoc = await campaigns.docs[0].ref.collection('candidates').doc(juanResult.id).get();
  if (juanDoc.data()?.type !== 'Intendente' || !juanDoc.data()?.photoUrl?.startsWith('gs://')) throw new Error('El documento de Juan no guardó el tipo o la referencia de Storage esperados.');

  console.log('E2E candidatos: definiendo a Juan como Principal sin confirmación');
  const juanRow = page.locator('tr', { hasText: juan });
  await juanRow.getByRole('button', { name: 'Marcar como Principal', exact: true }).click();
  await page.getByText('Principal', { exact: true }).waitFor();
  if (!(await campaigns.docs[0].ref.collection('candidates').doc(juanResult.id).get()).data()?.isPrincipal) throw new Error('Juan no quedó marcado como Principal en Firestore.');

  console.log('E2E candidatos: registrando una visita real y verificando el texto dinámico');
  await completeYesVisit(`¿Vota a ${juan} para Intendente?`);
  const voterSnapshot = await campaigns.docs[0].ref.collection('voters').where('name', '==', 'Elector Ejecución Real').limit(1).get();
  if (voterSnapshot.empty) throw new Error('La importación real no creó el elector de prueba.');
  const voter = voterSnapshot.docs[0];
  const visitsBeforeReset = await campaigns.docs[0].ref.collection('visits').where('voterId', '==', voter.id).get();
  if (visitsBeforeReset.empty || voter.data().state !== 'converted_yes' || voter.data().conversions?.yes < 1) throw new Error(`La visita real no actualizó el elector como SI: ${JSON.stringify(voter.data())}`);

  console.log('E2E candidatos: solicitando cambio de Principal y confirmando reinicio');
  await page.goto(`${app}/organization/candidates`);
  const mariaRow = page.locator('tr', { hasText: maria });
  const confirmationResponse = page.waitForResponse((candidateResponse) => candidateResponse.request().method() === 'POST' && new URL(candidateResponse.url()).pathname.endsWith(`/candidates/${mariaResult.id}/set-principal`));
  await mariaRow.getByRole('button', { name: 'Marcar como Principal', exact: true }).click();
  const confirmationResult = await confirmationResponse;
  if (confirmationResult.status() !== 409) throw new Error(`El cambio de Principal con visitas debía pedir confirmación y respondió HTTP ${confirmationResult.status()}: ${await confirmationResult.text()}`);
  await page.locator('#candidate-reset-confirmation').waitFor({ state: 'visible' });
  await page.locator('#candidate-reset-confirmation').fill('REINICIAR');
  const resetResponse = page.waitForResponse((candidateResponse) => candidateResponse.request().method() === 'POST' && new URL(candidateResponse.url()).pathname.endsWith(`/candidates/${mariaResult.id}/set-principal`));
  await page.getByRole('button', { name: 'Reiniciar y cambiar Principal', exact: true }).click();
  const resetResult = await resetResponse;
  if (!resetResult.ok()) throw new Error(`El cambio confirmado de Principal falló: HTTP ${resetResult.status()} ${await resetResult.text()}`);
  await page.locator('#candidate-reset-confirmation').waitFor({ state: 'hidden' });
  const resetVoter = await voter.ref.get();
  const historicalVisits = await campaigns.docs[0].ref.collection('visits').where('voterId', '==', voter.id).get();
  if (resetVoter.data()?.state !== 'unvisited' || resetVoter.data()?.conversions?.yes !== 0 || resetVoter.data()?.conversions?.no !== 0 || resetVoter.data()?.conversions?.undecided !== 0 || historicalVisits.size !== visitsBeforeReset.size) throw new Error(`El reinicio no conservó las visitas históricas o no dejó métricas en cero: ${JSON.stringify(resetVoter.data())}`);
  const mariaDoc = await campaigns.docs[0].ref.collection('candidates').doc(mariaResult.id).get();
  if (!mariaDoc.data()?.isPrincipal || (await juanDoc.ref.get()).data()?.isPrincipal) throw new Error('El cambio de Principal no se reflejó correctamente en Firestore.');
  await page.goto(`${app}/dashboard`);
  const yesKpi = page.locator('.cd-kpi-card').filter({ hasText: 'Conversiones SI' }).locator('.cd-kpi-card__value');
  await yesKpi.waitFor();
  if ((await yesKpi.textContent())?.trim() !== '0') throw new Error(`El Dashboard siguió incluyendo visitas previas al cambio de Principal: Conversiones SI=${await yesKpi.textContent()}`);
  await page.goto(`${app}/organization/candidates`);
  await page.getByRole('heading', { name: 'Candidatos', exact: true }).waitFor();
  await page.locator('tr', { hasText: maria }).waitFor();
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'candidates-e2e-real.png'), fullPage: true });
  console.log(`Candidatos E2E real OK: campaña=${campId}, foto en Storage, Principal sin reinicio, visita SI con texto dinámico y reinicio confirmado con ${historicalVisits.size} visita(s) histórica(s).`);
} finally {
  await browser.close();
}
