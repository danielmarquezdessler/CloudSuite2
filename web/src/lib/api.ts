import { User } from 'firebase/auth';

export const apiBaseUrl = import.meta.env.VITE_FIREBASE_API_URL ?? 'http://127.0.0.1:8080';

export async function authenticatedFetch(user: User, path: string, init: RequestInit = {}) {
  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message ?? 'La operación no pudo completarse.');
  }

  if (response.status === 204) return undefined;
  return response.json();
}

export async function publicFetch(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`);
  const body = await response.json().catch(() => ({ message: response.statusText }));
  if (!response.ok) throw new Error(body.message ?? 'La operación no pudo completarse.');
  return body;
}
