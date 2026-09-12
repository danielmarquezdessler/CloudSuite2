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
  ['Usuarios', '/organization/users'], ['Campañas', '/organization/campaigns'], ['Candidatos', '/organization/candidates'], ['Electores', '/electoral-conversion/voters'], ['Mapa', '/electoral-conversion/map'],
  ['Preguntas de visita', '/planning/questions'], ['Control de Revisión', '/control-de-revision'], ['Calendario', '/planning/calendar'],
  ['Territorio', '/planning/territory'], ['Metas', '/planning/goals'], ['Rutas', '/planning/routes'],
  ['Encuestas', '/planning/surveys'], ['Presupuesto', '/planning/budget'], ['Asesor', '/planning/advisor'],
  ['Visitas en vivo', '/execution/live'], ['Mapa de calor', '/execution/heatmap'], ['Indecisos', '/execution/undecided'], ['SmartPlanner', '/smartplanner'], ['Aportantes SmartPlanner', '/smartplanner/contributors'], ['Proveedores SmartPlanner', '/smartplanner/providers']
  ,['Tareas', '/execution/tasks'], ['Productividad', '/execution/productivity'], ['Incidencias', '/execution/incidents'], ['Resumen de jornada', '/execution/daily-summary'], ['Temas', '/execution/issues'], ['Administración de add-ons', '/system/addons']
];
const minimumPadding = 12;
const minimumHeaderGap = 16;

function formatBox(box) {
  return `top:${box.top}px right:${box.right}px bottom:${box.bottom}px left:${box.left}px`;
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
const failures = [];
const headerFailures = [];
const ghosts = [];
let cardsAudited = 0;
let headersAudited = 0;

try {
  await page.goto(`${appUrl}/`);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  // Wait for the real active-campaign context, otherwise a fast route sweep can
  // audit loading fallbacks instead of the authenticated page content.
  await page.locator('.cs-campaign-selector').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const selector = document.querySelector('.cs-campaign-selector');
    return Boolean(selector && !selector.disabled);
  }, undefined, { timeout: 30_000 });

  for (const [name, route] of pages) {
    await page.goto(`${appUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const audit = await page.evaluate(({ minPadding, minHeaderGap }) => {
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
      const headers = [...document.querySelectorAll('[data-card-header="true"]')].filter(visible).map((element) => {
        const next = element.nextElementSibling;
        const gap = next && visible(next) ? next.getBoundingClientRect().top - element.getBoundingClientRect().bottom : -1;
        // Subpixel layout can report 15.999... for the 16px CSS token.
        // Keep the gate strict while allowing normal browser rounding noise.
        return { selector: selectorFor(element), gap, failed: gap + 0.5 < minHeaderGap };
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
      return { cards, headers, ghosts: [...new Set(ghostCandidates)] };
    }, { minPadding: minimumPadding, minHeaderGap: minimumHeaderGap });

    cardsAudited += audit.cards.length;
    headersAudited += audit.headers.length;
    for (const card of audit.cards) {
      if (card.failed) failures.push(`${name} (${route}) — ${card.selector} — ${formatBox(card.padding)}`);
    }
    for (const selector of audit.ghosts) ghosts.push(`${name} (${route}) — ${selector}`);
    for (const header of audit.headers) {
      if (header.failed) headerFailures.push(`${name} (${route}) — ${header.selector} — gap:${header.gap.toFixed(1)}px`);
    }
    for (const header of audit.headers.filter((item) => item.failed)) console.error(`[${name}] HEADER GAP: ${header.selector} = ${header.gap.toFixed(1)}px`);
    console.log(`[${name}] cards=${audit.cards.length}, paddingFailures=${audit.cards.filter((card) => card.failed).length}, headers=${audit.headers.length}, headerGapFailures=${audit.headers.filter((header) => header.failed).length}, ghostWarnings=${audit.ghosts.length}`);
  }

  // The active-campaign selector is rendered by the shared navbar, so open it
  // explicitly and include its canonical Card in the same padding gate.
  await page.goto(`${appUrl}/organization/campaigns`, { waitUntil: 'domcontentloaded' });
  const selector = page.getByRole('button', { name: /Cambiar campaña activa:/ });
  await selector.waitFor({ state: 'visible' });
  await selector.click();
  const modal = page.getByRole('dialog', { name: 'Campaña activa' });
  await modal.waitFor({ state: 'visible' });
  const modalAudit = await modal.locator('[data-card="true"]').evaluateAll((elements, minPadding) => elements.map((element) => {
    const style = getComputedStyle(element);
    const padding = { top: Number.parseFloat(style.paddingTop), right: Number.parseFloat(style.paddingRight), bottom: Number.parseFloat(style.paddingBottom), left: Number.parseFloat(style.paddingLeft) };
    return { padding, failed: Object.values(padding).some((value) => value < minPadding) };
  }), minimumPadding);
  cardsAudited += modalAudit.length;
  for (const [index, card] of modalAudit.entries()) {
    if (card.failed) failures.push(`Selector de campaña (modal) — card ${index + 1} — ${formatBox(card.padding)}`);
  }
  console.log(`[Selector de campaña modal] cards=${modalAudit.length}, paddingFailures=${modalAudit.filter((card) => card.failed).length}`);

  console.log(`\nPADDING AUDIT SUMMARY\nCards audited: ${cardsAudited}\nPadding failures: ${failures.length}\nCardHeaders audited: ${headersAudited}\nHeader-gap failures: ${headerFailures.length}\nGhost-card warnings: ${ghosts.length}`);
  if (failures.length) console.error(`\nPADDING FAILURES\n${failures.join('\n')}`);
  if (headerFailures.length) console.error(`\nHEADER-GAP FAILURES\n${headerFailures.join('\n')}`);
  if (ghosts.length) console.warn(`\nGHOST-CARD WARNINGS\n${ghosts.join('\n')}`);
  if (failures.length || headerFailures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
