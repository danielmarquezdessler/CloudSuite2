import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } }); page.setDefaultTimeout(30_000);
  await page.goto(app); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/);
  await page.goto(`${app}/execution/tasks`); await page.getByRole('heading', { name: 'Tareas y Asignaciones' }).waitFor();
  const completedCard = page.locator('.cd-kpi-card').filter({ hasText: 'Completadas hoy' });
  const completedBefore = Number((await completedCard.locator('.cd-kpi-card__value').textContent())?.trim());
  const title = `Tarea E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Crear tarea', exact: true }).first().click();
  await page.getByLabel('Título').fill(title); await page.getByLabel('Descripción').fill('Tarea creada en la verificación E2E real.');
  await page.getByRole('button', { name: 'Asignar a' }).click();
  await page.locator('.dropdown-menu.show').getByText('e2e-test', { exact: true }).click();
  await page.getByRole('button', { name: 'Guardar tarea', exact: true }).click();
  const row = page.locator('tr').filter({ hasText: title }); await row.waitFor();
  await row.getByRole('button', { name: 'Completar', exact: true }).click();
  await page.waitForFunction(({ task, before }) => {
    const rowText = [...document.querySelectorAll('tr')].find((row) => row.textContent?.includes(task))?.textContent ?? '';
    const card = [...document.querySelectorAll('.cd-kpi-card')].find((item) => item.textContent?.includes('Completadas hoy'));
    const value = Number(card?.querySelector('.cd-kpi-card__value')?.textContent?.trim());
    return rowText.includes('Completada') && value === before + 1;
  }, { task: title, before: completedBefore });
  await page.goto(`${app}/execution/productivity`); await page.getByRole('heading', { name: 'Productividad del Equipo' }).waitFor();
  const productive = page.locator('tr').filter({ hasText: 'e2e-test' }); await productive.waitFor();
  const cells = await productive.locator('td').allTextContents();
  const visits = Number(cells[2]); const completedTasks = Number(cells[7]);
  if (!Number.isFinite(visits) || visits < 1 || !Number.isFinite(completedTasks) || completedTasks < 1) throw new Error(`Productividad real inesperada: ${JSON.stringify(cells)}`);
  await page.screenshot({ path: '.screenshots/execution-part-b-real.png', fullPage: true });
  console.log(`E2E Parte B OK: tarea="${title}", completadasHoy ${completedBefore}->${completedBefore + 1}, e2e-test visitas=${visits}, tareasCompletadas=${completedTasks}`);
} finally { await browser.close(); }
