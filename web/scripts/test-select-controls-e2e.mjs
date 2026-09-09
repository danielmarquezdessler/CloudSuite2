import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(15_000);

async function assertSingleDownwardSelect(label) {
  const control = page.getByRole('button', { name: label, exact: true });
  await control.click();
  const menu = page.locator('.dropdown-menu.show').last();
  await menu.waitFor({ state: 'visible' });
  const geometry = await control.evaluate((element, menuElement) => {
    const trigger = element.getBoundingClientRect();
    const menuRect = menuElement.getBoundingClientRect();
    return { svgCount: element.querySelectorAll('svg').length, triggerBottom: trigger.bottom, menuTop: menuRect.top };
  }, await menu.elementHandle());
  if (geometry.svgCount !== 1 || geometry.menuTop < geometry.triggerBottom - 2) throw new Error(`${label}: menú o ícono inválido (${JSON.stringify(geometry)})`);
  if (label === 'Campaña') {
    const screenshotsDir = fileURLToPath(new URL('../.screenshots/', import.meta.url));
    await mkdir(screenshotsDir, { recursive: true });
    await page.screenshot({ path: join(screenshotsDir, 'select-controls.png') });
  }
  await page.keyboard.press('Escape');
}

try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto('http://127.0.0.1:5173/organization/users');
  await page.getByRole('button', { name: 'Crear usuario', exact: true }).first().click();
  await assertSingleDownwardSelect('Campaña');
  await page.getByRole('button', { name: 'Campaña', exact: true }).click();
  await page.locator('.dropdown-menu.show').last().locator('.dropdown-item').nth(1).click();
  await assertSingleDownwardSelect('Función');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.goto('http://127.0.0.1:5173/organization/functions');
  await page.getByRole('button', { name: 'Crear nueva función', exact: true }).first().click();
  await assertSingleDownwardSelect('Color');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await page.goto('http://127.0.0.1:5173/organization/teams');
  await page.getByRole('button', { name: 'Crear nuevo equipo', exact: true }).first().click();
  await assertSingleDownwardSelect('Líder');
  console.log('E2E SelectControl real OK: Crear usuario (Campaña y Función), Funciones (Color) y Equipos (Líder).');
} finally {
  await browser.close();
}
