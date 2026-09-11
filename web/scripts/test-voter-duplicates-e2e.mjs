import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const webEnv = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const suffix = Date.now().toString(36); const firstName = `Duplicado Real ${suffix}`; const secondName = `${firstName}`;
const browser = await chromium.launch({ headless: true, executablePath }); const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(25_000);

async function create(name, address, phone) {
  await page.getByRole('button', { name: 'Crear elector', exact: true }).click();
  await page.locator('#voter-name').fill(name); await page.locator('#voter-address').fill(address); await page.locator('#voter-phone').fill(phone);
  const response = page.waitForResponse((item) => item.request().method() === 'POST' && /\/voters$/.test(new URL(item.url()).pathname));
  const submit = page.getByRole('dialog').getByRole('button', { name: 'Crear elector', exact: true }); await submit.click();
  const outcome = await Promise.race([response, page.locator('[role="alert"]').waitFor({ timeout: 6_000 }).then(async () => { throw new Error(`Crear elector no envió la solicitud: ${JSON.stringify(await page.locator('[role="alert"]').allTextContents())}`); })]);
  const body = await outcome.json(); if (outcome.status() !== 201) throw new Error(`Crear elector devolvió ${outcome.status()}: ${JSON.stringify(body)}`); await page.getByRole('dialog').waitFor({ state: 'hidden' }); return body;
}
async function realVisit(voterId, orgId, campId) {
  const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webEnv.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, returnSecureToken: true }) });
  const auth = await authResponse.json(); if (!authResponse.ok) throw new Error(`Firebase Auth falló: ${JSON.stringify(auth)}`);
  const request = (path, body) => fetch(`http://127.0.0.1:8080${path}`, { method: 'POST', headers: { Authorization: `Bearer ${auth.idToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const started = await request(`/api/organizations/${orgId}/campaigns/${campId}/voters/${voterId}/visits`, {}); const startedBody = await started.json(); if (!started.ok) throw new Error(`No se pudo iniciar la visita: ${JSON.stringify(startedBody)}`);
  const feedback = await request(`/api/organizations/${orgId}/campaigns/${campId}/voters/${voterId}/visits/${startedBody.visitId}/feedback`, { responses: [], notes: 'Visita real previa a la fusión E2E.', issues: [] }); if (!feedback.ok) throw new Error(`No se pudo guardar feedback: ${await feedback.text()}`);
  const conversion = await request(`/api/organizations/${orgId}/campaigns/${campId}/voters/${voterId}/visits/${startedBody.visitId}/conversion`, { decision: 'yes' }); if (!conversion.ok) throw new Error(`No se pudo completar conversión: ${await conversion.text()}`);
}

try {
  console.log('E2E duplicados: login Firebase real…'); await page.goto(app); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  const campaignSelector = page.getByRole('button', { name: /Cambiar campaña activa:/ }); await campaignSelector.waitFor({ state: 'visible', timeout: 25_000 }); await page.waitForFunction((button) => !button.disabled, await campaignSelector.elementHandle(), { timeout: 25_000 });
  console.log('E2E duplicados: campaña activa confirmada; creando registros…'); await page.goto(`${app}/electoral-conversion/voters`); await page.getByRole('button', { name: 'Crear elector', exact: true }).first().waitFor();
  const first = await create(firstName, 'Avenida Colón 600, Córdoba', `351${suffix.slice(-7).padStart(7, '0')}`);
  const second = await create(secondName, 'Av. Colon 600, Cordoba', `352${suffix.slice(-7).padStart(7, '0')}`);
  const currentCampaignId = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('cloudsuite.activeCampaign.'))?.[1]); const { db } = await import('../../server/dist/config/firebase.js'); const profile = await db.collection('users').where('email', '==', env.E2E_EMAIL).limit(1).get(); const orgId = profile.docs[0].data().orgIds[0];
  console.log('E2E duplicados: registrando visita real…'); await realVisit(second.id, orgId, currentCampaignId);
  await page.getByRole('heading', { name: 'Posibles duplicados' }).waitFor(); const group = page.locator('.cs-duplicate-group', { hasText: firstName }).first(); await group.getByRole('button', { name: 'Revisar y fusionar', exact: true }).click();
  const dialog = page.locator('.modal.show'); await dialog.waitFor();
  // The visited record is deliberately the default; choose the other record to prove the explicit keeper selection is respected.
  await dialog.locator('label.cs-duplicate-choice').filter({ hasText: 'Avenida Colón 600' }).locator('input').check();
  const merged = page.waitForResponse((item) => item.request().method() === 'POST' && /\/voters\/merge$/.test(new URL(item.url()).pathname) && item.status() === 200); await dialog.getByRole('button', { name: 'Fusionar registros', exact: true }).click(); await merged;
  const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(currentCampaignId);
  const [kept, removed, visits] = await Promise.all([campaign.collection('voters').doc(first.id).get(), campaign.collection('voters').doc(second.id).get(), campaign.collection('visits').where('voterId', '==', first.id).get()]);
  if (!kept.exists || removed.exists || visits.empty) throw new Error(`Fusión incompleta: keep=${kept.exists}, removed=${removed.exists}, visitas=${visits.size}`);
  await mkdir(screenshots, { recursive: true }); await page.screenshot({ path: resolve(screenshots, 'voter-duplicates-e2e-real.png'), fullPage: true }); console.log(`Duplicados E2E real OK: keeper explícito ${first.id}; ${visits.size} visita(s) reasignada(s).`);
} finally { await browser.close(); }
