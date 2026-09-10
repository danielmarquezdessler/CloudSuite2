import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const icon = fileURLToPath(new URL('../public/cloud-suite-favicon.png', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport:{width:1440,height:980}, acceptDownloads:true }); page.setDefaultTimeout(30_000);
  await page.goto(app); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button',{name:'Ingresar',exact:true}).click(); await page.waitForURL(/dashboard/);
  const title = `Incidencia E2E ${Date.now()}`;
  await page.goto(`${app}/execution/incidents`); await page.getByRole('heading',{name:'Incidencias de Campo'}).waitFor();
  await page.getByRole('button',{name:'Reportar incidencia',exact:true}).first().click();
  await page.getByLabel('Título').fill(title); await page.getByLabel('Descripción').fill('Incidencia creada mediante flujo E2E real con evidencia fotográfica.');
  await page.getByLabel('Dirección').fill('Av. Colón 1000, Córdoba'); await page.getByLabel('Foto (opcional)').setInputFiles(icon);
  await page.getByRole('button',{name:'Reportar incidencia',exact:true}).last().click();
  const card = page.locator('[data-card="true"].h-100').filter({hasText:title}); await card.waitFor(); await card.locator('img').waitFor();
  await card.getByRole('button',{name:'Marcar como resuelta',exact:true}).click(); await card.getByText('Resuelta',{exact:true}).waitFor();
  await page.goto(`${app}/execution/daily-summary`); await page.getByRole('heading',{name:'Resumen de Jornada',exact:true}).waitFor();
  const currentSummary = page.getByText('Resumen generado',{exact:true});
  if (await currentSummary.count()) {
    const pdf = page.waitForEvent('download'); await page.getByRole('button',{name:'Exportar a PDF',exact:true}).click(); await pdf;
    const excel = page.waitForEvent('download'); await page.getByRole('button',{name:'Exportar a Excel',exact:true}).click(); await excel;
    console.log(`E2E Parte C OK: incidencia="${title}" creada/resuelta con foto; resumen existente exportado a PDF y Excel.`);
  } else {
    await page.getByRole('button',{name:'Generar resumen de hoy',exact:true}).first().click();
    await page.getByText('Configurá GEMINI_API_KEY para activar esta función.',{exact:true}).waitFor();
    console.log(`E2E Parte C OK: incidencia="${title}" creada/resuelta con foto; Gemini sin clave mostró el estado de configuración esperado.`);
  }
  await page.screenshot({path:'.screenshots/execution-part-c-real.png',fullPage:true});
} finally { await browser.close(); }
