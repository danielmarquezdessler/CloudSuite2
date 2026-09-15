import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5192';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]; }));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

let vite; let browser; let restore;
async function waitForWeb() { for (let attempt = 0; attempt < 70; attempt += 1) { try { if ((await fetch(webUrl)).ok) return; } catch { /* Vite is booting. */ } await pause(350); } throw new Error('Vite no respondió para la verificación PBI.'); }
async function selectOption(page, label, option) { await page.getByLabel(label).click(); await page.getByRole('option', { name: option, exact: true }).click(); }

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la campaña E2E para PBI.');
  const orgRef = db.collection('organizations').doc(orgId); const campaignRef = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons; const createdTaskIds = []; const createdCategoryIds = [];
  restore = async () => { await Promise.all(createdTaskIds.map((id) => campaignRef.collection('spTasks').doc(id).delete())); await Promise.all(createdCategoryIds.map((id) => campaignRef.collection('spCategories').doc(id).delete())); await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true }); };
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5192'], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb(); browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } }); page.setDefaultTimeout(25_000);
  await page.goto(webUrl); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${webUrl}/smartplanner/backlog`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Backlog de Campaña', exact: true }).waitFor(); await page.getByRole('button', { name: 'Estrategia', exact: true }).waitFor();
  const categoryName = `Categoría E2E ${Date.now()}`; const firstTitle = `PBI E2E uno ${Date.now()}`; const secondTitle = `PBI E2E dos ${Date.now()}`;
  const createPbi = async (title, makeCategory) => { await page.getByRole('button', { name: 'Nuevo PBI', exact: true }).first().click(); await page.getByLabel('Título del PBI').fill(title); if (makeCategory) { await selectOption(page, 'Categoría del PBI', '+ Crear nueva categoría'); await page.getByLabel('Nombre de nueva categoría').fill(categoryName); const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/smartplanner\/categories$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: new RegExp(`Crear categoría.*${categoryName}`) }).click(); if (!(await created).ok()) throw new Error('La categoría no se creó mediante la API real.'); await page.waitForFunction((name) => [...document.querySelectorAll('[aria-label="Categoría del PBI"]')].some((element) => element.textContent?.includes(name)), categoryName); } else await selectOption(page, 'Categoría del PBI', categoryName); const response = page.waitForResponse((item) => item.request().method() === 'POST' && /\/smartplanner\/tasks$/.test(new URL(item.url()).pathname)); await page.getByRole('button', { name: 'Crear PBI', exact: true }).click(); if (!(await response).ok()) throw new Error('El PBI no se creó mediante la API real.'); await page.getByText(title, { exact: true }).first().waitFor(); return response; };
  const firstResponse = await createPbi(firstTitle, true); const first = await firstResponse.json(); createdTaskIds.push(first.id);
  const categorySnap = await campaignRef.collection('spCategories').where('name', '==', categoryName).get(); if (categorySnap.size !== 1) throw new Error('La categoría personalizada no llegó a Firestore.'); const categoryId = categorySnap.docs[0].id; createdCategoryIds.push(categoryId);
  const secondResponse = await createPbi(secondTitle, false); const second = await secondResponse.json(); createdTaskIds.push(second.id);
  const [firstDoc, secondDoc] = await Promise.all([campaignRef.collection('spTasks').doc(first.id).get(), campaignRef.collection('spTasks').doc(second.id).get()]);
  if (firstDoc.data()?.categoryId !== categoryId || secondDoc.data()?.categoryId !== categoryId) throw new Error('La categoría no quedó disponible para reutilizarse.');
  if (!/^PBI-\d+$/.test(String(firstDoc.data()?.displayId)) || firstDoc.data()?.displayId === secondDoc.data()?.displayId) throw new Error('Los displayId no son únicos ni legibles.');
  console.log(`Categoría y displayId reales OK: ${firstDoc.data()?.displayId}, ${secondDoc.data()?.displayId}.`);
  await page.locator('.sp-backlog__area-tabs').getByRole('button', { name: 'Comunicación', exact: true }).click(); await page.locator('[data-kanban-column="por_hacer"]').waitFor(); await page.locator('.sp-backlog__area-tabs').getByRole('button', { name: 'Estrategia', exact: true }).click();
  const drag = page.locator(`[data-kanban-task="${first.id}"]`); const target = page.locator('[data-kanban-column="en_progreso"]'); await drag.scrollIntoViewIfNeeded(); const sourceBox = await drag.boundingBox(); const targetBox = await target.boundingBox(); if (!sourceBox || !targetBox) throw new Error('No se pudo preparar el arrastre del PBI.'); const moved = page.waitForResponse((item) => item.request().method() === 'PUT' && item.url().includes(`/smartplanner/tasks/${first.id}`)); await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 18); await page.mouse.down(); await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + 30, { steps: 4 }); await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 90, { steps: 15 }); await page.mouse.up(); if (!(await moved).ok() || (await firstDoc.ref.get()).data()?.status !== 'en_progreso') throw new Error('El arrastre no persistió en Firestore.');
  await page.getByLabel('Buscar PBI').fill(firstTitle); await page.getByRole('link', { name: firstTitle, exact: true }).waitFor(); await selectOption(page, 'Filtrar PBIs por categoría', categoryName); await page.getByRole('link', { name: firstTitle, exact: true }).click(); await page.waitForURL(new RegExp(`/smartplanner/pbi/${first.id}`)); await page.getByLabel('Descripción del PBI').fill('Descripción actualizada desde E2E real.'); const saved = page.waitForResponse((item) => item.request().method() === 'PUT' && item.url().includes(`/smartplanner/tasks/${first.id}`)); await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); if (!(await saved).ok() || (await firstDoc.ref.get()).data()?.description !== 'Descripción actualizada desde E2E real.') throw new Error('El detalle de PBI no guardó en Firestore.');
  console.log('Backlog real OK: tabs, drag-and-drop, filtros, tabla, detalle y edición persistieron contra Firestore.');
} finally { await browser?.close(); await restore?.(); vite?.kill(); }
