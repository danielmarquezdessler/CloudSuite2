import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const envFile = new URL('../.env.test', import.meta.url);
const env = Object.fromEntries((await readFile(envFile, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

const allPages = [
  ['Dashboard', '/dashboard'], ['Funciones', '/organization/functions'], ['Equipos', '/organization/teams'],
  ['Usuarios', '/organization/users'], ['Campañas', '/organization/campaigns'], ['Candidatos', '/organization/candidates'], ['Electores', '/electoral-conversion/voters'], ['Mapa', '/electoral-conversion/map'],
  ['Preguntas de visita', '/planning/questions'], ['Control de Revisión', '/control-de-revision'], ['Calendario', '/planning/calendar'],
  ['Territorio', '/planning/territory'], ['Metas', '/planning/goals'], ['Rutas', '/planning/routes'],
  ['Encuestas', '/planning/surveys'], ['Presupuesto', '/planning/budget'], ['Asesor', '/planning/advisor'],
  ['Visitas en vivo', '/execution/live'], ['Mapa de calor', '/execution/heatmap'], ['Indecisos', '/execution/undecided'], ['Mi panel de Sondeo', '/vote-stream/mi-panel'], ['SmartPlanner', '/smartplanner'], ['Aportantes SmartPlanner', '/smartplanner/contributors'], ['Proveedores SmartPlanner', '/smartplanner/providers'], ['Facturación SmartPlanner', '/smartplanner/invoices'], ['Contratos SmartPlanner', '/smartplanner/contracts'], ['Materiales SmartPlanner', '/smartplanner/materials'], ['Mapa de Avanzada SmartPlanner', '/smartplanner/operations'], ['Sugerencias de cuadrilla SmartPlanner', '/smartplanner/crews'], ['Validación de mensajes SmartPlanner', '/smartplanner/messages']
  ,['Backlog de Campaña SmartPlanner', '/smartplanner/backlog'], ['War Room SmartPlanner', '/smartplanner/war-room'], ['Viabilidad jurídica SmartPlanner', '/smartplanner/promises'], ['Panel Día D SmartPlanner', '/smartplanner/election-day'], ['Centro de Comunicaciones SmartPlanner', '/smartplanner/comunicaciones'], ['Tickets SmartPlanner', '/smartplanner/tickets'], ['Reportes SmartPlanner', '/smartplanner/reports'], ['Personal SmartPlanner', '/smartplanner/staff'], ['Configuración SmartPlanner', '/smartplanner/settings'], ['Tareas', '/execution/tasks'], ['Productividad', '/execution/productivity'], ['Incidencias', '/execution/incidents'], ['Resumen de jornada', '/execution/daily-summary'], ['Temas', '/execution/issues'], ['Administración de add-ons', '/system/addons']
];
const selectedRoutes = new Set((process.env.PADDING_AUDIT_ROUTES ?? '').split(',').filter(Boolean));
const pages = selectedRoutes.size
  ? [...selectedRoutes].map((route) => allPages.find(([, knownRoute]) => knownRoute === route) ?? [route, route])
  : allPages;
const minimumPadding = 12;
const minimumHeaderGap = 16;
const minimumSiblingCardGap = 8;
const maximumCdCardContainerGap = 0.5;

function formatBox(box) {
  return `top:${box.top}px right:${box.right}px bottom:${box.bottom}px left:${box.left}px`;
}

const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.setDefaultTimeout(30_000);
const failures = [];
const headerFailures = [];
const ghosts = [];
const siblingCardFailures = [];
const duplicateCardSpacingFailures = [];
let cardsAudited = 0;
let headersAudited = 0;
let cardContainersAudited = 0;

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
    if (route === '/vote-stream/mi-panel') await page.getByRole('heading', { name: 'Activas', exact: true }).waitFor({ state: 'visible' });
    else if (route.startsWith('/vote-stream/') && !route.includes('/public/')) await page.locator('[data-vote-ranking-id]').first().waitFor({ state: 'visible' });
    if (route === '/smartplanner/war-room') await page.getByRole('heading', { name: 'Motor de Crisis' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/promises') await page.getByRole('heading', { name: 'Propuestas de campaña' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/election-day') await page.getByRole('heading', { name: 'Panel del Día D' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/comunicaciones') await page.getByRole('heading', { name: 'Centro de Comunicaciones' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/tickets') await page.getByRole('heading', { name: 'Tickets' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/reports') await page.getByRole('heading', { name: 'Reportes SmartPlanner' }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/staff') await page.getByRole('heading', { name: 'Personal', exact: true }).waitFor({ state: 'visible' });
    if (route === '/smartplanner/settings') await page.getByRole('heading', { name: 'Configuración', exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const audit = await page.evaluate(({ minPadding, minHeaderGap, minSiblingCardGap, maxCdCardContainerGap }) => {
      const visible = (element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const selectorFor = (element) => {
        if (element.id) return `#${element.id}`;
        const classes = [...element.classList].filter((name) => !name.startsWith('col-') && !name.startsWith('row')).slice(0, 3);
        return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join('')}` || element.tagName.toLowerCase();
      };
      const cards = [...document.querySelectorAll('[data-card="true"]')].filter(visible).map((element) => {
        const style = getComputedStyle(element);
        const padding = { top: Number.parseFloat(style.paddingTop), right: Number.parseFloat(style.paddingRight), bottom: Number.parseFloat(style.paddingBottom), left: Number.parseFloat(style.paddingLeft) };
        return { selector: selectorFor(element), padding, failed: Object.values(padding).some((value) => value < minPadding) };
      });
      const headers = [...document.querySelectorAll('[data-card-header="true"]')].filter(visible).map((element) => {
        const next = element.nextElementSibling;
        const hasVisibleNext = Boolean(next && visible(next));
        const gap = hasVisibleNext ? next.getBoundingClientRect().top - element.getBoundingClientRect().bottom : null;
        // Subpixel layout can report 15.999... for the 16px CSS token.
        // Keep the gate strict while allowing normal browser rounding noise.
        return { selector: selectorFor(element), gap, failed: hasVisibleNext && gap + 0.5 < minHeaderGap };
      });
      const siblingCardContainers = [...document.querySelectorAll('*')].filter((element) => {
        const directCards = [...element.children].filter((child) => child.matches('[data-card="true"]') && visible(child));
        return directCards.length >= 2 && visible(element);
      }).map((element) => {
        const directCards = [...element.children].filter((child) => child.matches('[data-card="true"]') && visible(child));
        const gaps = [];
        for (let index = 0; index < directCards.length; index += 1) {
          for (let nextIndex = index + 1; nextIndex < directCards.length; nextIndex += 1) {
            const first = directCards[index].getBoundingClientRect(); const second = directCards[nextIndex].getBoundingClientRect();
            const verticallyAligned = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1;
            const horizontallyAligned = Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1;
            if (verticallyAligned) gaps.push(Math.max(second.left - first.right, first.left - second.right));
            if (horizontallyAligned) gaps.push(Math.max(second.top - first.bottom, first.top - second.bottom));
          }
        }
        const relevantGaps = gaps.filter((gap) => gap >= -0.5);
        const minimumGap = relevantGaps.length ? Math.min(...relevantGaps) : null;
        const cdCards = directCards.filter((card) => card.matches('.cd-card'));
        const style = getComputedStyle(element);
        const rowGap = Number.parseFloat(style.rowGap) || 0;
        const columnGap = Number.parseFloat(style.columnGap) || 0;
        return {
          selector: selectorFor(element), cards: directCards.length, minimumGap,
          rowGap, columnGap, cdCards: cdCards.length,
          failed: minimumGap !== null && minimumGap + 0.5 < minSiblingCardGap,
          duplicateSpacing: cdCards.length >= 2 && (rowGap > maxCdCardContainerGap || columnGap > maxCdCardContainerGap)
        };
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
      return { cards, headers, siblingCardContainers, ghosts: [...new Set(ghostCandidates)] };
    }, { minPadding: minimumPadding, minHeaderGap: minimumHeaderGap, minSiblingCardGap: minimumSiblingCardGap, maxCdCardContainerGap: maximumCdCardContainerGap });

    cardsAudited += audit.cards.length;
    headersAudited += audit.headers.length;
    cardContainersAudited += audit.siblingCardContainers.length;
    for (const card of audit.cards) {
      if (card.failed) failures.push(`${name} (${route}) — ${card.selector} — ${formatBox(card.padding)}`);
    }
    for (const selector of audit.ghosts) ghosts.push(`${name} (${route}) — ${selector}`);
    for (const header of audit.headers) {
      if (header.failed) headerFailures.push(`${name} (${route}) — ${header.selector} — gap:${header.gap.toFixed(1)}px`);
    }
    for (const container of audit.siblingCardContainers) {
      if (container.failed) siblingCardFailures.push(`${name} (${route}) — ${container.selector} — ${container.cards} cards, gap:${container.minimumGap.toFixed(1)}px`);
      if (container.duplicateSpacing) duplicateCardSpacingFailures.push(`${name} (${route}) — ${container.selector} — ${container.cdCards} .cd-card hermanas, row-gap:${container.rowGap.toFixed(1)}px, column-gap:${container.columnGap.toFixed(1)}px`);
    }
    for (const container of audit.siblingCardContainers.filter((item) => item.failed)) console.error(`[${name}] SIBLING CARD GAP: ${container.selector} = ${container.minimumGap.toFixed(1)}px`);
    for (const container of audit.siblingCardContainers.filter((item) => item.duplicateSpacing)) console.error(`[${name}] DUPLICATE CD-CARD SPACING: ${container.selector} = row ${container.rowGap.toFixed(1)}px / column ${container.columnGap.toFixed(1)}px`);
    for (const header of audit.headers.filter((item) => item.failed)) console.error(`[${name}] HEADER GAP: ${header.selector} = ${header.gap.toFixed(1)}px`);
    console.log(`[${name}] cards=${audit.cards.length}, paddingFailures=${audit.cards.filter((card) => card.failed).length}, headers=${audit.headers.length}, headerGapFailures=${audit.headers.filter((header) => header.failed).length}, cardContainers=${audit.siblingCardContainers.length}, siblingGapFailures=${audit.siblingCardContainers.filter((container) => container.failed).length}, duplicateCdCardSpacingFailures=${audit.siblingCardContainers.filter((container) => container.duplicateSpacing).length}, ghostWarnings=${audit.ghosts.length}`);
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

  await modal.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir addons', exact: true }).click();
  const launcher = page.locator('.cloudsuite-launcher-menu');
  await launcher.waitFor({ state: 'visible' });
  const launcherAudit = await launcher.locator('.cloudsuite-launcher-card[data-card="true"]').evaluateAll((elements, minPadding) => elements.map((element) => {
    const style = getComputedStyle(element);
    const padding = { top: Number.parseFloat(style.paddingTop), right: Number.parseFloat(style.paddingRight), bottom: Number.parseFloat(style.paddingBottom), left: Number.parseFloat(style.paddingLeft) };
    return { padding, failed: Object.values(padding).some((value) => value < minPadding) };
  }), minimumPadding);
  cardsAudited += launcherAudit.length;
  if (launcherAudit.length !== 8) failures.push(`Launcher Addons — se esperaban 8 cards canónicas y se encontraron ${launcherAudit.length}.`);
  for (const [index, card] of launcherAudit.entries()) {
    if (card.failed) failures.push(`Launcher Addons — card ${index + 1} — ${formatBox(card.padding)}`);
  }
  console.log(`[Launcher Addons] cards=${launcherAudit.length}, paddingFailures=${launcherAudit.filter((card) => card.failed).length}`);

  console.log(`\nPADDING AUDIT SUMMARY\nCards audited: ${cardsAudited}\nPadding failures: ${failures.length}\nCardHeaders audited: ${headersAudited}\nHeader-gap failures: ${headerFailures.length}\nSibling-card containers audited: ${cardContainersAudited}\nSibling-card gap failures: ${siblingCardFailures.length}\nDuplicate .cd-card spacing failures: ${duplicateCardSpacingFailures.length}\nGhost-card warnings: ${ghosts.length}`);
  if (failures.length) console.error(`\nPADDING FAILURES\n${failures.join('\n')}`);
  if (headerFailures.length) console.error(`\nHEADER-GAP FAILURES\n${headerFailures.join('\n')}`);
  if (siblingCardFailures.length) console.error(`\nSIBLING-CARD GAP FAILURES\n${siblingCardFailures.join('\n')}`);
  if (duplicateCardSpacingFailures.length) console.error(`\nDUPLICATE .CD-CARD SPACING FAILURES\n${duplicateCardSpacingFailures.join('\n')}`);
  if (ghosts.length) console.warn(`\nGHOST-CARD WARNINGS\n${ghosts.join('\n')}`);
  if (failures.length || headerFailures.length || siblingCardFailures.length || duplicateCardSpacingFailures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
