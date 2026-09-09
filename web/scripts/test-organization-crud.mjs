import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = 5191;
const host = '127.0.0.1';
const base = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const calls = [];
const state = {
  functions: [{ id: 'fn-existing', name: 'Función existente', description: 'Función inicial', color: '#0060F0' }],
  teams: [{ id: 'team-existing', name: 'Equipo existente', description: 'Equipo inicial', leaderId: 'member-1', memberCount: 1 }],
  members: [
    { uid: 'member-1', displayName: 'Líder existente', email: 'lider@example.com', role: 'usuario', functionId: 'fn-existing', teamId: 'team-existing' },
    { uid: 'member-2', displayName: 'Colaborador existente', email: 'colaborador@example.com', role: 'usuario', functionId: 'fn-existing', teamId: null }
  ],
  invitations: []
};

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const noContent = (route) => route.fulfill({ status: 204, body: '' });
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function waitForServer(child) {
  return new Promise((resolveServer, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20000);
    const inspect = (chunk) => { if (chunk.toString().includes(base)) { clearTimeout(timeout); resolveServer(); } };
    child.stdout.on('data', inspect); child.stderr.on('data', inspect); child.once('error', reject);
  });
}

function itemById(list, value) { return list.find((item) => item.id === value || item.uid === value); }
async function handleApi(route) {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const method = request.method();
  calls.push(`${method} ${path}`);
  const data = request.postDataJSON?.() ?? {};
  if (path === '/api/me') return json(route, 200, { organization: { id: 'visual-org', nombre: 'Organización de prueba' }, campaigns: [{ id: 'visual-campaign', nombre: 'Campaña de prueba' }], role: 'cliente' });
  const basePath = '/api/organizations/visual-org/campaigns/visual-campaign';
  if (path === `${basePath}/functions`) {
    if (method === 'GET') return json(route, 200, state.functions);
    if (method === 'POST') { const created = { id: id('fn'), ...data }; state.functions.push(created); return json(route, 201, { funcId: created.id, ...data }); }
  }
  const functionMatch = path.match(new RegExp(`^${basePath}/functions/([^/]+)$`));
  if (functionMatch) { const found = itemById(state.functions, functionMatch[1]); if (!found) return json(route, 404, { message: 'No encontrada.' }); if (method === 'PUT') { Object.assign(found, data); return json(route, 200, { funcId: found.id, ...data }); } if (method === 'DELETE') { state.functions.splice(state.functions.indexOf(found), 1); return noContent(route); } }
  const teamMembersMatch = path.match(new RegExp(`^${basePath}/teams/([^/]+)/members(?:/([^/]+))?$`));
  if (teamMembersMatch) { const [, teamId, memberId] = teamMembersMatch; if (method === 'GET') return json(route, 200, state.members.filter((member) => member.teamId === teamId)); if (method === 'DELETE' && memberId) { const member = itemById(state.members, memberId); if (member) member.teamId = null; const team = itemById(state.teams, teamId); if (team) team.memberCount = state.members.filter((member) => member.teamId === teamId).length; return noContent(route); } }
  if (path === `${basePath}/teams`) { if (method === 'GET') return json(route, 200, state.teams); if (method === 'POST') { const created = { id: id('team'), ...data, memberCount: 0 }; state.teams.push(created); return json(route, 201, { teamId: created.id, ...data }); } }
  const teamMatch = path.match(new RegExp(`^${basePath}/teams/([^/]+)$`));
  if (teamMatch) { const found = itemById(state.teams, teamMatch[1]); if (!found) return json(route, 404, { message: 'No encontrado.' }); if (method === 'PUT') { Object.assign(found, data); return json(route, 200, { teamId: found.id, ...data }); } if (method === 'DELETE') { state.teams.splice(state.teams.indexOf(found), 1); return noContent(route); } }
  if (path === `${basePath}/members`) return json(route, 200, state.members);
  const memberMatch = path.match(new RegExp(`^${basePath}/members/([^/]+)$`));
  if (memberMatch) { const found = itemById(state.members, memberMatch[1]); if (!found) return json(route, 404, { message: 'No encontrado.' }); if (method === 'PUT') { Object.assign(found, data); return json(route, 200, { uid: found.uid, ...data }); } if (method === 'DELETE') { state.members.splice(state.members.indexOf(found), 1); return noContent(route); } }
  if (path === `${basePath}/invitations`) { if (method === 'GET') return json(route, 200, state.invitations); if (method === 'POST') { const created = { id: id('inv'), ...data, email: data.email, expiresAt: '2027-01-01T00:00:00.000Z', sent: false }; state.invitations.push(created); return json(route, 201, created); } }
  const resendMatch = path.match(new RegExp(`^${basePath}/invitations/([^/]+)/resend$`));
  if (resendMatch && method === 'POST') return json(route, 200, { sent: false });
  const invitationMatch = path.match(new RegExp(`^${basePath}/invitations/([^/]+)$`));
  if (invitationMatch && method === 'DELETE') { const found = itemById(state.invitations, invitationMatch[1]); if (found) state.invitations.splice(state.invitations.indexOf(found), 1); return noContent(route); }
  if (path.includes('/notifications')) return json(route, 200, []);
  return json(route, 200, []);
}

function requireCall(expected) { if (!calls.includes(expected)) throw new Error(`No se realizó la llamada esperada: ${expected}`); }
async function confirmNextDialog(page) { page.once('dialog', (dialog) => dialog.accept()); }

