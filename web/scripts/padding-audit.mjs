import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const envFile = new URL('../.env.test', import.meta.url);
const env = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

const pages = [
  ['Dashboard', '/dashboard'], ['Funciones', '/organization/functions'], ['Equipos', '/organization/teams'],
  ['Usuarios', '/organization/users'], ['Electores', '/electoral-conversion/voters'], ['Mapa', '/electoral-conversion/map'],
  ['Preguntas de visita', '/planning/questions'], ['Control de Revisión', '/control-de-revision'], ['Calendario', '/planning/calendar'],
  ['Territorio', '/planning/territory'], ['Metas', '/planning/goals'], ['Rutas', '/planning/routes'],
  ['Encuestas', '/planning/surveys'], ['Presupuesto', '/planning/budget'], ['Asesor', '/planning/advisor']
];
const minimumPadding = 12;

function formatBox(box) {
  return `top:${box.top}px right:${box.right}px bottom:${box.bottom}px left:${box.left}px`;
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
const failures = [];
const ghosts = [];
let cardsAudited = 0;

try {
  await page.goto(`${appUrl}/`);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  for (const [name, route] of pages) {
    await page.goto(`${appUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const audit = await page.evaluate((minPadding) => {
      const visible = (element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const selectorFor = (element) => {
        if (element.id) return `#${element.id}`;
        const classes = [...element.classList].filter((name) => name.startsWith('cd-') || name.startsWith('planning-')).slice(0, 2);
        return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join('')}` || element.tagName.toLowerCase();
      };
      const cards = [...document.querySelectorAll('[data-card="true"]')].filter(visible).map((element) => {
        const style = getComputedStyle(element);
        const padding = { top: Number.parseFloat(style.paddingTop), right: Number.parseFloat(style.paddingRight), bottom: Number.parseFloat(style.paddingBottom), left: Number.parseFloat(style.paddingLeft) };
        return { selector: selectorFor(element), padding, failed: Object.values(padding).some((value) => value < minPadding) };
      });
      const ignoredGhosts = ['cd-hero', 'cd-page-controls', 'cd-search-input', 'cd-native-select', 'cd-select-control', 'cd-table-scroll', 'cd-map-stage', 'cd-map-notice', 'cd-state-pill', 'cd-user-identity'];
      const ghostCandidates = [...document.querySelectorAll('article, section, div')].filter((element) => {
        if (!visible(element) || element.matches('[data-card="true"], [data-card="true"] *')) return false;
        if (ignoredGhosts.some((className) => element.classList.contains(className))) return false;
        const style = getComputedStyle(element); const box = element.getBoundingClientRect();
        const radius = Number.parseFloat(style.borderTopLeftRadius);
        const hasBorder = Number.parseFloat(style.borderTopWidth) > 0 || Number.parseFloat(style.borderRightWidth) > 0 || Number.parseFloat(style.borderBottomWidth) > 0 || Number.parseFloat(style.borderLeftWidth) > 0;
        return hasBorder && radius >= 8 && box.width >= 180 && box.height >= 88;
      }).map((element) => selectorFor(element));
      return { cards, ghosts: [...new Set(ghostCandidates)] };
    }, minimumPadding);

    cardsAudited += audit.cards.length;
    for (const card of audit.cards) {
      if (card.failed) failures.push(`${name} (${route}) — ${card.selector} — ${formatBox(card.padding)}`);
    }
    for (const selector of audit.ghosts) ghosts.push(`${name} (${route}) — ${selector}`);
    console.log(`[${name}] cards=${audit.cards.length}, paddingFailures=${audit.cards.filter((card) => card.failed).length}, ghostWarnings=${audit.ghosts.length}`);
  }

  console.log(`\nPADDING AUDIT SUMMARY\nCards audited: ${cardsAudited}\nPadding failures: ${failures.length}\nGhost-card warnings: ${ghosts.length}`);
  if (failures.length) console.error(`\nPADDING FAILURES\n${failures.join('\n')}`);
  if (ghosts.length) console.warn(`\nGHOST-CARD WARNINGS\n${ghosts.join('\n')}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
