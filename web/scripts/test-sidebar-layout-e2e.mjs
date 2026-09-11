import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

const pages = [
  ['Dashboard', '/dashboard'],
  ['Funciones', '/organization/functions'],
  ['Equipos', '/organization/teams'],
  ['Usuarios', '/organization/users'],
  ['Campañas', '/organization/campaigns'],
  ['Candidatos', '/organization/candidates'],
  ['Electores', '/electoral-conversion/voters'],
  ['Mapa de electores', '/electoral-conversion/map'],
  ['Preguntas de visita', '/planning/questions'],
  ['Control de revisión', '/control-de-revision'],
  ['Calendario', '/planning/calendar'],
  ['Territorio', '/planning/territory'],
  ['Metas', '/planning/goals'],
  ['Rutas', '/planning/routes'],
  ['Encuestas', '/planning/surveys'],
  ['Presupuesto', '/planning/budget'],
  ['Asesor', '/planning/advisor'],
  ['Visitas en vivo', '/execution/live'],
  ['Mapa de calor', '/execution/heatmap'],
  ['Indecisos', '/execution/undecided'],
  ['Tareas', '/execution/tasks'],
  ['Productividad', '/execution/productivity'],
  ['Incidencias', '/execution/incidents'],
  ['Resumen de jornada', '/execution/daily-summary'],
  ['Temas', '/execution/issues'],
];

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);

try {
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  for (const [name, route] of pages) {
    await page.goto(`${app}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.pc-sidebar').waitFor({ state: 'visible' });
    await page.locator('.cs-page-container').waitFor({ state: 'visible' });
    await page.locator('.cd-hero').waitFor({ state: 'visible' });

    // The template class must never be able to inject a second content offset.
    await page.evaluate(() => document.body.classList.add('layout-nested'));
    const layout = await page.evaluate(() => {
      const sidebar = document.querySelector('.pc-sidebar')?.getBoundingClientRect();
      const pageContainer = document.querySelector('.cs-page-container')?.getBoundingClientRect();
      const hero = document.querySelector('.cd-hero')?.getBoundingClientRect();
      return { sidebarRight: sidebar?.right ?? 0, pageLeft: pageContainer?.left ?? 0, heroLeft: hero?.left ?? 0 };
    });
    if (layout.pageLeft < layout.sidebarRight || layout.heroLeft < layout.sidebarRight) {
      throw new Error(`${name}: contenido solapado con sidebar (sidebar right=${layout.sidebarRight}, page=${layout.pageLeft}, hero=${layout.heroLeft}).`);
    }
    await page.evaluate(() => document.body.classList.remove('layout-nested'));
    await page.screenshot({ path: fileURLToPath(new URL(`../.screenshots/sidebar-layout-${route.split('/').filter(Boolean).join('-')}.png`, import.meta.url)), fullPage: true });
    console.log(`${name}: sidebar=${layout.sidebarRight}px, página=${layout.pageLeft}px, hero=${layout.heroLeft}px — OK`);
  }
  console.log(`Sidebar layout E2E real OK: ${pages.length} vistas sin superposición.`);
} finally {
  await browser.close();
}
