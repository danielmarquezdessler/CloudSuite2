import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase.js';

export type NotificationInput = { type: string; title: string; message: string; metadata?: Record<string, unknown> };
const notifications = (uid: string) => db.collection('users').doc(uid).collection('notifications');
export async function createNotification(uid: string, input: NotificationInput) {
  const ref = notifications(uid).doc();
  await ref.set({ ...input, metadata: input.metadata ?? {}, read: false, archived: false, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 86400000)) });
  return { id: ref.id };
}
export async function listNotifications(uid: string) { const snap = await notifications(uid).orderBy('createdAt', 'desc').limit(100).get(); return snap.docs.filter(doc => doc.data().archived !== true).slice(0, 50).map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString() ?? null })); }
export async function markRead(uid: string, notificationId: string) { await notifications(uid).doc(notificationId).update({ read: true, readAt: FieldValue.serverTimestamp() }); }
export async function archiveNotification(uid: string, notificationId: string) { await notifications(uid).doc(notificationId).update({ archived: true, archivedAt: FieldValue.serverTimestamp() }); }
