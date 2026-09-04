/**
 * Jeton d’accès en cookie HttpOnly — le navigateur ne peut pas le lire (anti-XSS).
 * Bearer reste accepté pour les tests et les clients API.
 */
import type { Request, Response } from 'express';
import { isHardenedRuntime } from './deployment.js';
import { durationSpecToMs, resolveAccessTokenExpiresIn } from './sessions.js';
import { parseCorsOrigins } from './corsOrigin.js';
import { isTestMode } from './testMode.js';

export const ACCESS_COOKIE_NAME = 'caddynote_at';

/** Clients API / scripts : demander le JWT dans le JSON (interdit si Origin navigateur). */
export const BEARER_IN_BODY_HEADER = 'x-caddynote-bearer';

/**
 * Le navigateur ne reçoit que le cookie HttpOnly.
 * Le champ `token` reste pour NODE_ENV=test, ISSUE_BEARER_IN_BODY, ou
 * l’en-tête `X-CaddyNote-Bearer` sans Origin (scripts, pas XSS).
 */
export const shouldIssueAccessTokenInBody = (req: Request): boolean => {
  if (process.env.NODE_ENV === 'test' || isTestMode()) return true;
  if (process.env.ISSUE_BEARER_IN_BODY === 'true' || process.env.ISSUE_BEARER_IN_BODY === '1') {
    return true;
  }
  const header = String(req.headers[BEARER_IN_BODY_HEADER] ?? '').toLowerCase();
  if (header !== '1' && header !== 'true') return false;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  return origin.length === 0;
};

export const accessTokenInBody = (req: Request, token: string): { token?: string } =>
  shouldIssueAccessTokenInBody(req) ? { token } : {};

const LOCAL_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export const cookieSameSite = (): 'lax' | 'strict' | 'none' => {
  const explicit = (process.env.COOKIE_SAMESITE || '').trim().toLowerCase();
  if (explicit === 'none' || explicit === 'lax' || explicit === 'strict') return explicit;
  return isHardenedRuntime() ? 'none' : 'lax';
};

export const cookieSecure = (): boolean => {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return isHardenedRuntime() || cookieSameSite() === 'none';
};

export const setAccessTokenCookie = (res: Response, token: string, expiresIn?: string): void => {
  const spec = resolveAccessTokenExpiresIn(expiresIn);
  const maxAge = durationSpecToMs(spec) ?? 12 * 60 * 60 * 1000;
  res.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: '/',
    maxAge,
  });
};

export const clearAccessTokenCookie = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: '/',
  });
};

export const readAccessTokenCookie = (req: Request): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) !== ACCESS_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
};

export const readAccessToken = (req: Request): { token: string; via: 'bearer' | 'cookie' } | null => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return { token, via: 'bearer' };
  }
  const cookie = readAccessTokenCookie(req);
  if (cookie) return { token: cookie, via: 'cookie' };
  return null;
};

const allowedOrigins = (): string[] => {
  const configured = parseCorsOrigins(process.env.CORS_ORIGIN);
  if (configured.length > 0) return configured;
  return isHardenedRuntime() ? [] : LOCAL_ORIGINS;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF : une mutation authentifiée par cookie doit provenir d’une origine connue. */
export const isCookieMutationOriginAllowed = (req: Request): boolean => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin) return allowedOrigins().includes(origin.replace(/\/$/, ''));
  const referer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
  if (referer) {
    try {
      return allowedOrigins().includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  // Pas d’Origin (même site, certains clients) : autorisé hors runtime durci.
  return !isHardenedRuntime();
};
