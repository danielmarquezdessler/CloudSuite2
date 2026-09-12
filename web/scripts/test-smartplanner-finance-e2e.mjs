import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5192';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let vite; let browser; let restore;

async function waitForWeb() { for (let attempt = 0; attempt < 70; attempt += 1) { try { if ((await fetch(webUrl)).ok) return; } catch { /* Vite starting. */ } await wait(350); } throw new Error('Vite no respondió para el E2E financiero.'); }

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la campaña E2E financiera.');
  const orgRef = db.collection('organizations').doc(orgId); const campRef = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const providerIds = []; const projectIds = []; const contributorIds = [];
  restore = async () => { await Promise.all(contributorIds.map((id) => campRef.collection('spContributors').doc(id).delete())); await Promise.all(projectIds.map((id) => campRef.collection('spProviderProjects').doc(id).delete())); await Promise.all(providerIds.map((id) => campRef.collection('spProviders').doc(id).delete())); await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true }); };
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5192'], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb(); browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(25_000);
  await page.goto(webUrl); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  const contributorName = `Aportante E2E ${Date.now()}`;
  await page.goto(`${webUrl}/smartplanner/contributors`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Aportantes y Sponsors', exact: true }).waitFor(); await page.getByRole('button', { name: 'Nuevo aportante', exact: true }).click(); await page.getByLabel('Nombre').fill(contributorName); await page.getByLabel('Monto').fill('75000');
  const contributorResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/contributors$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Guardar', exact: true }).click(); const contributorCreated = await contributorResponse;
  if (contributorCreated.status() !== 201) throw new Error('La API no creó el aportante.'); const contributor = await contributorCreated.json(); contributorIds.push(contributor.id);
  if ((await campRef.collection('spContributors').doc(contributor.id).get()).data()?.stage !== 'prospecto') throw new Error('El aportante inicial no se persistió en Firestore.'); await page.getByLabel(`Mover ${contributorName}`).click(); const stageResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/smartplanner/contributors/${contributor.id}`)); await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Confirmado' }).click(); if (!(await stageResponse).ok()) throw new Error('No se pudo mover el aportante en el pipeline.');
  if ((await campRef.collection('spContributors').doc(contributor.id).get()).data()?.stage !== 'confirmado') throw new Error('La etapa confirmada no se persistió en Firestore.'); console.log(`Aportantes E2E OK: ${contributorName} creado y movido a Confirmado con persistencia real.`);
  await page.goto(`${webUrl}/smartplanner/providers`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Proveedores y contrataciones', exact: true }).waitFor();
  const providerName = `Imprenta Sur E2E ${Date.now()}`; await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click(); await page.getByLabel('Nombre del proveedor').fill(providerName);
  const providerResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/providers$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click(); const providerCreated = await providerResponse;
  if (providerCreated.status() !== 201) throw new Error('La API no creó el proveedor.'); const provider = await providerCreated.json(); providerIds.push(provider.id);
  if ((await campRef.collection('spProviders').doc(provider.id).get()).data()?.name !== providerName) throw new Error('El proveedor no se persistió en Firestore.'); await page.getByText(providerName, { exact: true }).click();
  const projectName = `Folletos E2E ${Date.now()}`; await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click(); await page.getByLabel('Título del proyecto').fill(projectName); await page.getByLabel('Presupuesto').fill('100000'); await page.getByLabel('Gasto informado').fill('25000');
  const projectResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/provider-projects$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Guardar proyecto', exact: true }).click(); const projectCreated = await projectResponse;
  if (projectCreated.status() !== 201) throw new Error('La API no creó el proyecto del proveedor.'); const project = await projectCreated.json(); projectIds.push(project.id);
  const projectDoc = await campRef.collection('spProviderProjects').doc(project.id).get(); if (projectDoc.data()?.budget !== 100000 || projectDoc.data()?.spent !== 25000) throw new Error('Presupuesto o gasto inicial no se guardaron en Firestore.');
  await page.getByRole('button', { name: 'Editar', exact: true }).click(); await page.getByLabel('Gasto informado').fill('58000'); const updateResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/smartplanner/provider-projects/${project.id}`)); await page.getByRole('button', { name: 'Guardar proyecto', exact: true }).click(); if (!(await updateResponse).ok()) throw new Error('La actualización del gasto falló.');
  if ((await projectDoc.ref.get()).data()?.spent !== 58000) throw new Error('El gasto actualizado no se persistió en Firestore.');
  console.log(`Proveedores E2E OK: ${providerName}, proyecto ${projectName}, gasto actualizado a $58.000 y verificado en Firestore.`);
} finally { await browser?.close(); await restore?.(); vite?.kill(); }
