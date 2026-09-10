import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const host = '127.0.0.1';
const apiPort = 8090;
const webPort = 5192;
const apiUrl = `http://${host}:${apiPort}`;
const webUrl = `http://${host}:${webPort}`;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

function waitForOutput(child, expression, label) {
  return new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} no inició dentro de 30 segundos.`)), 30000);
    const read = chunk => { if (expression.test(chunk.toString())) { clearTimeout(timeout); resolveReady(); } };
    child.stdout.on('data', read); child.stderr.on('data', read); child.once('error', reject);
  });
}

async function indexedDbCounts(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolveOpen, rejectOpen) => {
      const request = indexedDB.open('cloudsuite-offline');
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () => rejectOpen(request.error);
    });
    const count = store => new Promise((resolveCount, rejectCount) => {
      const request = database.transaction(store, 'readonly').objectStore(store).count();
      request.onsuccess = () => resolveCount(request.result);
      request.onerror = () => rejectCount(request.error);
    });
    const result = { queue: await count('visitQueue'), drafts: await count('visitDrafts'), voters: await count('voters') };
    database.close();
    return result;
  });
}

async function fillVisit(page, decision) {
  await page.getByText('Paso 1 de 4').waitFor();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 2 de 4').waitFor();
  for (const input of await page.locator('input.form-control:visible').all()) await input.fill('Respuesta offline E2E');
  const radioNames = await page.locator('input[type=radio]:visible').evaluateAll(inputs => [...new Set(inputs.map(input => input.getAttribute('name')).filter(Boolean))]);
  for (const name of radioNames) await page.locator(`input[type=radio][name="${name}"]:visible`).first().check();
  const checkboxNames = await page.locator('input[type=checkbox]:visible').evaluateAll(inputs => [...new Set(inputs.map(input => input.getAttribute('name')).filter(Boolean))]);
  for (const name of checkboxNames) await page.locator(`input[type=checkbox][name="${name}"]:visible`).first().check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 3 de 4').waitFor();
  await page.getByLabel('Observaciones de la visita').fill(`Notas offline ${decision}`);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByText('Paso 4 de 4').waitFor();
  await page.getByRole('button', { name: decision === 'yes' ? 'SI' : 'INDECISO', exact: true }).click();
}

let apiProcess;
let webProcess;
let browser;
try {
  apiProcess = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: String(apiPort), PROJECT_ID: 'politicfy-cloudsuite' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForOutput(apiProcess, /CloudSuite server listening/, 'La API real');
  webProcess = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(webPort)], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForOutput(webProcess, new RegExp(webUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Vite');
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/electoral-conversion/voters`);
  await page.locator('tbody tr').first().waitFor();
  let offlineNames = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.children[0]?.textContent?.trim() ?? '').filter(name => name.startsWith('Elector offline ')));
  if (offlineNames.length < 2) {
    const suffix = Date.now().toString(36);
    const newYes = `Elector offline SI ${suffix}`;
    const newUndecided = `Elector offline Indeciso ${suffix}`;
    await page.getByRole('button', { name: 'Importar electores', exact: true }).first().click();
    await page.locator('input[type=file]').setInputFiles({ name: 'offline-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(`Nombre,Dirección,Teléfono\n${newYes},Av. Colón 1000 Córdoba,3515550101\n${newUndecided},Av. Colón 1100 Córdoba,3515550102\n`) });
    await page.getByRole('button', { name: 'Importar', exact: true }).click();
    await page.locator('.alert-success').filter({ hasText: /Importados/i }).waitFor({ timeout: 90000 }); await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByText(newYes, { exact: true }).waitFor(); await page.getByText(newUndecided, { exact: true }).waitFor();
    offlineNames = [newYes, newUndecided];
  }
  const yesName = offlineNames.find(name => name.includes(' SI ')) ?? offlineNames[0];
  const undecidedName = offlineNames.find(name => name.includes(' Indeciso ')) ?? offlineNames[1];
  const cachedBefore = await indexedDbCounts(page);
  if (cachedBefore.voters < 2) throw new Error(`La lista de electores no quedó cacheada en IndexedDB: ${JSON.stringify(cachedBefore)}`);

  async function exerciseOffline(name, decision) {
    const row = page.locator('tr').filter({ hasText: name });
    await row.getByRole('button', { name: 'Visitar', exact: true }).click();
    await context.setOffline(true);
    await page.getByText('Sin conexión — tu trabajo se guarda localmente.', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(screenshots, `offline-${decision}-indicator.png`), fullPage: true });
    await fillVisit(page, decision);
    await page.waitForURL(/electoral-conversion\/voters/);
    const pending = await indexedDbCounts(page);
    if (pending.queue < 3 || pending.drafts < 1) throw new Error(`La visita offline no quedó persistida completamente: ${JSON.stringify(pending)}`);
    await page.screenshot({ path: resolve(screenshots, `offline-${decision}-pending.png`), fullPage: true });
    const conversionRequest = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/conversion') && response.status() === 204);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await conversionRequest;
    await page.waitForFunction(async () => {
      const database = await new Promise((resolveOpen, rejectOpen) => { const request = indexedDB.open('cloudsuite-offline'); request.onsuccess = () => resolveOpen(request.result); request.onerror = () => rejectOpen(request.error); });
      const count = await new Promise((resolveCount, rejectCount) => { const request = database.transaction('visitQueue', 'readonly').objectStore('visitQueue').count(); request.onsuccess = () => resolveCount(request.result); request.onerror = () => rejectCount(request.error); });
      database.close(); return count === 0;
    });
    const synced = await indexedDbCounts(page);
    if (synced.queue !== 0) throw new Error(`La cola no se vació tras reconectar: ${JSON.stringify(synced)}`);
    await page.goto(`${webUrl}/electoral-conversion/voters`); await page.locator('tr').filter({ hasText: name }).waitFor();
    return synced;
  }

  await exerciseOffline(yesName, 'yes');
  await exerciseOffline(undecidedName, 'undecided');
  await page.goto(`${webUrl}/execution/undecided`); await page.locator('tr').filter({ hasText: undecidedName }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'offline-visit-synced.png'), fullPage: true });
  console.log(`E2E offline real OK: ${yesName} (SI) y ${undecidedName} (Indeciso) persistieron sin red y se sincronizaron a Firestore al reconectar.`);
} finally {
  await browser?.close();
  webProcess?.kill();
  apiProcess?.kill();
}