const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await waitForServer(vite); await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(6000);
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/**', handleApi);

  console.log('Verificando Funciones…');
  await page.goto(`${base}/organization/functions?e2eDashboard=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByText('Función existente', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Crear nueva función', exact: true }).first().click();
  await page.getByLabel('Nombre').fill('Función QA'); await page.getByLabel('Descripción').fill('Creada desde Playwright'); await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByText('Función QA', { exact: true }).waitFor(); requireCall(`POST /api/organizations/visual-org/campaigns/visual-campaign/functions`);
  const functionRow = page.locator('tr').filter({ hasText: 'Función QA' }); await functionRow.getByRole('button', { name: 'Editar' }).click(); await page.getByLabel('Nombre').fill('Función QA editada'); await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByText('Función QA editada', { exact: true }).waitFor();
  if (!calls.some((call) => call.startsWith('PUT /api/organizations/visual-org/campaigns/visual-campaign/functions/'))) throw new Error('No se ejecutó PUT de función.');
  await confirmNextDialog(page); await page.locator('tr').filter({ hasText: 'Función QA editada' }).getByRole('button', { name: 'Borrar' }).click(); await page.getByText('Función QA editada', { exact: true }).waitFor({ state: 'detached' });
  if (!calls.some((call) => call.startsWith('DELETE /api/organizations/visual-org/campaigns/visual-campaign/functions/'))) throw new Error('No se ejecutó DELETE de función.');

  console.log('Verificando Equipos…');
  await page.goto(`${base}/organization/teams?e2eDashboard=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByText('Equipo existente', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Crear nuevo equipo', exact: true }).first().click(); await page.getByLabel('Nombre').fill('Equipo QA'); await page.getByLabel('Descripción').fill('Creado desde Playwright'); await page.getByLabel('Líder').selectOption('member-1'); await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByText('Equipo QA', { exact: true }).waitFor(); requireCall(`POST /api/organizations/visual-org/campaigns/visual-campaign/teams`);
  await page.getByText('Equipo existente', { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Ver miembros' }).click(); await page.getByText('Líder existente', { exact: true }).waitFor(); requireCall(`GET /api/organizations/visual-org/campaigns/visual-campaign/teams/team-existing/members`); await page.locator('.modal.show .btn-close').click();
  const teamRow = page.locator('.cd-team-card').filter({ hasText: 'Equipo QA' }); await teamRow.getByRole('button', { name: 'Editar' }).click(); await page.getByLabel('Nombre').fill('Equipo QA editado'); await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.getByText('Equipo QA editado', { exact: true }).waitFor();
  if (!calls.some((call) => call.startsWith('PUT /api/organizations/visual-org/campaigns/visual-campaign/teams/'))) throw new Error('No se ejecutó PUT de equipo.');
  await confirmNextDialog(page); await page.locator('.cd-team-card').filter({ hasText: 'Equipo QA editado' }).getByRole('button', { name: 'Borrar' }).click(); await page.getByText('Equipo QA editado', { exact: true }).waitFor({ state: 'detached' });
  if (!calls.some((call) => call.startsWith('DELETE /api/organizations/visual-org/campaigns/visual-campaign/teams/'))) throw new Error('No se ejecutó DELETE de equipo.');

  console.log('Verificando Usuarios…');
  await page.goto(`${base}/organization/users?e2eDashboard=1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByText('Colaborador existente', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Invitar colaborador', exact: true }).first().click(); await page.getByLabel('Email').fill('invitado-qa@example.com'); await page.getByLabel('Función').selectOption('fn-existing'); await page.getByLabel('Equipo').selectOption('team-existing'); await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click();
  await page.getByRole('tab', { name: 'Invitaciones pendientes' }).click(); await page.getByText('invitado-qa@example.com', { exact: true }).waitFor(); requireCall(`POST /api/organizations/visual-org/campaigns/visual-campaign/invitations`);
  await page.getByRole('button', { name: 'Reenviar' }).click(); if (!calls.some((call) => call.startsWith('POST /api/organizations/visual-org/campaigns/visual-campaign/invitations/') && call.endsWith('/resend'))) throw new Error('No se ejecutó POST de reenvío.');
  await confirmNextDialog(page); await page.getByRole('button', { name: 'Revocar' }).click(); await page.getByText('invitado-qa@example.com', { exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: 'Miembros activos' }).click(); const memberRow = page.locator('tr').filter({ hasText: 'Colaborador existente' }); await memberRow.getByRole('button', { name: 'Editar' }).click(); await page.locator('#member-role').selectOption('admin'); await page.getByRole('button', { name: 'Guardar cambios' }).click(); if (!calls.some((call) => call === 'PUT /api/organizations/visual-org/campaigns/visual-campaign/members/member-2')) throw new Error('No se ejecutó PUT de miembro.');
  await confirmNextDialog(page); await page.locator('tr').filter({ hasText: 'Colaborador existente' }).getByRole('button', { name: 'Remover' }).click(); await page.getByText('Colaborador existente', { exact: true }).waitFor({ state: 'detached' }); if (!calls.includes('DELETE /api/organizations/visual-org/campaigns/visual-campaign/members/member-2')) throw new Error('No se ejecutó DELETE de miembro.');
  if (consoleErrors.length) throw new Error(`Errores de consola: ${consoleErrors.join(' | ')}`);
  await page.screenshot({ path: resolve(screenshots, 'organization-crud.png'), fullPage: false }); await browser.close();
  console.log('Prueba de interacción CRUD de Organización OK.');
  console.log(JSON.stringify(calls));
} finally { vite.kill(); }
