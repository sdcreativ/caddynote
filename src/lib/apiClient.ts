// Client HTTP vers l'API CaddyNote (server/), remplace @supabase/supabase-js.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'caddynote_token';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(message: string, status: number, details?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const setToken = (token: string): void => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
};

export const clearToken = (): void => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
};

/** Déclenché quand le serveur renvoie 401 (jeton absent/expiré) : permet à
 * useStrkAuth de déconnecter proprement l'utilisateur sans dépendance circulaire. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  onUnauthorized = handler;
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { body, skipAuth, headers, ...rest } = options;
  const token = skipAuth ? null : getToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      onUnauthorized?.();
    }
    const message = (data as { error?: string } | null)?.error || `Erreur ${response.status}`;
    const code = (data as { code?: string } | null)?.code;
    throw new ApiError(message, response.status, (data as { details?: unknown } | null)?.details, code);
  }

  return data as T;
};

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};
