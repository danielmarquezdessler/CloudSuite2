import { DependencyList, useCallback, useEffect, useState } from 'react';
import { User } from 'firebase/auth';

export const apiBaseUrl = import.meta.env.VITE_FIREBASE_API_URL ?? 'http://127.0.0.1:8080';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiResult<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
};

export type ApiQueryState<T> = ApiResult<T> & {
  loading: boolean;
  reload: () => Promise<void>;
};

function messageForStatus(status: number, detail?: string) {
  if (status === 401) return 'Tu sesión venció. Iniciá sesión nuevamente para continuar.';
  if (status === 403) return 'No tenés permisos para realizar esta acción.';
  if (status === 404) return detail || 'No encontramos la información solicitada.';
  if (status >= 500) return 'No pudimos completar la operación en este momento. Intentá nuevamente.';
  return detail || 'La operación no pudo completarse.';
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
    if (response.status === 204) return { data: null, error: null, loading: false };
    const body = await response.json().catch(() => null) as (T & { message?: string }) | null;
    if (!response.ok) return { data: null, error: new ApiError(messageForStatus(response.status, body?.message), response.status), loading: false };
    return { data: body as T, error: null, loading: false };
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === 'AbortError';
    return { data: null, error: new ApiError(timedOut ? 'La solicitud tardó demasiado. Intentá nuevamente.' : 'No pudimos conectar con el servidor. Verificá tu conexión e intentá nuevamente.'), loading: false };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function authenticatedRequest<T>(user: User, path: string, init: RequestInit = {}) {
  try {
    return await request<T>(path, init, await user.getIdToken());
  } catch {
    return { data: null, error: new ApiError('No pudimos validar tu sesión. Iniciá sesión nuevamente.'), loading: false } as ApiResult<T>;
  }
}

export function publicRequest<T>(path: string, init: RequestInit = {}) {
  return request<T>(path, init);
}

/** A safe query hook: rendering code always receives data, error and loading. */
export function useAuthenticatedQuery<T>(user: User | null, path: string | null, dependencies: DependencyList = []): ApiQueryState<T> {
  const [state, setState] = useState<Omit<ApiQueryState<T>, 'reload'>>({ data: null, error: null, loading: Boolean(user && path) });
  const load = useCallback(async () => {
    if (!user || !path) { setState({ data: null, error: null, loading: false }); return; }
    setState(current => ({ ...current, loading: true, error: null }));
    const result = await authenticatedRequest<T>(user, path);
    setState({ ...result, loading: false });
  }, [user, path, ...dependencies]);

  useEffect(() => { void load(); }, [load]);
  return { ...state, reload: load };
}
