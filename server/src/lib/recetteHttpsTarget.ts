/**
 * Cible de recette HTTPS (1 école publique).
 * Défaut : https://caddynote.sdcreativ.com + /api (same-origin).
 * Interdit HTTP sur le domaine public. Ne jamais y coller d’identifiants démo.
 */

export const CANONICAL_RECETTE_HTTPS_ORIGIN = 'https://caddynote.sdcreativ.com';

export type RecetteHttpsTarget = {
  webUrl: string;
  apiUrl: string;
  origin: string;
  hostname: string;
  isCanonicalHttps: boolean;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const parseUrl = (raw: string, fallbackProtocol: 'https:' | 'http:'): URL => {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('URL de recette vide');
  return new URL(trimmed.includes('://') ? trimmed : `${fallbackProtocol}//${trimmed}`);
};

const isPublicCaddynoteHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return host === 'caddynote.sdcreativ.com' || host.endsWith('.caddynote.sdcreativ.com');
};

const assertHttpsOnPublicHost = (url: URL, label: string): void => {
  if (isPublicCaddynoteHost(url.hostname) && url.protocol !== 'https:') {
    throw new Error(`${label} : ${url.hostname} doit être en https:// (reçu ${url.protocol})`);
  }
};

export const resolveRecetteHttpsTarget = (
  env: Record<string, string | undefined> = process.env
): RecetteHttpsTarget => {
  const webRaw = (env.RECETTE_WEB_URL || env.RECETTE_HTTPS_ORIGIN || CANONICAL_RECETTE_HTTPS_ORIGIN).trim();
  const web = parseUrl(webRaw, 'https:');
  assertHttpsOnPublicHost(web, 'RECETTE_WEB_URL');

  const webUrl = stripTrailingSlash(web.origin + (web.pathname === '/' ? '' : web.pathname));
  const apiRaw = (env.RECETTE_API_URL || '').trim();

  let apiUrl: string;
  if (apiRaw) {
    const api = parseUrl(apiRaw, web.protocol === 'https:' ? 'https:' : 'http:');
    assertHttpsOnPublicHost(api, 'RECETTE_API_URL');
    apiUrl = stripTrailingSlash(api.href);
  } else {
    apiUrl = `${web.origin}/api`;
  }

  return {
    webUrl,
    apiUrl,
    origin: web.origin,
    hostname: web.hostname.toLowerCase(),
    isCanonicalHttps: isPublicCaddynoteHost(web.hostname) && web.protocol === 'https:',
  };
};

const truthyFlag = (value: string | undefined): boolean => {
  const raw = (value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

export const isPublicOnlyRecette = (env: Record<string, string | undefined> = process.env): boolean =>
  truthyFlag(env.RECETTE_HTTPS_PUBLIC_ONLY);

/** Connexions réelles sur caddynote.sdcreativ.com — évite un login prod depuis un .env local. */
export const isHttpsLoginConfirmed = (env: Record<string, string | undefined> = process.env): boolean =>
  truthyFlag(env.RECETTE_HTTPS_CONFIRM);

const HSTS_STAGE_MAX_AGE = '15552000';

/** HSTS étape 2 : 180 j, sans preload, sans includeSubDomains, sans 1 an. */
export const isApprovedPublicHsts = (header: string): boolean => {
  const value = header.trim();
  if (!value) return false;
  if (/preload/i.test(value)) return false;
  if (/includesubdomains/i.test(value)) return false;
  const ages = [...value.matchAll(/max-age=(\d+)/gi)].map((match) => match[1]);
  return ages.length > 0 && ages.every((age) => age === HSTS_STAGE_MAX_AGE);
};
