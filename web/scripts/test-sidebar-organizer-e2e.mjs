import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5216';
const apiUrl = 'http://127.0.0.1:8116';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const pause = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Startup. */ }
    await pause(300);
  }
  throw new Error(`${label} no respondió.`);
}

async function login(page, email, password) {
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.locator('.pc-sidebar').waitFor({ state: 'visible' });
}

async function rootOrder(page) {
  return page.locator('#pc-navbar > .pc-item').evaluateAll((items) => items.map((item) => item.getAttribute('data-sidebar-module') || item.querySelector('[data-page]')?.getAttribute('data-page')).filter(Boolean));
}

async function reorder(page, fromId, toId) {
  const from = page.locator(`[data-sidebar-item="${fromId}"]`);
  const to = page.locator(`[data-sidebar-item="${toId}"]`);
  await from.waitFor();
  await to.waitFor();
  await from.dragTo(to);
}

let api; let vite; let browser; let cleanup = async () => {};
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const owner = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const ownerProfile = await db.collection('users').doc(owner.uid).get();
  const orgId = env.E2E_ORG_ID || ownerProfile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la organización/campaña para Sidebar E2E.');
  const ownerPreference = await db.collection('users').doc(owner.uid).collection('preferences').doc('sidebar').get();
  const originalPreference = ownerPreference.exists ? ownerPreference.data() : null;
  const orgRef = db.collection('organizations').doc(orgId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const teammateEmail = `sidebar-organizer-${suffix}@cloudsuite.local`;
  const teammatePassword = `Sidebar-E2E-${suffix}!`;
  const teammate = await adminAuth.createUser({ email: teammateEmail, password: teammatePassword, displayName: 'Colaborador Sidebar E2E' });
  const campaignRef = orgRef.collection('campaigns').doc(campId);

  cleanup = async () => {
    if (originalPreference) await ownerPreference.ref.set(originalPreference); else await ownerPreference.ref.delete().catch(() => undefined);
    await Promise.all([
      db.collection('users').doc(teammate.uid).collection('preferences').doc('sidebar').delete().catch(() => undefined),
      db.collection('users').doc(teammate.uid).delete().catch(() => undefined),
      orgRef.collection('members').doc(teammate.uid).delete().catch(() => undefined),
      campaignRef.collection('members').doc(teammate.uid).delete().catch(() => undefined),
      adminAuth.deleteUser(teammate.uid).catch(() => undefined),
      orgRef.set({ enabledAddons: originalAddons ?? {} }, { merge: true })
    ]);
  };
  await adminAuth.setCustomUserClaims(teammate.uid, { orgId, role: 'usuario', camps: { [campId]: true } });
  await Promise.all([
    db.collection('users').doc(teammate.uid).set({ email: teammateEmail, displayName: teammate.displayName, orgIds: [orgId] }),
    orgRef.collection('members').doc(teammate.uid).set({ role: 'usuario', createdAt: new Date() }),
    campaignRef.collection('members').doc(teammate.uid).set({ email: teammateEmail, displayName: teammate.displayName, role: 'usuario', joinedAt: new Date() }),
    orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true, voteStream: true } }, { merge: true })
  ]);

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8116' }, stdio: 'ignore' });
  await waitFor(`${apiUrl}/health`, 'API de Sidebar');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5216'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' });
  await waitFor(webUrl, 'Vite de Sidebar');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const ownerPage = await ownerContext.newPage(); ownerPage.setDefaultTimeout(30_000);
  await login(ownerPage, env.E2E_EMAIL, env.E2E_PASSWORD);
  await mkdir(resolve(webDir, '.screenshots'), { recursive: true });

  const primary = ['Organización', 'Electores', 'Planificación', 'Ejecución y Conversión', 'Addons', 'Reportes', 'Soporte', 'Sistema'];
  for (const label of primary) {
    const root = ownerPage.locator('#pc-navbar > .pc-item').filter({ hasText: label }).first();
    const transform = await root.locator('.pc-mtext').first().evaluate((element) => getComputedStyle(element).textTransform);
    if (transform !== 'uppercase') throw new Error(`${label} no usa mayúsculas en el sidebar.`);
  }
  const addons = ownerPage.locator('[data-sidebar-module="addons"]');
  await addons.locator('button').first().click();
  await addons.locator('.pc-submenu').waitFor({ state: 'visible' });
  await addons.locator('.pc-submenu').getByText('SmartPlanner', { exact: true }).waitFor();
  await addons.locator('.pc-submenu').getByText('Vote Stream', { exact: true }).waitFor();
  if (await addons.locator('.ph-chart-bar').count() !== 1) throw new Error('Vote Stream no recibió el icono de gráfico.');
  if (await ownerPage.getByText('CloudSuite', { exact: true }).count()) throw new Error('El rótulo CloudSuite sigue arriba del Dashboard.');
  if (await ownerPage.getByText(/Módulos de campaña próximamente/i).count()) throw new Error('El card azul de módulos todavía se renderiza.');
  const defaultOrder = await rootOrder(ownerPage);
  if (defaultOrder.indexOf('execution') > defaultOrder.indexOf('addons')) throw new Error(`ADDONS no quedó después de Ejecución y Conversión: ${defaultOrder.join(', ')}`);

  await ownerPage.getByRole('button', { name: 'Organizar menú', exact: true }).click();
  await ownerPage.locator('.cloudsuite-sidebar-organize-item').first().waitFor();
  await reorder(ownerPage, 'planning', 'organization');
  await reorder(ownerPage, 'addons', 'execution');
  await ownerPage.screenshot({ path: resolve(webDir, '.screenshots', 'sidebar-organizer-edit.png'), fullPage: true });
  const savedOwner = ownerPage.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/me/sidebar-preferences');
  await ownerPage.getByRole('button', { name: 'Guardar orden del menú', exact: true }).click();
  if (!(await savedOwner).ok()) throw new Error('El orden del propietario no se guardó por la API.');
  await ownerPage.reload({ waitUntil: 'domcontentloaded' });
  const ownerOrder = await rootOrder(ownerPage);
  if (ownerOrder.indexOf('planning') > ownerOrder.indexOf('organization') || ownerOrder.indexOf('addons') > ownerOrder.indexOf('execution')) throw new Error(`El orden del propietario no persistió tras F5: ${ownerOrder.join(', ')}`);
  const persistedOwner = (await ownerPreference.ref.get()).data()?.order ?? [];
  if (!persistedOwner.includes('planning') || !persistedOwner.includes('addons')) throw new Error('El orden del propietario no quedó en Firestore.');
  await ownerPage.screenshot({ path: resolve(webDir, '.screenshots', 'sidebar-organizer-persisted.png'), fullPage: true });

  const teammateContext = await browser.newContext({ viewport: { width: 1440, height: 980 } });
  const teammatePage = await teammateContext.newPage(); teammatePage.setDefaultTimeout(30_000);
  await login(teammatePage, teammateEmail, teammatePassword);
  await teammatePage.getByRole('button', { name: 'Organizar menú', exact: true }).click();
  await reorder(teammatePage, 'reports', 'dashboard');
  const savedTeammate = teammatePage.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/me/sidebar-preferences');
  await teammatePage.getByRole('button', { name: 'Guardar orden del menú', exact: true }).click();
  if (!(await savedTeammate).ok()) throw new Error('El orden del colaborador no se guardó por la API.');
  const teammateOrder = (await db.collection('users').doc(teammate.uid).collection('preferences').doc('sidebar').get()).data()?.order ?? [];
  if (teammateOrder[0] !== 'reports' || persistedOwner[0] === 'reports') throw new Error('Las preferencias del sidebar no son independientes por usuario.');

  await ownerPage.getByRole('button', { name: 'Organizar menú', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Restaurar', exact: true }).click();
  const savedDefault = ownerPage.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/me/sidebar-preferences');
  await ownerPage.getByRole('button', { name: 'Guardar orden del menú', exact: true }).click();
  if (!(await savedDefault).ok() || ((await ownerPreference.ref.get()).data()?.order ?? []).length !== 0) throw new Error('Restaurar orden predeterminado no limpió la preferencia persistida.');

  const mobilePage = await ownerContext.newPage(); await mobilePage.setViewportSize({ width: 375, height: 844 }); mobilePage.setDefaultTimeout(30_000);
  await mobilePage.goto(`${webUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await mobilePage.getByRole('button', { name: 'Abrir menú lateral', exact: true }).click();
  await mobilePage.locator('.pc-sidebar.mob-sidebar-active').waitFor();
  if (await mobilePage.locator('.cloudsuite-sidebar-organize-button:visible').count()) throw new Error('El organizador drag & drop debería estar oculto en mobile.');
  const mobilePrimaryTransform = await mobilePage.locator('[data-sidebar-module="planning"] > .pc-link .pc-mtext').evaluate((element) => getComputedStyle(element).textTransform);
  if (mobilePrimaryTransform !== 'uppercase') throw new Error('Los menús principales no usan mayúsculas en mobile.');
  await mobilePage.locator('[data-sidebar-module="addons"] > .pc-link').click();
  if (await mobilePage.locator('[data-sidebar-module="addons"] .ph-chart-bar').count() !== 1) throw new Error('Vote Stream no muestra su icono en mobile.');
  await mobilePage.locator('[data-sidebar-module="planning"] button').first().click();
  const calendarTextTransform = await mobilePage.getByText('Calendario', { exact: true }).evaluate((element) => getComputedStyle(element).textTransform);
  if (calendarTextTransform !== 'capitalize') throw new Error('Los submenús no usan formato título en mobile.');
  await mobilePage.screenshot({ path: resolve(webDir, '.screenshots', 'sidebar-organizer-mobile-375.png'), fullPage: true });
  console.log('SIDEBAR ORGANIZER E2E: tipografía, ADDONS, icono Vote Stream, limpieza, persistencia por dos usuarios, restauración y variante mobile OK.');
} finally {
  await browser?.close(); vite?.kill(); api?.kill(); await cleanup();
}
