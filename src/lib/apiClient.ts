// Client HTTP vers l’API CaddyNote. Le jeton vit dans un cookie HttpOnly
// (anti-XSS) : le JS ne le lit plus. `credentials: 'include'` l’envoie.
const configuredApi = (import.meta.env.VITE_API_URL || '').trim();
const isLocalApiHost = /^https?:\/\/(localhost|127\.0\.0\.1):4000\/?$/i.test(configuredApi);
/** Same-origin `/api` en local (proxy Vite) pour que le cookie HttpOnly parte. */
export const API_BASE_URL = !configuredApi || isLocalApiHost ? '/api' : configuredApi;
const LEGACY_TOKEN_KEY = 'caddynote_token';

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

const dropLegacyToken = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
};

/** Plus de jeton en JS — conservé pour ne pas casser les imports existants. */
export const getToken = (): string | null => {
  dropLegacyToken();
  return null;
};

export const setToken = (_token: string): void => {
  dropLegacyToken();
};

export const clearToken = (): void => {
  dropLegacyToken();
};

/** Déclenché quand le serveur renvoie 401 (session absente/expirée). */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  onUnauthorized = handler;
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export const authorizedFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: init.headers,
  });
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { body, skipAuth, headers, ...rest } = options;

  const response = await authorizedFetch(path, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
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
