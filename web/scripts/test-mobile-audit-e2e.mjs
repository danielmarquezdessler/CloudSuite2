import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const serverDir = resolve(rootDir, 'server');
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const screenshots = resolve(webDir, '.screenshots', 'mobile-audit');
const webUrl = 'http://127.0.0.1:5205';
const apiUrl = 'http://127.0.0.1:8095';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const widths = [360, 375, 390, 414];
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Process still booting. */ }
    await pause(300);
  }
  throw new Error(`${label} no respondió.`);
}

async function audit(page, label) {
  const issues = await page.evaluate(() => {
    const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
    const intersection = (left, right) => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const wordLines = [...document.querySelectorAll('h1,h2,h3,.cd-card__header h2,.vote-data-entry__candidate-name')].filter(visible).map((element) => {
      const content = (element.textContent ?? '').trim(); const words = content.split(/\s+/).filter(Boolean);
      const range = document.createRange(); range.selectNodeContents(element);
      const lines = [...range.getClientRects()].filter((box, index, boxes) => index === 0 || Math.abs(box.top - boxes[index - 1].top) > 1).length;
      return { content, words: words.length, lines };
    }).filter((item) => item.words >= 3 && item.lines >= item.words);
    const controls = [...document.querySelectorAll('.cs-topbar__mobile button,.cs-topbar__mobile input,.pc-container button,.pc-container input,.pc-container select,[data-card="true"] button,[data-card="true"] input,[data-card="true"] [role="button"]')].filter(visible).filter((element) => !(element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type))).map((element) => { const box = element.getBoundingClientRect(); return { tag: element.tagName, text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 48), width: box.width, height: box.height }; }).filter((item) => item.width < 43.5 || item.height < 43.5);
    const overlaps = [...document.querySelectorAll('[data-card="true"], .vote-data-entry-card')].filter(visible).flatMap((card) => {
      const actions = [...card.querySelectorAll('button,[role="button"],input,select')].filter(visible);
      const text = [...card.querySelectorAll('h1,h2,h3,h4,p,strong,label,small')].filter(visible);
      return actions.flatMap((action) => text.filter((copy) => !action.contains(copy) && !copy.contains(action) && intersection(action.getBoundingClientRect(), copy.getBoundingClientRect()) > 12).map((copy) => `${(action.textContent ?? action.getAttribute('aria-label') ?? action.tagName).trim().slice(0, 20)} ↔ ${(copy.textContent ?? '').trim().slice(0, 20)}`));
    });
    return { overflow, wordLines, controls, overlaps };
  });
  if (issues.overflow) throw new Error(`${label}: overflow horizontal del documento.`);
  if (issues.wordLines.length) throw new Error(`${label}: texto partido palabra por palabra: ${issues.wordLines.map((item) => item.content).join(' | ')}`);
  if (issues.controls.length) throw new Error(`${label}: controles táctiles menores a 44px: ${issues.controls.map((item) => `${item.tag} ${item.text} ${item.width.toFixed(0)}×${item.height.toFixed(0)}`).join(' | ')}`);
  if (issues.overlaps.length) throw new Error(`${label}: controles solapados con texto: ${issues.overlaps.slice(0, 4).join(' | ')}`);
}

async function auditLogin(page, label) {
  const issues = await page.evaluate(() => {
    const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
    const controls = [...document.querySelectorAll('.auth-main input,.auth-main button')].filter(visible).map((element) => { const box = element.getBoundingClientRect(); return { text: (element.getAttribute('aria-label') ?? element.textContent ?? element.tagName).trim(), width: box.width, height: box.height }; }).filter((item) => item.width < 43.5 || item.height < 43.5);
    return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, controls };
  });
  if (issues.overflow || issues.controls.length) throw new Error(`${label}: login móvil no usable (${issues.overflow ? 'overflow horizontal' : issues.controls.map((item) => `${item.text} ${item.width.toFixed(0)}×${item.height.toFixed(0)}`).join(' | ')}).`);
}

