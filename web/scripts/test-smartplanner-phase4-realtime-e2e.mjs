import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getFirestore, onSnapshot, orderBy, query } from 'firebase/firestore';

const parseEnv = async (path) => Object.fromEntries((await readFile(new URL(path, import.meta.url), 'utf8')).split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const [runtime, test] = await Promise.all([parseEnv('../.env'), parseEnv('../.env.test')]);
const client = initializeApp({ apiKey: runtime.VITE_FIREBASE_API_KEY, authDomain: runtime.VITE_FIREBASE_AUTH_DOMAIN, projectId: runtime.VITE_FIREBASE_PROJECT_ID, appId: runtime.VITE_FIREBASE_APP_ID });
const auth = getAuth(client); const firestore = getFirestore(client);
const { adminAuth, db } = await import('../../server/dist/config/firebase.js');
const dayService = await import('../../server/dist/services/smartplannerCrisis.service.js');
const account = await adminAuth.getUserByEmail(test.E2E_EMAIL);
const profile = await db.collection('users').doc(account.uid).get();
const orgId = test.E2E_ORG_ID || profile.data()?.orgIds?.[0];
const campId = test.E2E_CAMPAIGN_ID || (await db.collection('organizations').doc(orgId).collection('campaigns').limit(1).get()).docs[0]?.id;
if (!orgId || !campId) throw new Error('No se pudo resolver organización/campaña E2E.');
const backendUser = { uid: account.uid, email: account.email, ...(account.customClaims ?? {}) };
const currentUser = await signInWithEmailAndPassword(auth, test.E2E_EMAIL, test.E2E_PASSWORD);
await currentUser.user.getIdToken(true);
const rows = await dayService.dayTasks(backendUser, orgId, campId);
if (!rows.length) throw new Error('No hay tareas del Día D para auditar.');
const target = rows[0]; const nextStatus = target.status === 'completada' ? 'pendiente' : 'completada';
const source = query(collection(firestore, 'organizations', orgId, 'campaigns', campId, 'spElectionDayTasks'), orderBy('time'));
let initial = false; let timer; let unsubscribe;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('onSnapshot no entregó el snapshot inicial en 15s.')), 15000);
    unsubscribe = onSnapshot(source, (snapshot) => { if (!initial) { initial = true; clearTimeout(timer); resolve(snapshot); } }, reject);
  });
  const observed = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('onSnapshot no reflejó el cambio remoto en 15s.')), 15000);
    const original = unsubscribe; unsubscribe = onSnapshot(source, (snapshot) => {
      if (snapshot.docs.some((document) => document.id === target.id && document.data().status === nextStatus)) { clearTimeout(timer); original?.(); resolve(snapshot); }
    }, reject);
  });
  await dayService.saveDayTask(backendUser, orgId, campId, target.id, { ...target, status: nextStatus, category: 'otro' });
  await observed;
  console.log(`Día D realtime E2E OK: el cliente Firebase recibió por onSnapshot el cambio remoto de ${target.id} a ${nextStatus}, sin recargar.`);
} finally {
  if (target?.id) await dayService.saveDayTask(backendUser, orgId, campId, target.id, { ...target, status: target.status, category: 'otro' });
  unsubscribe?.(); if (timer) clearTimeout(timer); await signOut(auth); await deleteApp(client);
}
