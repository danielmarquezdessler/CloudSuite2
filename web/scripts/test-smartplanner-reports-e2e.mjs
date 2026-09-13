import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const directory = fileURLToPath(new URL('../', import.meta.url)); const url = 'http://127.0.0.1:5193'; const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parse = (value) => Object.fromEntries(value.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; })); const pause = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
let vite; let browser;
try {
  const env = parse(await readFile(new URL('../.env.test', import.meta.url), 'utf8')); vite = spawn(process.execPath, [resolve(directory, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5193'], { cwd: directory, stdio: 'ignore' });
  for (let attempt = 0; attempt < 70; attempt += 1) { try { if ((await fetch(url)).ok) break; } catch { /* wait */ } await pause(300); if (attempt === 69) throw new Error('Vite no inició para probar reportes.'); }
  browser = await chromium.launch({ headless: true, executablePath }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(25_000);
  await page.goto(url); await page.getByLabel('Email').fill(env.E2E_EMAIL); await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD); await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL(/dashboard/); await page.goto(`${url}/smartplanner/reports`); await page.getByRole('heading', { name: 'Reportes SmartPlanner' }).waitFor();
  const excel = page.waitForEvent('download'); await page.getByRole('button', { name: 'Excel', exact: true }).first().click(); const file = await excel; if (!file.suggestedFilename().endsWith('.xls')) throw new Error('La exportación no generó un archivo Excel.'); const contents = await file.createReadStream(); let bytes = 0; for await (const part of contents) bytes += part.length; if (!bytes) throw new Error('El Excel descargado quedó vacío.');
  const pdf = page.waitForEvent('download'); await page.getByRole('button', { name: 'PDF', exact: true }).first().click(); const pdfFile = await pdf; if (!pdfFile.suggestedFilename().endsWith('.pdf')) throw new Error('La exportación no generó un PDF.'); console.log(`Reportes E2E OK: se descargaron ${file.suggestedFilename()} (${bytes} bytes) y ${pdfFile.suggestedFilename()} con datos reales.`);
} finally { await browser?.close(); vite?.kill(); }
