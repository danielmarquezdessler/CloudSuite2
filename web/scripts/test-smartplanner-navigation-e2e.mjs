import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const serverDir = fileURLToPath(new URL('../../server/', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const webUrl = 'http://127.0.0.1:5192';
const apiUrl = 'http://127.0.0.1:8081';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const smartPlannerRoutes = [
  '/smartplanner/contributors', '/smartplanner/providers', '/smartplanner/invoices', '/smartplanner/contracts',
  '/smartplanner/materials', '/smartplanner/operations', '/smartplanner/crews', '/smartplanner/messages',
  '/smartplanner/war-room', '/smartplanner/promises', '/smartplanner/election-day', '/smartplanner/tickets',
  '/smartplanner/chat', '/smartplanner/comunicaciones', '/smartplanner/staff', '/smartplanner/settings', '/smartplanner/reports'
];
const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const pause = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

let vite;
let api;
let browser;
let restore;

async function waitForWeb() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(webUrl)).ok) return; } catch { /* Vite is starting. */ }
    await pause(350);
  }
  throw new Error('Vite no respondió para la navegación de SmartPlanner.');
}

async function waitForApi() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(`${apiUrl}/health`)).ok) return; } catch { /* The API is starting. */ }
    await pause(350);
  }
  throw new Error('La API temporal no respondió para la navegación de SmartPlanner.');
}

async function expectVisibleBackButtons(page, route) {
  const heroButton = page.locator('[data-back-button="hero"] .cd-back-button--icon');
  const pageButton = page.locator('[data-back-button="page"] .cd-back-button--link');
  await heroButton.waitFor({ state: 'visible' }).catch(() => { throw new Error(`${route}: falta el BackButton visible dentro del Hero.`); });
  await pageButton.scrollIntoViewIfNeeded();
  await pageButton.waitFor({ state: 'visible' }).catch(() => { throw new Error(`${route}: falta el BackButton visible al final del contenido.`); });
  for (const [position, button] of [['Hero', heroButton], ['final', pageButton]]) {
    if (await button.getAttribute('href') !== '/smartplanner') throw new Error(`${route}: el BackButton de ${position} no navega a /smartplanner.`);
  }
  if ((await heroButton.boundingBox())?.width !== 40) throw new Error(`${route}: el BackButton superior debe medir 40px.`);
  if ((await pageButton.textContent())?.trim() !== '‹ Regresar a inicio') throw new Error(`${route}: el BackButton final debe mostrar “Regresar a inicio”.`);
}

