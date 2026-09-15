import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const appUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const env = Object.fromEntries((await readFile(new URL('../.env.test', import.meta.url), 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));

const allPages = [
  ['/dashboard', 'Dashboard'], ['/organization/functions', 'Funciones'], ['/organization/teams', 'Equipos'], ['/organization/users', 'Usuarios'], ['/organization/campaigns', 'Campañas'], ['/organization/candidates', 'Candidatos'], ['/electoral-conversion/voters', 'Electores'], ['/electoral-conversion/map', 'Mapa'], ['/planning/questions', 'Preguntas de visita'], ['/control-de-revision', 'Control de Revisión'], ['/planning/calendar', 'Calendario'], ['/planning/territory', 'Territorio'], ['/planning/goals', 'Metas'], ['/planning/routes', 'Rutas'], ['/planning/surveys', 'Encuestas'], ['/planning/budget', 'Presupuesto'], ['/planning/advisor', 'Asesor'], ['/execution/live', 'Visitas en vivo'], ['/execution/heatmap', 'Mapa de calor'], ['/execution/undecided', 'Indecisos'], ['/execution/tasks', 'Tareas'], ['/execution/productivity', 'Productividad'], ['/execution/incidents', 'Incidencias'], ['/execution/daily-summary', 'Resumen de jornada'], ['/execution/issues', 'Temas'], ['/system/addons', 'Administración de add-ons'], ['/smartplanner', 'SmartPlanner'], ['/smartplanner/contributors', 'Aportantes'], ['/smartplanner/providers', 'Proveedores'], ['/smartplanner/invoices', 'Facturación'], ['/smartplanner/contracts', 'Contratos'], ['/smartplanner/materials', 'Materiales'], ['/smartplanner/operations', 'Mapa de Avanzada'], ['/smartplanner/crews', 'Cuadrillas'], ['/smartplanner/messages', 'Validación de mensajes'], ['/smartplanner/war-room', 'War Room'], ['/smartplanner/promises', 'Propuestas'], ['/smartplanner/election-day', 'Día D'], ['/smartplanner/comunicaciones', 'Centro de Comunicaciones'], ['/smartplanner/tickets', 'Tickets'], ['/smartplanner/reports', 'Reportes'], ['/smartplanner/staff', 'Personal'], ['/smartplanner/settings', 'Configuración']
];
const requestedRoutes = new Set((process.env.DROPDOWN_AUDIT_ROUTES ?? '').split(',').filter(Boolean));
const pages = requestedRoutes.size ? allPages.filter(([route]) => requestedRoutes.has(route)) : allPages;

let browser; let restore;
let audited = 0;
const failures = [];
const seen = new Set();

try {
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const account = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(account.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  if (!orgId) throw new Error('No se pudo resolver la organización E2E para habilitar SmartPlanner temporalmente.');
  const organization = db.collection('organizations').doc(orgId);
  const before = (await organization.get()).data()?.enabledAddons ?? {};
  restore = () => organization.set({ enabledAddons: before }, { merge: true });
  await organization.set({ enabledAddons: { ...before, smartPlanner: true } }, { merge: true });

  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(20_000);
  await page.goto(`${appUrl}/`);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await page.locator('.cs-campaign-selector').waitFor({ state: 'visible' });

  for (const [route, name] of pages) {
    await page.goto(`${appUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(550);
    const controls = page.locator('[data-select-control]:visible:not([disabled])');
    const count = await controls.count();
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const label = await control.getAttribute('aria-label') ?? `${name} #${index + 1}`;
      try {
        await control.scrollIntoViewIfNeeded();
        await control.click();
        const menu = page.locator('[data-dropdown-portal]').last();
        await menu.waitFor({ state: 'visible' });
        const visibility = await menu.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 20));
          return { width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, style: element.getAttribute('style'), computedWidth: style.width, computedMinWidth: style.minWidth, transform: style.transform, display: style.display, visibility: style.visibility, uncovered: Boolean(point?.closest('[data-dropdown-portal]')) };
        });
        const complete = visibility.width > 0 && visibility.height > 0 && visibility.top >= 0 && visibility.left >= 0 && visibility.right <= 1440 && visibility.bottom <= 980 && visibility.display !== 'none' && visibility.visibility !== 'hidden' && visibility.uncovered;
        if (!complete) {
          const trigger = await control.evaluate((element) => {
            const rect = element.getBoundingClientRect(); const parent = element.closest('.cd-select-dropdown'); const parentRect = parent?.getBoundingClientRect();
            return { trigger: { width: rect.width, left: rect.left, right: rect.right }, wrapper: parentRect ? { width: parentRect.width, left: parentRect.left, right: parentRect.right } : null };
          });
          throw new Error(JSON.stringify({ visibility, trigger }));
        }
        audited += 1;
        seen.add(label);
      } catch (error) {
        failures.push(`${name} (${route}) · ${label}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.keyboard.press('Escape');
      }
    }
  }
  if (!requestedRoutes.size && !seen.has('Color de acento')) failures.push('Configuración SmartPlanner: no se auditó el select Tema / Color de acento.');
  if (!requestedRoutes.size && ![...seen].some((label) => label.startsWith('Rol de '))) failures.push('Home SmartPlanner: no se auditó un select de Roles SmartPlanner.');
  if (failures.length) throw new Error(`Dropdown visibility failures (${failures.length}):\n${failures.join('\n')}`);
  console.log(`PASS: test:e2e:dropdown-visibility auditó ${audited} selects canónicos en ${pages.length} páginas; 0 fallos.`);
} finally {
  await browser?.close();
  await restore?.();
}