let api; let vite; let browser; let restore;
try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const user = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(user.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la organización/campaña E2E.');
  const orgRef = db.collection('organizations').doc(orgId);
  const campaignRef = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const suffix = Date.now().toString(36);
  const streamRef = campaignRef.collection('voteStreams').doc(`mobile-audit-${suffix}`);
  const voterRef = campaignRef.collection('voters').doc(`mobile-audit-voter-${suffix}`);
  restore = async () => {
    await db.recursiveDelete(streamRef).catch(() => undefined);
    await voterRef.delete().catch(() => undefined);
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false, voteStream: false } }, { merge: true });
  };
  const fixture = db.batch();
  fixture.set(orgRef, { enabledAddons: { ...(originalAddons ?? {}), voteStream: true } }, { merge: true });
  fixture.set(streamRef, { name: `Auditoría móvil ${suffix}`, status: 'activa', location: 'Villa del Totoral', date: '2026-09-18', electoralSystem: 'mayoritario_uninominal', createdAt: new Date(), liveResults: { totals: { 'candidata-uno': 0, 'candidato-dos': 0 }, totalVotes: 0 } });
  fixture.set(streamRef.collection('agents').doc(user.uid), { assignedAt: new Date(), assignedBy: user.uid });
  fixture.set(streamRef.collection('candidates').doc('candidata-uno'), { name: 'Candidata de auditoría móvil', party: 'Frente móvil', order: 1 });
  fixture.set(streamRef.collection('candidates').doc('candidato-dos'), { name: 'Candidato de auditoría móvil', party: 'Partido móvil', order: 2 });
  fixture.set(streamRef.collection('subLocations').doc('mesa-uno'), { name: 'Escuela Central - Mesa 1' });
  fixture.set(streamRef.collection('genderOptions').doc('femenino'), { name: 'Femenino' });
  fixture.set(streamRef.collection('ageRanges').doc('26-45'), { name: '26-45' });
  fixture.set(voterRef, { name: 'Elector auditoría móvil', address: 'Calle de prueba 100', createdAt: new Date() });
  await fixture.commit();

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8095' }, stdio: 'ignore' });
  await waitFor(`${apiUrl}/health`, 'API temporal');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5205'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' });
  await waitFor(webUrl, 'Vite');
  await mkdir(screenshots, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30_000);
    await page.goto(webUrl, { waitUntil: 'domcontentloaded' }); await auditLogin(page, `${width}px login`);
    await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL(/dashboard/); await page.locator('.cs-topbar__mobile .cs-campaign-selector:not([disabled])').waitFor();
    await page.getByRole('button', { name: 'Buscar electores', exact: true }).click(); await page.locator('#mobile-elector-search').waitFor({ state: 'visible' }); await audit(page, `${width}px header`);
    await page.getByLabel('Cerrar búsqueda').click();
    await page.goto(`${webUrl}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.locator('.cd-dashboard').waitFor(); await audit(page, `${width}px dashboard`);
    await page.goto(`${webUrl}/vote-stream/mi-panel`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Mi panel de Sondeo', exact: true }).waitFor(); await audit(page, `${width}px panel Vote Stream`);
    await page.getByRole('button', { name: 'Cargar resultados', exact: true }).first().click(); await page.getByRole('heading', { name: new RegExp(`Carga de datos · Auditoría móvil ${suffix}`) }).waitFor(); await audit(page, `${width}px data entry`);
    await page.getByRole('heading', { name: 'Ranking actual', exact: true }).scrollIntoViewIfNeeded(); await audit(page, `${width}px ranking Vote Stream`);
    await page.goto(`${webUrl}/visit/${voterRef.id}`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Visita electoral', exact: true }).waitFor(); await page.getByRole('button', { name: 'Siguiente', exact: true }).waitFor(); await audit(page, `${width}px visita`);
    if (width === 375) {
      await page.goto(`${webUrl}/dashboard`, { waitUntil: 'domcontentloaded' }); await page.locator('.cd-dashboard').waitFor(); await page.screenshot({ path: resolve(screenshots, 'dashboard-375.png'), fullPage: true });
      await page.goto(`${webUrl}/vote-stream/mi-panel`, { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: 'Cargar resultados', exact: true }).first().click(); await page.getByRole('heading', { name: new RegExp(`Carga de datos · Auditoría móvil ${suffix}`) }).waitFor(); await page.screenshot({ path: resolve(screenshots, 'data-entry-375.png'), fullPage: true });
      await page.goto(`${webUrl}/visit/${voterRef.id}`, { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Visita electoral', exact: true }).waitFor(); await page.getByRole('button', { name: 'Siguiente', exact: true }).waitFor(); await page.screenshot({ path: resolve(screenshots, 'visit-375.png'), fullPage: true });
    }
    await page.close();
    console.log(`${width}px OK: header, dashboard, panel/ranking Vote Stream, Data Entry y visita sin overflow, cortes, solapes ni targets pequeños.`);
  }
  console.log('MOBILE AUDIT OK: 4 viewports × Block 1 verificados con Firebase/API/Firestore reales.');
} finally {
  await browser?.close(); vite?.kill(); api?.kill(); await restore?.();
}
