import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const separator = line.indexOf('='); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const webUrl = 'http://127.0.0.1:5206'; const apiUrl = 'http://127.0.0.1:8096';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const pages = [
  '/dashboard','/organization/functions','/organization/teams','/organization/users','/organization/campaigns','/organization/candidates','/electoral-conversion/voters','/electoral-conversion/map','/planning/questions','/control-de-revision','/planning/calendar','/planning/territory','/planning/goals','/planning/routes','/planning/surveys','/planning/budget','/planning/advisor','/execution/live','/execution/heatmap','/execution/undecided','/smartplanner','/smartplanner/contributors','/smartplanner/providers','/smartplanner/invoices','/smartplanner/contracts','/smartplanner/materials','/smartplanner/operations','/smartplanner/crews','/smartplanner/messages','/smartplanner/backlog','/smartplanner/war-room','/smartplanner/promises','/smartplanner/election-day','/smartplanner/comunicaciones','/smartplanner/tickets','/smartplanner/reports','/smartplanner/staff','/smartplanner/settings','/execution/tasks','/execution/productivity','/execution/incidents','/execution/daily-summary','/execution/issues','/system/addons'
];
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
async function waitFor(url, label) { for (let index = 0; index < 100; index += 1) { try { if ((await fetch(url)).ok) return; } catch { /* server starts */ } await pause(300); } throw new Error(`${label} no respondió.`); }
async function inspect(page) { return page.evaluate(() => {
  const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'; };
  const titles = [...document.querySelectorAll('main h1,main h2,main h3,.pc-container h1,.pc-container h2,.pc-container h3')].filter(visible).map((element) => { const words = (element.textContent ?? '').trim().split(/\s+/).filter(Boolean); const range = document.createRange(); range.selectNodeContents(element); const lines = [...range.getClientRects()].filter((box, index, boxes) => index === 0 || Math.abs(box.top - boxes[index - 1].top) > 1).length; return { text: (element.textContent ?? '').trim(), words: words.length, lines }; }).filter((item) => item.words >= 3 && item.lines >= item.words);
  return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, titles };
}); }
let api; let vite; let browser;
try {
  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8096' }, stdio: 'ignore' }); await waitFor(`${apiUrl}/health`, 'API temporal');
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5206'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: 'ignore' }); await waitFor(webUrl, 'Vite');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath }); const page = await browser.newPage({ viewport: { width: 375, height: 844 } }); page.setDefaultTimeout(30_000);
  await page.goto(webUrl); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  const failures = [];
  for (const route of pages) { await page.goto(`${webUrl}${route}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(450); const result = await inspect(page); if (result.overflow || result.titles.length) failures.push(`${route}: ${result.overflow ? 'overflow horizontal' : `títulos colapsados: ${result.titles.map((item) => item.text).join(' | ')}`}`); }
  if (failures.length) throw new Error(`MOBILE SYSTEM SWEEP FAILURES\n${failures.join('\n')}`);
  console.log(`MOBILE SYSTEM SWEEP OK: ${pages.length} rutas autenticadas a 375px sin overflow horizontal ni títulos palabra-por-línea.`);
} finally { await browser?.close(); vite?.kill(); api?.kill(); }