async function expectSecondaryNavigation(page) {
  const navigation = page.locator('[data-smartplanner-nav]');
  await navigation.waitFor({ state: 'visible' });
  const navigationStyles = await page.evaluate(() => {
    const navigation = document.querySelector('[data-smartplanner-nav]');
    const desktop = navigation?.querySelector('.sp-secondary-nav__desktop');
    const header = document.querySelector('.cs-topbar');
    if (!navigation || !desktop || !header) return null;
    const navStyle = getComputedStyle(navigation);
    const desktopStyle = getComputedStyle(desktop);
    return {
      position: navStyle.position,
      navTop: Math.round(navigation.getBoundingClientRect().top),
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      display: desktopStyle.display,
      minHeight: desktopStyle.minHeight,
      alignItems: desktopStyle.alignItems,
      gap: desktopStyle.gap,
      paddingLeft: desktopStyle.paddingLeft,
      paddingRight: desktopStyle.paddingRight,
      overflowX: desktopStyle.overflowX,
      background: desktopStyle.backgroundColor,
      color: desktopStyle.color,
      borderBottom: `${desktopStyle.borderBottomWidth} ${desktopStyle.borderBottomStyle} ${desktopStyle.borderBottomColor}`
    };
  });
  const expectedStyles = { position: 'fixed', display: 'flex', minHeight: '48px', alignItems: 'center', gap: '2px', paddingLeft: '24px', paddingRight: '24px', overflowX: 'auto', background: 'rgb(245, 245, 245)', color: 'rgb(255, 255, 255)', borderBottom: '2px solid rgb(255, 205, 54)' };
  if (!navigationStyles || navigationStyles.navTop !== navigationStyles.headerBottom || Object.entries(expectedStyles).some(([key, value]) => navigationStyles[key] !== value)) {
    throw new Error(`El submenú no respeta el anclaje o los estilos solicitados: ${JSON.stringify(navigationStyles)}.`);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(120);
  const stickyTop = await navigation.evaluate((element) => Math.round(element.getBoundingClientRect().top));
  if (stickyTop !== navigationStyles.headerBottom) throw new Error(`El submenú dejó de estar fijo al hacer scroll (top=${stickyTop}).`);
  console.log('Submenú visual OK: pegado al header, fijo y con los atributos CSS solicitados.');
  for (const label of ['Home', 'Backlog de Campaña', 'Finanzas', 'Operación', 'Crisis y Jurídico', 'Comunicación', 'Reportes', 'Personal', 'Configuración']) {
    await navigation.getByText(label, { exact: true }).first().waitFor({ state: 'visible' });
  }

  const visits = [
    { group: 'Finanzas', item: 'Aportantes', path: '/smartplanner/contributors' },
    { group: 'Operación', item: 'Mapa de Avanzada', path: '/smartplanner/operations' },
    { group: 'Crisis y Jurídico', item: 'War Room', path: '/smartplanner/war-room' },
    { group: 'Comunicación', item: 'Centro de Comunicaciones', path: '/smartplanner/comunicaciones' }
  ];

  for (const visit of visits) {
    const toggle = navigation.getByRole('button', { name: visit.group, exact: true });
    await toggle.click();
    const menu = page.locator('[data-dropdown-portal].sp-secondary-nav__menu');
    await menu.waitFor({ state: 'visible' });
    const layering = await page.evaluate((group) => {
      const nav = document.querySelector('[data-smartplanner-nav]');
      const desktop = nav?.querySelector('.sp-secondary-nav__desktop');
      const menu = document.querySelector('[data-dropdown-portal].sp-secondary-nav__menu');
      const toggle = Array.from(nav?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim().startsWith(group));
      if (!nav || !desktop || !menu || !toggle) return null;
      const box = menu.getBoundingClientRect();
      const toggleBox = toggle.getBoundingClientRect();
      const point = document.elementFromPoint(box.left + Math.min(18, box.width / 2), box.top + Math.min(18, box.height / 2));
      return {
        navZIndex: Number.parseInt(getComputedStyle(nav).zIndex, 10),
        menuZIndex: Number.parseInt(getComputedStyle(menu).zIndex, 10),
        menuVisible: box.width > 0 && box.height > 0 && box.bottom <= window.innerHeight,
        menuOnTop: Boolean(point?.closest('[data-dropdown-portal].sp-secondary-nav__menu')),
        horizontalOffset: Math.round(Math.abs(box.left - toggleBox.left)),
        verticalOffset: Math.round(box.top - toggleBox.bottom)
      };
    }, visit.group);
    if (!layering || layering.navZIndex !== 100 || layering.menuZIndex < 1000 || !layering.menuVisible || !layering.menuOnTop || layering.horizontalOffset > 2 || layering.verticalOffset < 0 || layering.verticalOffset > 8) throw new Error(`${visit.group}: el dropdown quedó recortado, detrás del contenido o fuera de su trigger: ${JSON.stringify(layering)}.`);
    await menu.getByRole('link', { name: visit.item, exact: true }).click();
    await page.waitForURL(`${webUrl}${visit.path}`);
    if (!await toggle.evaluate((element) => element.classList.contains('is-active'))) {
      throw new Error(`${visit.path}: el grupo ${visit.group} no se resaltó como activo.`);
    }
    console.log(`Submenú OK: ${visit.group} → ${visit.item}, visible por encima del contenido.`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileSelect = navigation.getByLabel('Navegación de SmartPlanner');
  await mobileSelect.waitFor({ state: 'visible' });
  await mobileSelect.selectOption('/smartplanner/reports');
  await page.waitForURL(`${webUrl}/smartplanner/reports`);
  if ((await mobileSelect.inputValue()) !== '/smartplanner/reports') throw new Error('El selector móvil no refleja la ruta activa.');
  await page.setViewportSize({ width: 1440, height: 980 });
  console.log('Submenú móvil OK: selector compacto navega a Reportes.');
}

async function expectProfileLayering(page) {
  await page.getByLabel('Perfil').click();
  const menu = page.locator('.cs-topbar__profile .dropdown-menu.show');
  await menu.getByText('Cerrar sesión', { exact: true }).waitFor({ state: 'visible' });
  const layering = await page.evaluate(() => {
    const header = document.querySelector('.cs-topbar');
    const nav = document.querySelector('[data-smartplanner-nav]');
    const menu = document.querySelector('.cs-topbar__profile .dropdown-menu.show');
    if (!header || !nav || !menu) return null;
    const box = menu.getBoundingClientRect();
    const point = document.elementFromPoint(box.left + Math.min(18, box.width / 2), box.top + Math.min(18, box.height / 2));
    return {
      headerZIndex: Number.parseInt(getComputedStyle(header).zIndex, 10),
      navZIndex: Number.parseInt(getComputedStyle(nav).zIndex, 10),
      menuZIndex: Number.parseInt(getComputedStyle(menu).zIndex, 10),
      menuVisible: box.width > 0 && box.height > 0,
      menuOnTop: Boolean(point?.closest('.cs-topbar__profile .dropdown-menu'))
    };
  });
  if (!layering || layering.headerZIndex < 1000 || layering.navZIndex !== 100 || layering.menuZIndex < 1000 || !layering.menuVisible || !layering.menuOnTop) throw new Error(`El menú global de perfil quedó detrás de la navegación secundaria: ${JSON.stringify(layering)}.`);
  await page.getByLabel('Perfil').click();
  console.log(`Perfil global OK: header=${layering.headerZIndex}, menú=${layering.menuZIndex}, barra secundaria=${layering.navZIndex}.`);
}

try {
  const env = parseEnv(await readFile(envPath, 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  if (!orgId) throw new Error('No se pudo resolver la organización E2E.');
  const orgRef = db.collection('organizations').doc(orgId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  restore = () => orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true });
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: false } }, { merge: true });

  api = spawn(process.execPath, [resolve(serverDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'watch', 'src/index.ts'], { cwd: serverDir, env: { ...process.env, PORT: '8081' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForApi();
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5192'], { cwd: webDir, env: { ...process.env, VITE_FIREBASE_API_URL: apiUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForWeb();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[browser] ${message.text()}`); });
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
  page.on('requestfailed', (request) => console.error(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => { if (response.status() >= 500) console.error(`[response ${response.status()}] ${response.url()}`); });
  await page.goto(webUrl);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  const profileLoaded = page.waitForResponse((response) => response.ok() && /\/api\/me$/.test(new URL(response.url()).pathname), { timeout: 60_000 });
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);
  await profileLoaded;
  if (await page.locator('[data-smartplanner-nav]').count()) throw new Error('El submenú de SmartPlanner apareció fuera de /smartplanner/*.');
  await page.goto(`${webUrl}/smartplanner`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Este addon no está habilitado en tu plan').waitFor();
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  const addonsLoaded = page.waitForResponse((response) => response.ok() && /\/api\/me$/.test(new URL(response.url()).pathname), { timeout: 60_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await addonsLoaded;
  await page.getByRole('heading', { name: 'Cuartel de campaña', exact: true }).waitFor();
  await expectProfileLayering(page);
  await expectSecondaryNavigation(page);

  for (const route of smartPlannerRoutes) {
    await page.goto(`${webUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await expectVisibleBackButtons(page, route);
    console.log(`BackButton OK: ${route}`);
  }
  console.log(`BackButton navigation OK: ${smartPlannerRoutes.length}/${smartPlannerRoutes.length} rutas internas tienen controles arriba y abajo.`);

  await page.goto(`${webUrl}/smartplanner/tickets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-back-button="hero"] .cd-back-button--icon').click();
  await page.waitForURL(`${webUrl}/smartplanner`);
  await page.goto(`${webUrl}/smartplanner/tickets`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-back-button="page"] .cd-back-button--link').click();
  await page.waitForURL(`${webUrl}/smartplanner`);
  console.log('Navegación real OK: BackButton superior e inferior vuelven a /smartplanner.');

  await page.getByLabel(/Rol de /).first().click();
  const layering = await page.evaluate(() => {
    const dropdown = document.querySelector('.cd-select-dropdown.is-open');
    const menu = document.querySelector('[data-dropdown-portal]');
    if (!dropdown || !menu) return null;
    const box = menu.getBoundingClientRect();
    const point = document.elementFromPoint(box.left + Math.min(16, box.width / 2), box.top + Math.min(16, box.height / 2));
    return {
      menuZIndex: Number.parseInt(getComputedStyle(menu).zIndex, 10),
      topElementIsMenu: Boolean(point?.closest('[data-dropdown-portal]'))
    };
  });
  if (!layering || layering.menuZIndex < 1000 || !layering.topElementIsMenu) throw new Error(`El SelectControl de Roles quedó detrás de su card: ${JSON.stringify(layering)}.`);
  console.log(`SelectControl Roles OK: menú por encima de la card (menú=${layering.menuZIndex}).`);
} finally {
  await browser?.close();
  await restore?.();
  vite?.kill();
  api?.kill();
}
