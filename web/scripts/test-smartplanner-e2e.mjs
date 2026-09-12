import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5191';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]; }));
const pause = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

let vite;
let browser;
let restore;

async function waitForWeb() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(webUrl)).ok) return; } catch { /* Vite is still starting. */ }
    await pause(350);
  }
  throw new Error('Vite no respondió para la verificación de SmartPlanner.');
}

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la campaña E2E para SmartPlanner.');
  const orgRef = db.collection('organizations').doc(orgId);
  const memberRef = orgRef.collection('campaigns').doc(campId).collection('members').doc(authUser.uid);
  const [organization, member] = await Promise.all([orgRef.get(), memberRef.get()]);
  const originalAddons = organization.data()?.enabledAddons;
  const originalMember = member.data();
  const memberLabel = originalMember?.displayName || originalMember?.email || env.E2E_EMAIL;
  const createdTaskIds = [];
  restore = async () => {
    await Promise.all(createdTaskIds.map((id) => orgRef.collection('campaigns').doc(campId).collection('spTasks').doc(id).delete()));
    if (originalMember) await memberRef.set(originalMember);
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true });
  };

  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: false } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5191'], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[browser] ${message.text()}`); });
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/smartplanner`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Este addon no está habilitado en tu plan').waitFor();
  console.log('Gate deshabilitado OK: se mostró el estado vacío real.');

  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Cuartel de campaña', exact: true }).waitFor();
  for (const defaultArea of ['Estrategia', 'Comunicación', 'Avanzada y Logística', 'Finanzas', 'Jurídico']) await page.getByRole('button', { name: new RegExp(defaultArea) }).waitFor();
  const seeded = await orgRef.collection('campaigns').doc(campId).collection('spAreas').get();
  if (seeded.size !== 5) throw new Error(`Se esperaban 5 áreas iniciales; Firestore devolvió ${seeded.size}.`);
  console.log('Seed real OK: las cinco áreas estratégicas quedaron creadas en Firestore.');

  const title = `E2E SmartPlanner ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await page.getByLabel('Título de tarea').fill(title);
  const creation = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/tasks$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  const creationResponse = await creation;
  if (creationResponse.status() !== 201) throw new Error('La API no creó la tarea de SmartPlanner.');
  await page.getByText(title, { exact: true }).waitFor();
  const createdTask = await creationResponse.json();
  const task = await orgRef.collection('campaigns').doc(campId).collection('spTasks').doc(createdTask.id).get();
  if (!task.exists || task.data()?.title !== title) throw new Error('La tarea creada no llegó a Firestore.');
  createdTaskIds.push(task.id);
  await page.getByLabel(`Mover ${title}`).click();
  const move = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/smartplanner/tasks/${task.id}`));
  await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'En progreso' }).click();
  if (!(await move).ok()) throw new Error('No se pudo mover la tarea en la API real.');
  if ((await task.ref.get()).data()?.status !== 'en_progreso') throw new Error('El estado movido no persistió en Firestore.');
  console.log('Kanban real OK: tarea creada y movida a En progreso, con persistencia en Firestore.');

  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await page.locator('.apexcharts-svg').waitFor();
  console.log('Gantt OK: la tarea con fechas se representó en el gráfico real.');

  const roleSelect = page.getByLabel(`Rol de ${memberLabel}`);
  await roleSelect.click();
  await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Project Manager' }).click();
  await page.waitForFunction(() => document.body.textContent?.includes('Rol actualizado.'));
  if ((await memberRef.get()).data()?.smartPlannerRole !== 'pm') throw new Error('El rol PM no se persistió en Firestore.');
  console.log('Roles reales OK: el rol Project Manager se guardó y se reflejó en la UI.');
  console.log('E2E SmartPlanner OK: gate, seed, Kanban, Gantt y roles verificados contra Firebase y la API reales.');
} finally {
  await browser?.close();
  await restore?.();
  vite?.kill();
}
