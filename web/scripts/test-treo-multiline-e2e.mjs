import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = resolve(root, 'server');
const parseEnv = async (path) => Object.fromEntries((await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => line.split('=')));
const env = await parseEnv(resolve(web, '.env.test')); const publicEnv = await parseEnv(resolve(web, '.env'));
const port = 8111; const api = `http://127.0.0.1:${port}`; const wait = (ms) => new Promise((done) => setTimeout(done, ms)); let apiProcess;

try {
  const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
  const user = await adminAuth.getUserByEmail(env.E2E_EMAIL); const profile = await db.collection('users').doc(user.uid).get(); const orgId = env.E2E_ORG_ID || profile.data()?.orgIds?.[0]; const campaignId = env.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
  if (!orgId || !campaignId) throw new Error('No se encontró contexto E2E para órdenes multilínea.');
  const org = db.collection('organizations').doc(orgId); const campaign = org.collection('campaigns').doc(campaignId); const suffix = `multi-${Date.now()}`;
  await org.set({ enabledAddons: { ...(await org.get()).data()?.enabledAddons, finance: true } }, { merge: true });
  apiProcess = spawn(process.execPath, [resolve(server, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/index.ts'], { cwd: server, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(`${api}/health`)).ok) break; } catch { /* booting */ } await wait(100); }
  const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${publicEnv.VITE_FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, returnSecureToken: true }) });
  const token = (await login.json()).idToken; if (!token) throw new Error('No se obtuvo token E2E.'); const base = `/api/organizations/${orgId}/campaigns/${campaignId}/treo/spend`;
  const request = async (path, options = {}) => { const response = await fetch(`${api}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } }); const data = response.status === 204 ? null : await response.json(); if (!response.ok) throw Object.assign(new Error(`${response.status}:${data?.message}`), { status: response.status, data }); return data; };
  const post = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const vendor = await post(`${base}/vendors`, { name: `Proveedor multilínea ${suffix}` }); const budgetA = await post(`${base}/budgets`, { name: `Partida A ${suffix}`, approved: 200000 }); const budgetB = await post(`${base}/budgets`, { name: `Partida B ${suffix}`, approved: 150000 });
  const lines = [{ id: 'papel', description: 'Papel', orderedQty: 2, unitPrice: 10000, budgetId: budgetA.id }, { id: 'tinta', description: 'Tinta', orderedQty: 3, unitPrice: 20000, budgetId: budgetB.id }, { id: 'diseño', description: 'Diseño', orderedQty: 4, unitPrice: 5000, budgetId: budgetA.id }];
  const order = await post(`${base}/orders`, { vendorId: vendor.id, budgetId: budgetA.id, object: 'Imprenta multilínea', operationId: `${suffix}:operation`, lines });
  if (order.amount !== 100000 || order.lines.length !== 3 || order.lines.find((line) => line.id === 'tinta')?.lineTotal !== 60000) throw new Error(`Total multilínea incorrecto: ${JSON.stringify(order.lines)}`);
  let [a, b] = await Promise.all([campaign.collection('treoBudgetLines').doc(budgetA.id).get(), campaign.collection('treoBudgetLines').doc(budgetB.id).get()]); if (a.data()?.committed !== 40000 || b.data()?.committed !== 60000) throw new Error(`Compromiso duplicado o incorrecto: A=${a.data()?.committed}, B=${b.data()?.committed}`);
  const partial = await post(`${base}/orders/${order.id}/receive`, { evidence: 'Acta parcial por línea', lines: [{ lineId: 'papel', receivedQty: 2 }, { lineId: 'tinta', receivedQty: 1 }, { lineId: 'diseño', receivedQty: 0 }] }); if (partial.status !== 'recepcion_parcial') throw new Error('La recepción parcial no quedó en estado parcial.');
  let blocked = false; try { await post(`${base}/orders/${order.id}/recognize`, { expenseAccountId: '5-1-01', lines: [{ lineId: 'tinta', amount: 60000 }] }); } catch (error) { blocked = error.status === 400; } if (!blocked) throw new Error('El 3-way match dejó facturar una línea por encima de su recepción.');
  const partialInvoice = await post(`${base}/orders/${order.id}/recognize`, { expenseAccountId: '5-1-01', lines: [{ lineId: 'papel', amount: 20000 }, { lineId: 'tinta', amount: 20000 }] }); if (partialInvoice.invoiceAmount !== 40000 || partialInvoice.status !== 'factura_parcial') throw new Error('La factura parcial no se reconoció por líneas.');
  let paymentBlocked = false; try { await post(`${base}/payments`, { orderId: order.id, amount: 100000, bankAccountId: '1-1-02' }); } catch (error) { paymentBlocked = error.status === 400; } if (!paymentBlocked) throw new Error('Se habilitó pago completo pese a diferencias por línea.');
  await post(`${base}/orders/${order.id}/receive`, { evidence: 'Conformidad final por línea', lines: [{ lineId: 'tinta', receivedQty: 3 }, { lineId: 'diseño', receivedQty: 4 }] });
  const finalInvoice = await post(`${base}/orders/${order.id}/recognize`, { expenseAccountId: '5-1-01', lines: [{ lineId: 'tinta', amount: 40000 }, { lineId: 'diseño', amount: 20000 }] }); if (finalInvoice.status !== 'factura_reconocida' || finalInvoice.invoiceAmount !== 100000) throw new Error('La factura final por líneas no cerró la orden.');
  [a, b] = await Promise.all([campaign.collection('treoBudgetLines').doc(budgetA.id).get(), campaign.collection('treoBudgetLines').doc(budgetB.id).get()]); if (a.data()?.committed !== 0 || a.data()?.recognized !== 40000 || b.data()?.committed !== 0 || b.data()?.recognized !== 60000) throw new Error(`Ejecución por líneas duplicada: A=${JSON.stringify(a.data())}, B=${JSON.stringify(b.data())}`);
  const legacyRef = campaign.collection('treoProcurements').doc(`legacy-line-${suffix}`); await legacyRef.set({ orgId, campaignId, operationId: `${suffix}:legacy`, vendorId: vendor.id, budgetId: budgetA.id, object: 'Orden antigua', orderedQty: 2, unitPrice: 5000, amount: 10000, receivedQty: 0, status: 'orden_emitida' }); const queue = await request(`${base}/queue`); const migrated = queue.orders.find((item) => item.id === legacyRef.id); if (!migrated?.lines?.length || migrated.lines[0].lineTotal !== 10000) throw new Error('La orden antigua no migró a una línea idempotente.'); const again = await request(`${base}/queue`); if (again.orders.find((item) => item.id === legacyRef.id)?.lines?.length !== 1) throw new Error('La migración de orden antigua duplicó líneas.');
  let isolation403 = false; try { await request(`/api/organizations/${orgId}/campaigns/other-${suffix}/treo/spend/queue`); } catch (error) { isolation403 = error.status === 403; } if (!isolation403) throw new Error('El aislamiento por campaña no devolvió 403.'); const audit = await campaign.collection('auditLog').get(); if (!audit.docs.some((item) => String(item.data()?.action).includes('ORDER_LINES'))) throw new Error('No se registró auditoría append-only por líneas.');
  console.log('Treo multilínea E2E OK: 3 líneas=$100000, compromisos A=$40000/B=$60000, recepción parcial, factura por línea, bloqueo de pago completo, migración legacy e aislamiento 403.');
} finally { if (apiProcess?.exitCode === null) apiProcess.kill(); }
