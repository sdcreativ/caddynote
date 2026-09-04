/**
 * Garde SSRF pour les URL que le serveur fetch ensuite (discovery OIDC, token, JWKS).
 * HTTPS uniquement, pas d’identifiants, pas d’IP privée / metadata, DNS fail-closed.
 */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class UnsafeSsoUrlError extends Error {
  constructor() {
    super('SSO_UNSAFE_URL');
    this.name = 'UnsafeSsoUrlError';
  }
}

const blockedNets = new BlockList();
blockedNets.addSubnet('0.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('10.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('127.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('169.254.0.0', 16, 'ipv4');
blockedNets.addSubnet('172.16.0.0', 12, 'ipv4');
blockedNets.addSubnet('192.168.0.0', 16, 'ipv4');
blockedNets.addSubnet('100.64.0.0', 10, 'ipv4');
blockedNets.addSubnet('198.18.0.0', 15, 'ipv4');
blockedNets.addSubnet('224.0.0.0', 3, 'ipv4');
blockedNets.addAddress('::', 'ipv6');
blockedNets.addAddress('::1', 'ipv6');
blockedNets.addSubnet('fc00::', 7, 'ipv6');
blockedNets.addSubnet('fe80::', 10, 'ipv6');
blockedNets.addSubnet('ff00::', 8, 'ipv6');

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.google.com',
  'kubernetes',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

export type HostLookup = (hostname: string) => Promise<string[]>;

export const defaultHostLookup: HostLookup = async (hostname) => {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
};

export const parseSsoIssuerHostAllowlist = (raw = process.env.SSO_ISSUER_HOST_ALLOWLIST): string[] =>
  (raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/^\*\./, ''))
    .filter((part) => part.length > 0 && !part.includes('/') && !part.includes(':'));

const hostMatchesAllowlist = (hostname: string, allowlist: string[]): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
};

export const isBlockedIp = (address: string): boolean => {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIp(mapped[1]);
  if (isIP(address) === 4) return blockedNets.check(address, 'ipv4');
  if (isIP(address) === 6) return blockedNets.check(address, 'ipv6');
  return true;
};

const decodeNumericIpv4 = (host: string): string | null => {
  if (!/^\d+$/.test(host)) return null;
  const n = Number(host);
  if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) return null;
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
};

export const isBlockedHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  return (
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa')
  );
};

/** Contrôle synchrone (forme) — pas de DNS. */
export const isSafeSsoUrlShape = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    const numeric = decodeNumericIpv4(url.hostname);
    if (numeric) return !isBlockedIp(numeric);
    if (isIP(url.hostname)) return !isBlockedIp(url.hostname);
    return !isBlockedHostname(url.hostname);
  } catch {
    return false;
  }
};

export type AssertSafeOutboundUrlOpts = {
  lookup?: HostLookup;
  allowlist?: string[];
};

/**
 * Refuse tout hôte interne / metadata avant un fetch serveur.
 * Si une allowlist est fournie (ou `SSO_ISSUER_HOST_ALLOWLIST`), l’hôte doit y figurer.
 */
export const assertSafeOutboundUrl = async (
  raw: string,
  opts: AssertSafeOutboundUrlOpts = {}
): Promise<URL> => {
  if (!isSafeSsoUrlShape(raw)) throw new UnsafeSsoUrlError();
  const url = new URL(raw);
  const allowlist = opts.allowlist ?? parseSsoIssuerHostAllowlist();
  if (allowlist.length > 0 && !hostMatchesAllowlist(url.hostname, allowlist)) {
    throw new UnsafeSsoUrlError();
  }

  const numeric = decodeNumericIpv4(url.hostname);
  if (numeric) {
    if (isBlockedIp(numeric)) throw new UnsafeSsoUrlError();
    return url;
  }
  if (isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) throw new UnsafeSsoUrlError();
    return url;
  }

  const lookupFn = opts.lookup ?? defaultHostLookup;
  let addresses: string[];
  try {
    addresses = await lookupFn(url.hostname);
  } catch {
    throw new UnsafeSsoUrlError();
  }
  if (addresses.length === 0 || addresses.some((ip) => isBlockedIp(ip))) {
    throw new UnsafeSsoUrlError();
  }
  return url;
};
