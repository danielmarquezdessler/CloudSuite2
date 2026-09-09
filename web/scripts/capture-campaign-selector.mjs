import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const host = '127.0.0.1';
const port = 5191;
const base = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });

const waitForVite = () => new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20_000);
  const inspect = (chunk) => { if (chunk.toString().includes(base)) { clearTimeout(timeout); resolveReady(); } };
  vite.stdout.on('data', inspect); vite.stderr.on('data', inspect); vite.once('error', reject);
});

try {
  await waitForVite(); await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1680, height: 940 }, deviceScaleFactor: 1 });
  // A real image URL exercises the same <img> route used by Firebase Storage signed URLs.
  const avatar = `${base}/src/assets/images/user/avatar-1.jpg`;
  await page.route('**/api/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ organization: { id: 'visual-org' }, campaigns: [{ id: 'camp-1', nombre: 'Intendencia Villa del Totoral 2027' }], role: 'cliente' }) }));
  await page.route('**/api/organizations/visual-org/campaigns', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'camp-1', nombre: 'Intendencia Villa del Totoral 2027', memberCount: 1, voterCount: 0 }]) }));
  await page.route('**/api/organizations/visual-org/users', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ uid: 'visual-test-user', photoURL: avatar }]) }));
  await page.route('**/notifications', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.route('**/functions', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto(`${base}/organization/functions?e2eDashboard=1`, { waitUntil: 'networkidle' });
  const trigger = page.getByRole('button', { name: /Cambiar campaña activa:/ });
  await trigger.waitFor({ state: 'visible' });
  await page.locator('img.cloudsuite-sidebar-avatar').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(screenshots, 'campaign-selector-header.png'), fullPage: false });
  await trigger.click();
  await page.getByRole('dialog', { name: 'Campaña activa' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(screenshots, 'campaign-selector-modal.png'), fullPage: false });
  await browser.close();
  console.log('Capturas de header y modal de campaña generadas.');
} finally { vite.kill(); }
