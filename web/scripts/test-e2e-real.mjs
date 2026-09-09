import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const host = '127.0.0.1';
const apiUrl = 'http://127.0.0.1:8080';
const webPort = 5188;
const webUrl = `http://${host}:${webPort}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function waitForOutput(child, needle, label) {
  return new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} no inició dentro de 25 segundos.`)), 25000);
    const inspect = (chunk) => { if (chunk.toString().includes(needle)) { clearTimeout(timeout); resolveReady(); } };
    child.stdout.on('data', inspect); child.stderr.on('data', inspect); child.once('error', reject);
  });
}

async function health() {
  try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; }
}

async function waitForHealth() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) { if (await health()) return; await new Promise((resolveWait) => setTimeout(resolveWait, 500)); }
  throw new Error('La API real no respondió en /health dentro de 25 segundos.');
}

async function submitToDashboard(page) {
  const outcome = await Promise.race([
    page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 7500 }).then(() => 'dashboard'),
    page.getByRole('alert').waitFor({ timeout: 7500 }).then(() => 'error')
  ]);
  if (outcome === 'error') throw new Error((await page.getByRole('alert').textContent())?.trim() || 'El login/registro mostró un error sin texto.');
}

let apiProcess = null;
let browserProcess = null;
let browser = null;
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  if (!env.E2E_EMAIL || !env.E2E_PASSWORD || !env.E2E_ORGANIZATION || !env.E2E_CAMPAIGN) throw new Error('Faltan E2E_EMAIL, E2E_PASSWORD, E2E_ORGANIZATION o E2E_CAMPAIGN en web/.env.test.');
  if (!(await health())) {
    apiProcess = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PROJECT_ID: 'politicfy-cloudsuite' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForOutput(apiProcess, 'CloudSuite server listening', 'La API real');
    await waitForHealth();
  }
  browserProcess = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(webPort)], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForOutput(browserProcess, webUrl, 'Vite');
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => console.log(`Request fallida: ${request.url()} :: ${request.failure()?.errorText ?? 'sin detalle'}`));

  console.log('Login Firebase real…');
  await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  try {
    await submitToDashboard(page);
  } catch (loginError) {
    console.log('Usuario E2E no autenticable; intentando registro real…');
    await page.goto(`${webUrl}/register`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.getByLabel('Nombre de la organización').fill(env.E2E_ORGANIZATION); await page.getByLabel('Nombre de la primera campaña').fill(env.E2E_CAMPAIGN); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    try { await submitToDashboard(page); } catch (registerError) { throw new Error(`Login inicial: ${loginError instanceof Error ? loginError.message : String(loginError)}\nRegistro real: ${registerError instanceof Error ? registerError.message : String(registerError)}`); }
  }
  // El dashboard puede haber terminado su primer GET /api/me antes de llegar aquí.
  // Forzamos una recarga real y armamos la espera antes de dispararla para comprobar
  // inequívocamente que la sesión del navegador fue validada por la API.
  const meResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/me' && response.status() === 200, { timeout: 7500 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const meResponse = await meResponsePromise;
  const me = await meResponse.json();
  if (!me.organization?.id || !me.campaigns?.[0]?.id) throw new Error(`La sesión Firebase fue aceptada, pero /api/me no devolvió organización/campaña: ${JSON.stringify(me)}`);
  console.log(`Sesión Firebase real aceptada; org=${me.organization.id}, campaña=${me.campaigns[0].id}.`);

  const suffix = Date.now().toString(36);
  const functionName = `Función E2E ${suffix}`;
  console.log('Funciones sin mocks…');
  await page.goto(`${webUrl}/organization/functions`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('button', { name: 'Crear nueva función', exact: true }).first().click(); await page.getByLabel('Nombre').fill(functionName); await page.getByLabel('Descripción').fill('Verificación E2E real');
  const postFunction = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/functions') && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await postFunction; await page.getByText(functionName, { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText(functionName, { exact: true }).waitFor();

  const teamName = `Equipo E2E ${suffix}`;
  console.log('Equipos sin mocks…');
  await page.goto(`${webUrl}/organization/teams`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('button', { name: 'Crear nuevo equipo', exact: true }).first().click(); await page.getByLabel('Nombre').fill(teamName); await page.getByLabel('Descripción').fill('Verificación E2E real');
  await page.locator('#team-leader').selectOption({ index: 1 });
  const postTeam = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/teams') && response.status() === 201);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await postTeam; await page.getByText(teamName, { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText(teamName, { exact: true }).waitFor();

  const invitedEmail = `e2e-invite-${suffix}@cloudsuite.local`;
  console.log('Usuarios e invitaciones sin mocks…');
  await page.goto(`${webUrl}/organization/users`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.getByRole('button', { name: 'Invitar colaborador', exact: true }).first().click(); await page.getByLabel('Email').fill(invitedEmail); await page.locator('#invite-function').selectOption({ label: functionName }); await page.locator('#invite-team').selectOption({ label: teamName });
  const postInvite = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/invitations') && response.status() === 201);
  await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click(); await postInvite; await page.getByRole('tab', { name: 'Invitaciones pendientes' }).click(); await page.getByText(invitedEmail, { exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('tab', { name: 'Invitaciones pendientes' }).click(); await page.getByText(invitedEmail, { exact: true }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'organization-e2e-real.png'), fullPage: false });
  if (consoleErrors.length) throw new Error(`Errores de consola durante E2E real: ${consoleErrors.join(' | ')}`);
  console.log('E2E real OK: Funciones, Equipos y Usuarios se verificaron tras recargas reales de Firestore.');
} finally {
  await browser?.close();
  browserProcess?.kill();
  apiProcess?.kill();
}
