import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const output = fileURLToPath(new URL('../.screenshots/spacing/', import.meta.url));
const routes = [
  ['teams', '/organization/teams'], ['functions', '/organization/functions'], ['users', '/organization/users'],
  ['goals', '/planning/goals'], ['routes', '/planning/routes'], ['surveys', '/planning/surveys'],
  ['budget', '/planning/budget'], ['advisor', '/planning/advisor']
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  for (const [name, route] of routes) {
    await page.goto(`http://127.0.0.1:5173${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    if (await page.getByText('Failed to fetch', { exact: false }).count()) throw new Error(`${name}: Failed to fetch visible.`);
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
  }
  console.log(`Capturas reales de espaciado generadas: ${routes.map(([name]) => name).join(', ')}.`);
} finally {
  await browser.close();
}
