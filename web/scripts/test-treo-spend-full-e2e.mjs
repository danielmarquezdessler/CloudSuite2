import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = resolve(root, 'server');
const parseEnv = async (path) => Object.fromEntries((await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => line.split('=')));
const env = await parseEnv(resolve(web, '.env.test'));
const publicEnv = await parseEnv(resolve(web, '.env'));
const port = 8107; const api = `http://127.0.0.1:${port}`; let apiProcess;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

try {
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const user = await adminAuth.getUserByEmail(env.E2E_EMAIL);
  const profile = await db.collection('users').doc(user.uid).get();
  const orgId = env.E2E_ORG_ID || profile.data().orgIds[0];
  const campaignId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0].id;
  const campaign = db.collection('organizations').doc(orgId).collection('campaigns').doc(campaignId);
  const suffix = `treo-spend-${Date.now()}`;
  await db.collection('organizations').doc(orgId).set({ enabledAddons: { ...(await db.collection('organizations').doc(orgId).get()).data().enabledAddons, finance: true } }, { merge: true });
  await Promise.all([
    campaign.collection('budgets').doc(suffix).set({ category: 'Imprenta E2E', amount: 125000, spent: 25000, createdAt: new Date() }),
    campaign.collection('spProviders').doc(suffix).set({ name: 'Proveedor E2E', createdAt: new Date() }),
    campaign.collection('spProviderProjects').doc(suffix).set({ providerId: suffix, name: 'Proyecto E2E', createdAt: new Date() })
  ]);
  apiProcess = spawn(process.execPath, [resolve(server, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: server, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(`${api}/health`)).ok) break; } catch { /* booting */ } await sleep(100); }
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${publicEnv.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, returnSecureToken: true }) });
  const token = (await login.json()).idToken; const base = `/api/organizations/${orgId}/campaigns/${campaignId}/treo/spend`;
  const request = async (path, options = {}) => { const response = await fetch(api + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } }); const data = await response.json(); if (!response.ok) throw Object.assign(new Error(`${response.status}:${data.message}`), { status: response.status }); return data; };
  const post = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const chart = await request(`/api/organizations/${orgId}/campaigns/${campaignId}/treo/chart-of-accounts`); const bank = chart.find((item) => item.code === '1.1.02'); if (!bank) throw new Error('No existe Banco en el plan contable.');
  const first = await post(`${base}/migrate`, {}); const second = await post(`${base}/migrate`, {});
  if (first.copied.budgets !== 1 || first.copied.vendors !== 1 || first.copied.projects !== 1 || Object.values(second.copied).some(Boolean)) throw new Error('Migración no idempotente.');
  const [legacyBudget, legacyVendor, legacyProject] = await Promise.all([campaign.collection('treoBudgetLines').doc(`legacy-budget-${suffix}`).get(), campaign.collection('treoVendors').doc(`legacy-vendor-${suffix}`).get(), campaign.collection('treoProcurements').doc(`legacy-project-${suffix}`).get()]);
  if (!legacyBudget.exists || !legacyVendor.exists || !legacyProject.exists) throw new Error('Migración incompleta.');
  const budget = await post(`${base}/budgets`, { name: `Imprenta ${suffix}`, approved: 100000, stage: 'Campaña', activity: 'Volantes', costCenter: 'Territorio' });
  const expansion = await post(`${base}/budget-changes`, { kind: 'ampliacion', toBudgetId: budget.id, amount: 20000, reason: 'Refuerzo de tirada' }); await post(`${base}/budget-changes/${expansion.id}/approve`, {}); if ((await campaign.collection('treoBudgetLines').doc(budget.id).get()).data().approved !== 120000) throw new Error('La ampliación aprobada no actualizó la partida.');
  const order = await post(`${base}/orders`, { budgetId: budget.id, vendorId: legacyVendor.id, object: 'Imprenta', amount: 100000, orderedQty: 100, operationId: `${suffix}:order` });
  await post(`${base}/orders/${order.id}/receive`, { receivedQty: 80, evidence: 'Acta parcial' }); let blocked = false;
  try { await post(`${base}/orders/${order.id}/recognize`, { amount: 100000, expenseAccountId: '5-1-01' }); } catch (error) { blocked = error.status === 400; } if (!blocked) throw new Error('3-way match no bloqueó 100 facturado y 80 recibido.');
  await post(`${base}/orders/${order.id}/receive`, { receivedQty: 100, evidence: 'Conformidad final' }); await post(`${base}/orders/${order.id}/recognize`, { amount: 100000, expenseAccountId: '5-1-01' });
  const recognized = await campaign.collection('treoBudgetLines').doc(budget.id).get(); if (recognized.data().committed !== 0 || recognized.data().recognized !== 100000) throw new Error('Compromiso/reconocimiento incorrecto.');
  const payment = await post(`${base}/payments`, { orderId: order.id, amount: 40000, bankAccountId: bank.id }); await post(`${base}/payments/${payment.id}/approve`, {}); await post(`${base}/payments/${payment.id}/send`, {});
  if ((await campaign.collection('treoBudgetLines').doc(budget.id).get()).data().paid !== 0) throw new Error('Enviado se contó como pagado.'); await post(`${base}/payments/${payment.id}/confirm`, {}); await post(`${base}/payments/${payment.id}/reconcile`, {}); let retryBlocked = false; try { await post(`${base}/payments/${payment.id}/confirm`, {}); } catch (error) { retryBlocked = error.status === 400; } if (!retryBlocked) throw new Error('Un reintento de pago confirmado volvió a contabilizar el desembolso.');
  let excessBlocked = false; try { await post(`${base}/payments`, { orderId: order.id, amount: 70000, bankAccountId: bank.id }); } catch (error) { excessBlocked = error.status === 400; } if (!excessBlocked) throw new Error('Pago parcial excedió saldo.');
  if ((await campaign.collection('treoBudgetLines').doc(budget.id).get()).data().paid !== 40000) throw new Error('Pago confirmado no actualizó partida.');
  const advance = await post(`${base}/advances`, { responsibleId: user.uid, purpose: 'Viáticos móvil', activity: 'Recorrida', amount: 200000, fundingAccountId: bank.id });
  const receiptForm = new FormData(); receiptForm.append('kind', 'rendicion'); receiptForm.append('operationId', advance.operationId); receiptForm.append('document', new Blob(['comprobante móvil de rendición'], { type: 'text/plain' }), 'rendicion-movil.txt');
  const receiptResponse = await fetch(`${api}/api/organizations/${orgId}/campaigns/${campaignId}/treo/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: receiptForm }); const receipt = await receiptResponse.json(); if (!receiptResponse.ok || !receipt.file?.path) throw new Error(`No se subió el comprobante móvil: ${receipt.message ?? receiptResponse.status}`);
  const receiptFile = await (await import('../../server/dist/config/firebase.js')).storage.bucket().file(receipt.file.path).exists(); if (!receiptFile[0]) throw new Error('El comprobante de rendición no quedó aislado en Storage.');
  const settled = await post(`${base}/advances/${advance.id}/settle`, { approvedExpenses: 160000, returned: 40000, expenseAccountId: '5-1-03', advanceAccountId: '1-1-04', receiptDocumentIds: [receipt.id] });
  if (settled.approvedExpenses !== 160000 || settled.returned !== 40000 || settled.status !== 'rendido') throw new Error('Anticipo/rendición incorrecto.');
  let isolation403 = false; try { await request(`/api/organizations/${orgId}/campaigns/missing-${suffix}/treo/spend/budgets`); } catch (error) { isolation403 = error.status === 403; } if (!isolation403) throw new Error('Aislamiento no devolvió 403.');
  const audit = await campaign.collection('auditLog').get(); if (!audit.docs.some((item) => String(item.data().action).startsWith('TREO_'))) throw new Error('No hay auditoría Treo.');
  console.log('Treo spend full E2E OK: migración idempotente, presupuesto, 3-way, pagos, anticipo y aislamiento 403.');
} finally { if (apiProcess?.exitCode === null) apiProcess.kill(); }
