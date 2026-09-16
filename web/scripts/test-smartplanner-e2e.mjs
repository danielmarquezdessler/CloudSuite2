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
  page.on('response', (response) => { if (response.status() >= 400) console.error(`[http ${response.status()}] ${response.request().method()} ${response.url()}`); });
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
  if (await page.getByText('Este addon no está habilitado en tu plan').count()) throw new Error('El contexto conservó un gate obsoleto después de que Firestore habilitó SmartPlanner.');
  await page.locator('.cloudsuite-sidebar-addon.is-enabled a[href="/smartplanner"]').waitFor();
  for (const title of ['Plan de trabajo', 'Estado de la campaña', 'Próximas entregas', 'Cuartel de campaña', 'Control de tope legal y presupuesto', 'Jornada electoral', 'Centro de Comunicaciones', 'Roles SmartPlanner']) await page.getByRole('heading', { name: title, exact: true }).last().waitFor();
  const homeAudit = await page.evaluate(() => {
    const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
    const cards = [...document.querySelectorAll('[data-card="true"]')].filter(visible); const headers = [...document.querySelectorAll('[data-card-header="true"]')].filter(visible);
    return { cards: cards.length, paddingFailures: cards.filter((element) => { const style = getComputedStyle(element); return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].some((value) => Number.parseFloat(value) < 12); }).length, headers: headers.length, headerGapFailures: headers.filter((element) => { const next = element.nextElementSibling; return next && visible(next) && next.getBoundingClientRect().top - element.getBoundingClientRect().bottom + .5 < 16; }).length };
  });
  if (homeAudit.paddingFailures || homeAudit.headerGapFailures) throw new Error(`Padding audit SmartPlanner Home falló: ${JSON.stringify(homeAudit)}`);
  console.log(`Padding audit SmartPlanner Home OK: cards=${homeAudit.cards}, headers=${homeAudit.headers}, paddingFailures=0, headerGapFailures=0.`);
  for (const defaultArea of ['Estrategia', 'Comunicación', 'Avanzada y Logística', 'Finanzas', 'Jurídico']) await page.getByRole('button', { name: new RegExp(defaultArea) }).first().waitFor();
  const areaOrder = await page.locator('.sp-home__area-title strong').allTextContents();
  const expectedAreaOrder = ['Estrategia', 'Comunicación', 'Avanzada y Logística', 'Finanzas', 'Jurídico'];
  if (areaOrder.slice(0, expectedAreaOrder.length).join('|') !== expectedAreaOrder.join('|')) throw new Error(`El orden de los tableros no es fijo: ${areaOrder.join(', ')}.`);
  console.log('Orden real OK: Estrategia, Comunicación, Avanzada y Logística, Finanzas y Jurídico.');
  const seeded = await orgRef.collection('campaigns').doc(campId).collection('spAreas').get();
  if (seeded.size !== 5) throw new Error(`Se esperaban 5 áreas iniciales; Firestore devolvió ${seeded.size}.`);
  console.log('Seed real OK: las cinco áreas estratégicas quedaron creadas en Firestore.');

  const title = `E2E SmartPlanner ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
  await page.locator('.modal .btn-close').waitFor({ state: 'visible' });
  await page.getByLabel('Título de tarea').fill(title);
  const creation = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/tasks$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Crear tarea', exact: true }).click();
  const creationResponse = await creation;
  if (creationResponse.status() !== 201) throw new Error('La API no creó la tarea de SmartPlanner.');
  const toast = page.getByRole('status').filter({ hasText: 'Tarea creada en el cuartel.' });
  await toast.waitFor({ state: 'visible' });
  const toastBox = await toast.boundingBox();
  if (!toastBox || toastBox.y > 180) throw new Error(`El toast no se mostró arriba a la derecha: ${JSON.stringify(toastBox)}.`);
  await toast.waitFor({ state: 'hidden', timeout: 6_000 });
  console.log('Toast real OK: aparece arriba a la derecha y se cierra automáticamente.');
  await page.getByText(title, { exact: true }).first().waitFor();
  const createdTask = await creationResponse.json();
  const task = await orgRef.collection('campaigns').doc(campId).collection('spTasks').doc(createdTask.id).get();
  if (!task.exists || task.data()?.title !== title) throw new Error('El PBI creado no llegó a Firestore.');
  if (!/^PBI-\d+$/.test(String(task.data()?.displayId ?? ''))) throw new Error(`El PBI no recibió un displayId legible: ${task.data()?.displayId ?? 'sin valor'}.`);
  createdTaskIds.push(task.id);
  const move = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/smartplanner/tasks/${task.id}`));
  const draggableTask = page.locator(`[data-kanban-task="${task.id}"]`);
  const inProgressColumn = page.locator('[data-kanban-column="en_progreso"]');
  await draggableTask.scrollIntoViewIfNeeded();
  await inProgressColumn.scrollIntoViewIfNeeded();
  const sourceBox = await draggableTask.boundingBox(); const targetBox = await inProgressColumn.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('No pudimos ubicar la tarjeta o la columna para el arrastre real.');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 3);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 3 + 12, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
  if (!(await move).ok()) throw new Error('No se pudo mover la tarea en la API real.');
  if ((await task.ref.get()).data()?.status !== 'en_progreso') throw new Error('El estado movido no persistió en Firestore.');
  console.log('Kanban real OK: tarea arrastrada con mouse a En progreso, con persistencia en Firestore.');

  await page.getByRole('button', { name: /Estrategia/ }).first().click();
  await page.locator('#smartplanner-board').scrollIntoViewIfNeeded();
  await page.getByRole('heading', { name: /Tablero de/ }).waitFor();
  console.log('Home real OK: los ocho paneles se alimentan de las consultas reales y el área navega a su tablero.');

  const roleSelect = page.getByLabel(`Rol de ${memberLabel}`);
  await roleSelect.click();
  await page.getByRole('option', { name: 'Project Manager', exact: true }).click();
  await page.waitForFunction(() => document.body.textContent?.includes('Rol actualizado.'));
  if ((await memberRef.get()).data()?.smartPlannerRole !== 'pm') throw new Error('El rol PM no se persistió en Firestore.');
  console.log('Roles reales OK: el rol Project Manager se guardó y se reflejó en la UI.');
  await page.goto(`${webUrl}/smartplanner/tickets`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Regresar a inicio').last().waitFor();
  console.log('E2E SmartPlanner OK: gate, seed, Home, Kanban, roles y regreso verificadas contra Firebase y la API reales.');
} finally {
  await browser?.close();
  await restore?.();
  vite?.kill();
}
