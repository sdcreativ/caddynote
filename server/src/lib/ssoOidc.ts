/**
 * OIDC Authorization Code + PKCE (Azure AD / générique).
 * State pending stocké en base (multi-instance safe), TTL 10 min.
 */
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from './prisma.js';
import {
  loadSsoConfig,
  resolveIssuerUrl,
  type SsoConfigStored,
} from './ssoConfig.js';
import { isTestMode } from './testMode.js';
import { assertSafeOutboundUrl, UnsafeSsoUrlError } from './safeOutboundUrl.js';

const PENDING_CATEGORY = 'sso_pending';
const PENDING_TTL_MS = 10 * 60 * 1000;

export type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

export type IdTokenClaims = {
  sub: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  tid?: string;
  nonce?: string;
};

type PendingValue = {
  institutionId: string;
  codeVerifier: string;
  nonce: string;
  stubEmail?: string;
  exp: number;
};

const b64url = (buf: Buffer) => buf.toString('base64url');

export const createPkcePair = () => {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
};

export const getSsoRedirectUri = () => {
  const explicit = process.env.SSO_OIDC_REDIRECT_URI?.replace(/\/$/, '');
  if (explicit) return explicit;
  const api = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  return `${api}/auth/sso/callback`;
};

export const getAppUrl = () => (process.env.APP_URL || 'http://localhost:8080').replace(/\/$/, '');

const outboundFetch = async (url: string, init: RequestInit): Promise<Response> => {
  await assertSafeOutboundUrl(url);
  return fetch(url, { ...init, redirect: 'error' });
};

export const fetchDiscovery = async (issuerUrl: string): Promise<OidcDiscovery> => {
  await assertSafeOutboundUrl(issuerUrl);
  const url = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await outboundFetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Discovery OIDC échouée (${res.status})`);
  const text = await res.text();
  if (text.length > 64_000) throw new UnsafeSsoUrlError();
  const body = JSON.parse(text) as OidcDiscovery;
  if (!body.authorization_endpoint || !body.token_endpoint || !body.jwks_uri || !body.issuer) {
    throw new Error('Discovery OIDC incomplète');
  }
  await Promise.all([
    assertSafeOutboundUrl(body.authorization_endpoint),
    assertSafeOutboundUrl(body.token_endpoint),
    assertSafeOutboundUrl(body.jwks_uri),
  ]);
  return body;
};

export const savePending = async (state: string, value: PendingValue) => {
  await prisma.strkSetting.upsert({
    where: { category_key: { category: PENDING_CATEGORY, key: state } },
    create: {
      category: PENDING_CATEGORY,
      key: state,
      value,
      description: 'SSO OIDC pending (TTL court)',
      isPublic: false,
    },
    update: { value },
  });
};

export const consumePending = async (state: string): Promise<PendingValue | null> => {
  const row = await prisma.strkSetting.findUnique({
    where: { category_key: { category: PENDING_CATEGORY, key: state } },
    select: { value: true },
  });
  if (!row) return null;
  await prisma.strkSetting.delete({
    where: { category_key: { category: PENDING_CATEGORY, key: state } },
  }).catch(() => undefined);
  const value = row.value as PendingValue;
  if (!value?.exp || value.exp < Date.now()) return null;
  return value;
};

export const buildAuthorizeRedirect = async (opts: {
  institutionId: string;
  stubEmail?: string;
}): Promise<string> => {
  const cfg = await loadSsoConfig(opts.institutionId);
  if (!cfg?.enabled) throw new Error('SSO désactivé pour cet établissement');

  const state = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(16));
  const { verifier, challenge } = createPkcePair();

  await savePending(state, {
    institutionId: opts.institutionId,
    codeVerifier: verifier,
    nonce,
    stubEmail: opts.stubEmail,
    exp: Date.now() + PENDING_TTL_MS,
  });

  if (cfg.provider === 'stub') {
    if (!(isTestMode() || process.env.NODE_ENV === 'test')) {
      throw new Error('Provider stub réservé aux tests / TEST_MODE');
    }
    const api = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
    return `${api}/auth/sso/callback?code=stub&state=${encodeURIComponent(state)}`;
  }

  const issuer = resolveIssuerUrl(cfg);
  const discovery = await fetchDiscovery(issuer);
  const redirectUri = getSsoRedirectUri();
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (cfg.provider === 'azure_ad') {
    url.searchParams.set('response_mode', 'query');
  }
  return url.toString();
};

const extractEmail = (claims: IdTokenClaims): string | null => {
  const raw = claims.email || claims.preferred_username || claims.upn;
  if (!raw || !raw.includes('@')) return null;
  return raw.trim().toLowerCase();
};

export const exchangeCodeForClaims = async (opts: {
  cfg: SsoConfigStored & { clientSecret?: string };
  code: string;
  pending: PendingValue;
}): Promise<IdTokenClaims> => {
  const { cfg, code, pending } = opts;

  if (cfg.provider === 'stub') {
    if (!(isTestMode() || process.env.NODE_ENV === 'test')) {
      throw new Error('Provider stub réservé aux tests');
    }
    const email = pending.stubEmail;
    if (!email) throw new Error('stubEmail manquant');
    return { sub: `stub:${email}`, email, nonce: pending.nonce };
  }

  const secret = (cfg as { clientSecret?: string }).clientSecret;
  if (!secret) throw new Error('clientSecret manquant');

  const issuer = resolveIssuerUrl(cfg);
  const discovery = await fetchDiscovery(issuer);
  const redirectUri = getSsoRedirectUri();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    client_secret: secret,
    code,
    redirect_uri: redirectUri,
    code_verifier: pending.codeVerifier,
  });

  const tokenRes = await outboundFetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Échange code OIDC échoué (${tokenRes.status}) ${text.slice(0, 200)}`);
  }
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  if (!tokenJson.id_token) throw new Error('id_token absent de la réponse IdP');

  const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(tokenJson.id_token, JWKS, {
    issuer: discovery.issuer,
    audience: cfg.clientId,
  });

  const claims = payload as IdTokenClaims;
  if (claims.nonce && claims.nonce !== pending.nonce) {
    throw new Error('nonce id_token invalide');
  }
  return claims;
};

export const emailFromClaims = extractEmail;
