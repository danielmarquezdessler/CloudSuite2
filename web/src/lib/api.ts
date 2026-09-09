import { User } from 'firebase/auth';
import { apiBaseUrl, authenticatedRequest, publicRequest } from './apiClient';

export { apiBaseUrl };
export { ApiError, authenticatedRequest, publicRequest, useAuthenticatedQuery } from './apiClient';

/** Compatibility adapter for existing commands. Queries should prefer authenticatedRequest/useAuthenticatedQuery. */
export async function authenticatedFetch<T = any>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const result = await authenticatedRequest<T>(user, path, init);
  if (result.error) throw result.error;
  return result.data as T;
}

export async function publicFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const result = await publicRequest<T>(path, init);
  if (result.error) throw result.error;
  return result.data as T;
}
