import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'politicfy-cloudsuite';

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId
  });
}

export const adminAuth = getAuth();
export const db = getFirestore();
