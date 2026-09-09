import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const host = '127.0.0.1';
const port = 5192;
const base = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const pages = [
  ['Calendario', '/planning/calendar', 'calendar', []],
  ['Metas', '/planning/goals', 'goals', []],
  ['Encuestas', '/planning/surveys', 'surveys', []],
  ['Presupuesto', '/planning/budget', 'budgets', { items: [], totalAmount: 0, totalSpent: 0, available: 0, consumedPercent: 0 }]
];
const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });

const waitForVite = () => new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20_000);
  const inspect = (chunk) => { if (chunk.toString().includes(base)) { clearTimeout(timeout); resolveReady(); } };
  vite.stdout.on('data', inspect); vite.stderr.on('data', inspect); vite.once('error', reject);
});

try {
  await waitForVite();
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  let planningRequests = 0;

  page.on('request', (request) => {
    if (request.url().includes('/api/organizations/visual-org/campaigns/camp-1/')) planningRequests += 1;
  });
  await page.route('**/api/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ organization: { id: 'visual-org' }, campaigns: [{ id: 'camp-1', nombre: 'Campaña de prueba' }], role: 'cliente' }) }));
  await page.route('**/api/organizations/visual-org/campaigns', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'camp-1', nombre: 'Campaña de prueba', memberCount: 1, voterCount: 0 }]) }));
  await page.route('**/api/organizations/visual-org/users', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }));
  await page.route('**/notifications', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));

  for (const [name, path, endpoint, body] of pages) {
    await page.route(`**/api/organizations/visual-org/campaigns/camp-1/${endpoint}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }));
    planningRequests = 0;
    await page.goto(`${base}${path}?e2eDashboard=1`, { waitUntil: 'networkidle' });
    await page.locator('.cd-hero').waitFor({ state: 'visible' });
    await page.waitForTimeout(1_000);
    const loadingVisible = await page.getByText('Cargando planificación', { exact: true }).isVisible().catch(() => false);
    if (loadingVisible || planningRequests !== 1) {
      throw new Error(`${name}: se esperó 1 carga estable y sin spinner; se observaron ${planningRequests} requests, loading=${loadingVisible}.`);
    }
    console.log(`${name}: carga estable (${planningRequests} request, sin titileo).`);
    await page.unroute(`**/api/organizations/visual-org/campaigns/camp-1/${endpoint}`);
  }

  await browser.close();
  console.log('PLANNING STABILITY: OK');
} finally {
  vite.kill();
}
