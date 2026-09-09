import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = 5190;
const host = '127.0.0.1';
const base = `http://${host}:${port}`;
const webDir = fileURLToPath(new URL('../', import.meta.url));
const screenshots = fileURLToPath(new URL('../.screenshots/', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const pages = [
  ['dashboard', '/dashboard', 'Dashboard de campaña'],
  ['functions', '/organization/functions', 'Funciones'],
  ['teams', '/organization/teams', 'Equipos'],
  ['users', '/organization/users', 'Usuarios'],
  ['voters', '/electoral-conversion/voters', 'Electores'],
  ['map', '/electoral-conversion/map', 'Mapa de electores'],
  ['questions', '/planning/questions', 'Preguntas de visita'],
  ['audit', '/control-de-revision', 'Control de Revisión'],
  ['calendar', '/planning/calendar', 'Calendario Electoral'],
  ['goals', '/planning/goals', 'Metas de Campaña'],
  ['advisor', '/planning/advisor', 'Asesor de Estrategia con IA'],
];

function waitForServer(child) {
  return new Promise((resolveServer, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite no inició dentro de 20 segundos.')), 20000);
    const ready = () => { clearTimeout(timeout); resolveServer(); };
    const inspect = (chunk) => { if (chunk.toString().includes(base)) ready(); };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('error', reject);
  });
}

function apiResponse(pathname) {
  if (pathname.endsWith('/api/me')) return { organization: { id: 'visual-org', name: 'Organización de prueba' }, campaigns: [{ id: 'visual-campaign', name: 'Campaña de prueba' }], role: 'cliente' };
  if (pathname.includes('/analytics/summary')) return { totalVoters: 0, visitedCount: 0, convertedYes: 0, convertedNo: 0, undecidedCount: 0, conversionRate: 0, coverageRate: 0, teamStats: [], topMilitants: [] };
  if (pathname.includes('/analytics/timeline')) return { daily: [] };
  if (pathname.includes('question-sets/active')) return { active: null };
  if (pathname.endsWith('/budgets')) return { items: [], totalAmount: 0, totalSpent: 0, available: 0, consumedPercent: 0 };
  if (pathname.includes('/notifications')) return [];
  return [];
}

const vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', host, '--port', String(port)], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  await waitForServer(vite);
  await mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const gaps = [];

  for (const [name, path, title] of pages) {
    const page = await browser.newPage({ viewport: { width: 1680, height: 941 }, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('**/api/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(apiResponse(new URL(route.request().url()).pathname)) }));
    await page.goto(`${base}${path}?e2eDashboard=1`, { waitUntil: 'networkidle' });
    const heroTitle = page.locator('.cd-hero h1');
    await heroTitle.waitFor();
    if (await heroTitle.textContent() !== title) throw new Error(`${name}: título del HeroBanner inesperado.`);
    await page.waitForTimeout(150);
    if (await page.getByText('Failed to fetch', { exact: false }).count()) throw new Error(`${name}: Failed to fetch visible.`);
    if (consoleErrors.length) throw new Error(`${name}: errores de consola: ${consoleErrors.join(' | ')}`);

    const metric = await page.evaluate(() => {
      const container = document.querySelector('.cs-page-container');
      const hero = document.querySelector('.cd-hero');
      if (!container || !hero) throw new Error('No se encontró PageContainer o HeroBanner.');
      const containerStyle = getComputedStyle(container);
      const containerBox = container.getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      return { gap: heroBox.y - containerBox.y, padding: containerStyle.padding };
    });
    if (Math.abs(metric.gap - 20) > 0.1) throw new Error(`${name}: espacio superior ${metric.gap}px, se esperaban 20px.`);
    if (metric.padding !== '20px 40px 24px') throw new Error(`${name}: padding PageContainer inesperado: ${metric.padding}.`);
    await page.screenshot({ path: resolve(screenshots, `spacing-${name}.png`), fullPage: false });
    gaps.push({ name, ...metric });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(gaps));
  console.log(`Capturas desktop guardadas en ${screenshots}`);
} finally {
  vite.kill();
}
