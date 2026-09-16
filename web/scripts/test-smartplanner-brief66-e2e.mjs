import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const app = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const parse = (source) => Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let browser;
let restore;
try {
  const env = parse(await readFile(new URL('../.env.test', import.meta.url), 'utf8'));
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const account = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(account.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se encontró el contexto E2E para SmartPlanner.');

  const organization = db.collection('organizations').doc(orgId);
  const campaign = organization.collection('campaigns').doc(campId);
  const originalAddons = (await organization.get()).data()?.enabledAddons ?? {};
  const areaSnap = await campaign.collection('spAreas').limit(1).get();
  if (areaSnap.empty) throw new Error('La campaña E2E no tiene un área SmartPlanner para verificar el Kanban.');
  const area = areaSnap.docs[0];
  const taskId = `brief66-${Date.now()}`;
  const task = campaign.collection('spTasks').doc(taskId);
  restore = async () => {
    await task.delete();
    await organization.set({ enabledAddons: originalAddons }, { merge: true });
  };
  await organization.set({ enabledAddons: { ...originalAddons, smartPlanner: true } }, { merge: true });
  await task.set({ displayId: `PBI-E2E-${Date.now()}`, title: `PBI Brief 66 ${Date.now()}`, description: 'Fixture temporal de verificación.', areaId: area.id, assignedTo: account.uid, status: 'por_hacer', priority: 'alta', startDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), cost: 0, createdAt: new Date().toISOString(), createdBy: account.uid });

  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  page.setDefaultTimeout(20_000);
  await page.goto(app);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  await page.goto(`${app}/smartplanner`);
  const priorityRow = page.locator(`[data-priority-pbi="${taskId}"]`);
  await priorityRow.waitFor();
  await priorityRow.click();
  await page.waitForURL(new RegExp(`/smartplanner/pbi/${taskId}$`));

  await page.goto(`${app}/smartplanner/backlog?area=${encodeURIComponent(area.id)}`);
  const areaTab = page.locator('.sp-backlog__area-tabs .sp-tab').filter({ hasText: area.data().name }).first();
  await areaTab.waitFor();
  const tabStyle = await areaTab.evaluate((element) => { const style = getComputedStyle(element); return { className: element.className, radius: style.borderRadius, weight: style.fontWeight, background: style.backgroundColor, color: style.color }; });
  if (tabStyle.radius === '0px' || Number(tabStyle.weight) < 700 || tabStyle.background === 'rgba(0, 0, 0, 0)') throw new Error(`El filtro de área no tiene el estilo canónico: ${JSON.stringify(tabStyle)}.`);

  const card = page.locator(`[data-kanban-task="${taskId}"]`);
  const destination = page.locator('[data-kanban-column="en_progreso"]');
  await card.waitFor();
  const sourceBox = await card.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error('No fue posible medir el Kanban para el arrastre real.');
  const moved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes(`/smartplanner/tasks/${taskId}`));
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(destinationBox.x + destinationBox.width / 2, destinationBox.y + destinationBox.height / 2, { steps: 10 });
  await page.mouse.up();
  if (!(await moved).ok()) throw new Error('El arrastre no actualizó el PBI mediante la API real.');
  for (let attempt = 0; attempt < 20 && (await task.get()).data()?.status !== 'en_progreso'; attempt += 1) await pause(150);
  if ((await task.get()).data()?.status !== 'en_progreso') throw new Error('El arrastre no persistió en Firestore.');
  if (new URL(page.url()).pathname !== '/smartplanner/backlog') throw new Error('El arrastre abrió el detalle del PBI.');
  await page.locator(`[data-kanban-task="${taskId}"]`).getByRole('button', { name: /Ver detalle de/ }).click();
  await page.waitForURL(new RegExp(`/smartplanner/pbi/${taskId}$`));

  await page.goto(`${app}/smartplanner/backlog?area=${encodeURIComponent(area.id)}`);
  const pageSize = page.getByLabel('Filas por página de PBIs');
  await pageSize.scrollIntoViewIfNeeded();
  await pageSize.click();
  const menu = page.locator('[data-dropdown-portal]').last();
  await menu.waitFor();
  const placement = await page.evaluate(() => { const trigger = document.querySelector('[aria-label="Filas por página de PBIs"]')?.getBoundingClientRect(); const dropdown = document.querySelector('[data-dropdown-portal]')?.getBoundingClientRect(); return { side: document.querySelector('[data-dropdown-portal]')?.getAttribute('data-dropdown-placement'), delta: dropdown && trigger ? dropdown.top - trigger.bottom : null }; });
  if (placement.side !== 'below' || placement.delta === null || Math.abs(placement.delta - 6) > 2) throw new Error(`El selector de filas no quedó pegado al trigger: ${JSON.stringify(placement)}.`);
  console.log('Brief 66 E2E real OK: PBI prioritario, drag sin navegación + Ver, tabs y paginación portal verificados.');
} finally {
  await browser?.close();
  await restore?.();
}
