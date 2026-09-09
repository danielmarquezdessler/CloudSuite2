import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = process.env.PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'politicfy-cloudsuite';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`
  });
}

export const adminAuth = getAuth();
export const db = getFirestore();
export const storage = getStorage();

/**
 * Hace una lectura sin efectos colaterales para validar ADC y conectividad con
 * Firestore antes de abrir la API. La colección no necesita existir.
 */
export async function verifyFirestoreReachability() {
  await db.collection('_server_healthcheck').limit(1).get();
}

export function getFirestoreStartupDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const isInvalidAdc = [
    'invalid_grant',
    'invalid_rapt',
    'reauth',
    'credentials are no longer valid',
    'application default credentials',
    'could not load the default credentials'
  ].some((pattern) => normalized.includes(pattern));

  if (isInvalidAdc) {
    return '⚠️ ADC inválido o vencido — corré: gcloud auth application-default login';
  }

  return '⚠️ Firestore no está disponible al iniciar. La API seguirá expuesta con firestoreReachable: false.';
}
