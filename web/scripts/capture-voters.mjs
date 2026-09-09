import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = Number(process.env.VISUAL_PORT ?? 5181);
const host = '127.0.0.1';
const baseUrl = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const screenshotDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20_000);
    const done = () => { clearTimeout(timeout); resolve(); };
    const onData = chunk => { if (chunk.toString().includes(`http://${host}:${port}`)) done(); };
    child.stdout.on('data', onData); child.stderr.on('data', onData); child.once('error', reject);
  });
}

async function preparePage(page) {
  await page.route('**/api/me', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({ organization:{ id:'visual-org' }, campaigns:[{ id:'visual-campaign' }], role:'cliente' }) }));
  await page.route('**/api/users/visual-test-user/notifications', route => route.fulfill({ contentType:'application/json', body:'[]' }));
  await page.route('**/api/organizations/visual-org/campaigns/visual-campaign/voters', route => route.fulfill({ contentType:'application/json', body:JSON.stringify([{ id:'v-1', name:'María González', phone:'351 555 0101', address:'Av. Colón 1200', section:'Centro', state:'unvisited', teamName:'Zona Norte' }, { id:'v-2', name:'Javier Torres', phone:'351 555 0102', address:'San Martín 920', section:'Norte', state:'undecided', teamName:'Centro', lastVisitAt:'2026-09-07T12:00:00Z' }]) }));
}

const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd:webDir, stdio:['ignore', 'pipe', 'pipe'] });
try {
  await waitForServer(vite); await mkdir(screenshotDir, { recursive:true });
  const browser = await chromium.launch({ headless:true, executablePath:chromiumPath });
  for (const [name, viewport] of [['desktop', { width:1920, height:1080 }], ['mobile', { width:375, height:812 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor:1 });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await preparePage(page);
    await page.goto(`${baseUrl}/electoral-conversion/voters?e2eDashboard=1`, { waitUntil:'networkidle' });
    await page.locator('.cd-page').waitFor(); await page.waitForTimeout(250);
    if (await page.getByText('Failed to fetch', { exact:false }).count()) throw new Error(`${name}: todavía muestra “Failed to fetch”.`);
    if (!await page.getByRole('heading', { name:'Electores' }).count()) throw new Error(`${name}: no se renderizó Electores.`);
    if (name === 'mobile') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) throw new Error('mobile: la página desborda horizontalmente.');
    }
    if (consoleErrors.length) throw new Error(`${name}: errores de consola: ${consoleErrors.join(' | ')}`);
    await page.screenshot({ path:resolve(screenshotDir, `voters-${name}.png`), fullPage:false });
    await page.locator('.cd-page').screenshot({ path:resolve(screenshotDir, `voters-${name}-content.png`) });
    await page.close();
  }
  await browser.close();
  console.log(`Capturas guardadas en ${resolve(screenshotDir, 'voters-desktop.png')} y voters-mobile.png`);
} finally { vite.kill(); }
