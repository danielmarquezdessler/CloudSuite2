import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const webDir = fileURLToPath(new URL('../', import.meta.url));
const envPath = fileURLToPath(new URL('../.env.test', import.meta.url));
const url = 'http://127.0.0.1:5192';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
const env = Object.fromEntries((await readFile(envPath, 'utf8')).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
let browser; let vite; let cleanup = async () => {};

async function waitForVite() {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* Vite todavía inicia. */ }
    await wait(300);
  }
  throw new Error('Vite no respondió para el E2E financiero.');
}

try {
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const authUser = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(authUser.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0];
  const campId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campId) throw new Error('No se pudo resolver la campaña E2E financiera.');
  const orgRef = db.collection('organizations').doc(orgId);
  const campRef = orgRef.collection('campaigns').doc(campId);
  const originalAddons = (await orgRef.get()).data()?.enabledAddons;
  const originalLimit = (await campRef.get()).data()?.legalSpendingLimit;
  const ids = { contributors: [], providers: [], projects: [], invoices: [], contracts: [] };
  cleanup = async () => {
    await Promise.all(ids.contributors.map((id) => campRef.collection('spContributors').doc(id).delete()));
    await Promise.all(ids.projects.map((id) => campRef.collection('spProviderProjects').doc(id).delete()));
    await Promise.all(ids.providers.map((id) => campRef.collection('spProviders').doc(id).delete()));
    await Promise.all(ids.invoices.map((id) => campRef.collection('spInvoices').doc(id).delete()));
    await Promise.all(ids.contracts.map((id) => campRef.collection('spContracts').doc(id).delete()));
    await campRef.set({ legalSpendingLimit: originalLimit ?? 0 }, { merge: true });
    await orgRef.set({ enabledAddons: originalAddons ?? { smartPlanner: false } }, { merge: true });
  };
  await orgRef.set({ enabledAddons: { ...(originalAddons ?? {}), smartPlanner: true } }, { merge: true });
  vite = spawn(process.execPath, [resolve(webDir, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5192'], { cwd: webDir, stdio: 'ignore' });
  await waitForVite();
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(25_000);
  await page.goto(url);
  await page.getByLabel('Email').fill(env.E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(env.E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(/dashboard/);

  const contributorName = `Aportante E2E ${Date.now()}`;
  await page.goto(`${url}/smartplanner/contributors`);
  await page.getByRole('button', { name: 'Nuevo aportante', exact: true }).click();
  await page.getByLabel('Nombre').fill(contributorName);
  await page.getByLabel('Monto').fill('75000');
  const contributorResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/contributors$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const contributor = await (await contributorResponse).json(); ids.contributors.push(contributor.id);
  await page.getByLabel(`Mover ${contributorName}`).click();
  await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Confirmado' }).click();
  if ((await campRef.collection('spContributors').doc(contributor.id).get()).data()?.stage !== 'confirmado') throw new Error('El aportante no quedó confirmado en Firestore.');
  console.log('Aportantes E2E OK: creación y movimiento prospecto → confirmado persistidos en Firestore.');

  const providerName = `Imprenta Sur E2E ${Date.now()}`;
  await page.goto(`${url}/smartplanner/providers`);
  await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  await page.getByLabel('Nombre del proveedor').fill(providerName);
  const providerResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/providers$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  const provider = await (await providerResponse).json(); ids.providers.push(provider.id);
  await page.getByText(providerName, { exact: true }).click();
  const projectName = `Folletos E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Nuevo proyecto', exact: true }).click();
  await page.getByLabel('Título del proyecto').fill(projectName);
  await page.getByLabel('Presupuesto').fill('100000');
  await page.getByLabel('Gasto informado').fill('58000');
  const projectResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/provider-projects$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Guardar proyecto', exact: true }).click();
  const project = await (await projectResponse).json(); ids.projects.push(project.id);
  if ((await campRef.collection('spProviderProjects').doc(project.id).get()).data()?.spent !== 58000) throw new Error('El gasto del proyecto no llegó a Firestore.');
  console.log('Proveedores E2E OK: Imprenta Sur y su proyecto con presupuesto/gasto real están en Firestore.');

  await page.goto(`${url}/smartplanner`);
  page.once('dialog', (dialog) => dialog.accept('100'));
  await page.getByRole('button', { name: 'Definir tope', exact: true }).click();
  await page.getByText('Alerta: el gasto supera el tope legal.', { exact: true }).waitFor();
  await page.goto(`${url}/planning/budget`);
  await page.getByText('Alerta legal:', { exact: false }).waitFor();
  console.log('Tope legal E2E OK: alerta visible tanto en SmartPlanner como en Presupuesto.');

  await page.goto(`${url}/smartplanner/invoices`);
  const invoiceName = `Factura E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Nueva factura', exact: true }).click();
  await page.getByLabel('Descripción de comprobante').fill(invoiceName);
  await page.getByLabel('Monto de comprobante').fill('34000');
  const invoiceResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/invoices$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Guardar comprobante', exact: true }).click();
  const invoice = await (await invoiceResponse).json(); ids.invoices.push(invoice.id);
  await page.getByLabel('Filtrar comprobantes por estado').click();
  await page.locator('.dropdown-menu.show .dropdown-item').filter({ hasText: 'Emitida' }).click();
  await page.getByText(invoiceName, { exact: false }).waitFor();
  const creditResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/smartplanner/invoices/${invoice.id}/credit-note`));
  await page.getByRole('button', { name: 'Nota de crédito', exact: true }).click();
  const credit = await (await creditResponse).json(); ids.invoices.push(credit.id);
  if ((await campRef.collection('spInvoices').doc(credit.id).get()).data()?.relatedInvoiceId !== invoice.id) throw new Error('La nota de crédito no quedó vinculada a la factura.');
  console.log('Facturación E2E OK: filtro de estado, factura emitida y nota de crédito vinculada confirmados.');

  await page.goto(`${url}/smartplanner/contracts`);
  const contractName = `Contrato E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Nuevo contrato', exact: true }).click();
  await page.getByLabel('Título de contrato').fill(contractName);
  await page.getByLabel('Contenido de contrato').fill('Servicio de impresión de folletos.');
  await page.getByLabel('Monto de contrato').fill('120000');
  const contractResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/contracts$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Guardar contrato', exact: true }).click();
  const contract = await (await contractResponse).json(); ids.contracts.push(contract.id);
  await page.getByRole('button', { name: 'Firmar', exact: true }).click();
  const pad = page.locator('canvas.sp-signature-pad');
  await pad.dispatchEvent('pointerdown', { clientX: 40, clientY: 60 }); await pad.dispatchEvent('pointermove', { clientX: 180, clientY: 95 }); await pad.dispatchEvent('pointerup', { clientX: 180, clientY: 95 });
  const signingResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/smartplanner/contracts/${contract.id}/sign`));
  await page.getByRole('button', { name: 'Confirmar firma', exact: true }).click(); await signingResponse;
  const signed = (await campRef.collection('spContracts').doc(contract.id).get()).data();
  if (signed?.status !== 'firmado' || signed?.type !== 'proveedor' || signed?.content !== 'Servicio de impresión de folletos.' || !String(signed?.signatureUrl ?? '').startsWith('gs://')) throw new Error('El contrato o su firma no se registraron como corresponde.');
  console.log('Contratos E2E OK: tipo/contenido, firma y referencia de Firebase Storage persistidos.');
} finally {
  await browser?.close();
  await cleanup();
  vite?.kill();
}
