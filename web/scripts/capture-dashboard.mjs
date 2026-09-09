import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = Number(process.env.VISUAL_PORT ?? 5180);
const host = '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const screenshotPath = fileURLToPath(new URL('../.screenshots/dashboard.png', import.meta.url));
const dashboardScreenshotPath = fileURLToPath(new URL('../.screenshots/dashboard-content.png', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20000);
    const onData = (chunk) => { if (chunk.toString().includes(`http://${host}:${port}`)) { clearTimeout(timeout); resolve(); } };
    child.stdout.on('data', onData); child.stderr.on('data', onData); child.once('error', reject);
  });
}

const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd:webDir, stdio:['ignore', 'pipe', 'pipe'] });
try {
  await waitForServer(vite);
  await mkdir(fileURLToPath(new URL('../.screenshots/', import.meta.url)), { recursive:true });
  const browser = await chromium.launch({ headless:true, executablePath:chromiumPath });
  const page = await browser.newPage({ viewport:{ width:1680, height:941 }, deviceScaleFactor:1 });
  await page.route('**/api/me', (route) => route.fulfill({ contentType:'application/json', body:JSON.stringify({ organization:{ id:'visual-org' }, campaigns:[{ id:'visual-campaign' }], role:'cliente' }) }));
  await page.route('**/api/users/visual-test-user/notifications', (route) => route.fulfill({ contentType:'application/json', body:'[]' }));
  await page.route('**/analytics/summary?**', (route) => route.fulfill({ contentType:'application/json', body:JSON.stringify({ totalVoters:1280, visitedCount:416, convertedYes:230, convertedNo:86, undecidedCount:100, conversionRate:18, coverageRate:33, teamStats:[{ teamName:'Zona Norte', conversionsCount:94 }, { teamName:'Centro', conversionsCount:76 }, { teamName:'Sur', conversionsCount:60 }], topMilitants:[{ uid:'1', name:'María González', visitsCount:74, conversionsCount:41, conversionRate:55 }, { uid:'2', name:'Javier Torres', visitsCount:52, conversionsCount:29, conversionRate:56 }] }) }));
  await page.route('**/analytics/timeline?**', (route) => route.fulfill({ contentType:'application/json', body:JSON.stringify({ daily:[{ date:'2026-09-01', accumulated_yes:18 }, { date:'2026-09-03', accumulated_yes:57 }, { date:'2026-09-05', accumulated_yes:120 }, { date:'2026-09-09', accumulated_yes:230 }] }) }));
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${baseUrl}/dashboard?e2eDashboard=1`, { waitUntil:'networkidle' });
  await page.locator('.cd-dashboard').waitFor(); await page.waitForTimeout(500);
  const title = page.locator('.cd-hero h1'); const titleColor = await title.evaluate((element) => getComputedStyle(element).color);
  if (titleColor !== 'rgb(27, 61, 120)') throw new Error(`Color del título inesperado: ${titleColor}`);
  if (await page.getByText('Failed to fetch', { exact:false }).count()) throw new Error('La pantalla todavía muestra “Failed to fetch”.');
  const card = page.locator('.cd-dashboard__main .cd-card').first(); const cardBox = await card.boundingBox(); const headerBox = await card.locator('.cd-card__header').boundingBox();
  const headerOffset = cardBox && headerBox ? headerBox.y - cardBox.y : Number.NaN;
  const layoutMetrics = await page.evaluate(() => {
    const read = (selector) => { const element = document.querySelector(selector); if (!element) return null; const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return { selector, x:rect.x, y:rect.y, width:rect.width, marginTop:style.marginTop, paddingTop:style.paddingTop, position:style.position, display:style.display, transform:style.transform }; };
    return [read('.pc-container'), read('.pc-content'), read('.cd-dashboard'), read('.cd-hero'), read('.cd-hero__tile'), read('.cd-hero h1'), read('.cd-kpi-card'), read('.cd-card'), read('.cd-card__header')];
  });
  await page.screenshot({ path:screenshotPath, fullPage:false }); await page.locator('.cd-dashboard').screenshot({ path:dashboardScreenshotPath });
  if (!Number.isFinite(headerOffset) || headerOffset > 24) throw new Error(`El header de la tarjeta tiene un hueco inesperado de ${headerOffset}px.`);
  if (consoleErrors.length) throw new Error(`Errores de consola: ${consoleErrors.join(' | ')}`);
  const errorPage = await browser.newPage({ viewport:{ width:1680, height:941 } });
  await errorPage.route('**/api/me', (route) => route.fulfill({ contentType:'application/json', body:JSON.stringify({ organization:{ id:'visual-org' }, campaigns:[{ id:'visual-campaign' }], role:'cliente' }) }));
  await errorPage.route('**/api/users/visual-test-user/notifications', (route) => route.fulfill({ contentType:'application/json', body:'[]' }));
  await errorPage.route('**/analytics/**', (route) => route.abort('failed'));
  await errorPage.goto(`${baseUrl}/dashboard?e2eDashboard=1`, { waitUntil:'networkidle' });
  await errorPage.getByText('No pudimos cargar los datos', { exact:true }).waitFor();
  if (!await errorPage.getByRole('button', { name:'Reintentar' }).count()) throw new Error('El estado de error no ofrece Reintentar.');
  if (await errorPage.getByText('Failed to fetch', { exact:false }).count()) throw new Error('El estado de error expone el texto técnico “Failed to fetch”.');
  await errorPage.close(); await browser.close();
  console.log(`Screenshots guardados en ${screenshotPath} y ${dashboardScreenshotPath}`); console.log(`Color H1 verificado: ${titleColor}; header offset: ${headerOffset}px; errores de consola: ${consoleErrors.length}`); console.log(JSON.stringify(layoutMetrics));
} finally { vite.kill(); }
