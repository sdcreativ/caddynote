import { describe, expect, it } from 'vitest';
import {
  assertSafeOutboundUrl,
  isBlockedHostname,
  isBlockedIp,
  isSafeSsoUrlShape,
  parseSsoIssuerHostAllowlist,
  UnsafeSsoUrlError,
} from './safeOutboundUrl.js';

describe('isBlockedIp', () => {
  it('refuse loopback, RFC1918, link-local, metadata et multicast', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.1.2.3')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
  });

  it('accepte une IPv4 publique', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('20.190.160.22')).toBe(false);
  });
});

describe('isSafeSsoUrlShape', () => {
  it('exige HTTPS sans identifiants ni hôte interne', () => {
    expect(isSafeSsoUrlShape('https://login.microsoftonline.com/tid/v2.0')).toBe(true);
    expect(isSafeSsoUrlShape('http://login.microsoftonline.com/tid/v2.0')).toBe(false);
    expect(isSafeSsoUrlShape('https://127.0.0.1/v2.0')).toBe(false);
    expect(isSafeSsoUrlShape('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeSsoUrlShape('https://localhost/oidc')).toBe(false);
    expect(isSafeSsoUrlShape('https://user:pass@idp.example.com')).toBe(false);
    expect(isSafeSsoUrlShape('file:///etc/passwd')).toBe(false);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
  });
});

describe('assertSafeOutboundUrl', () => {
  it('refuse une résolution DNS vers une IP privée (localtest.me)', async () => {
    await expect(
      assertSafeOutboundUrl('https://localtest.me/', {
        lookup: async () => ['127.0.0.1'],
      })
    ).rejects.toBeInstanceOf(UnsafeSsoUrlError);
  });

  it('refuse si un seul enregistrement est privé', async () => {
    await expect(
      assertSafeOutboundUrl('https://idp.example.com/', {
        lookup: async () => ['8.8.8.8', '10.0.0.1'],
      })
    ).rejects.toBeInstanceOf(UnsafeSsoUrlError);
  });

  it('accepte un hôte public résolu vers une IP publique', async () => {
    const url = await assertSafeOutboundUrl('https://login.microsoftonline.com/tid/v2.0', {
      lookup: async () => ['20.190.160.22'],
    });
    expect(url.hostname).toBe('login.microsoftonline.com');
  });

  it('applique l’allowlist d’hôtes', async () => {
    await expect(
      assertSafeOutboundUrl('https://evil.example/oidc', {
        lookup: async () => ['1.2.3.4'],
        allowlist: ['login.microsoftonline.com'],
      })
    ).rejects.toBeInstanceOf(UnsafeSsoUrlError);

    const ok = await assertSafeOutboundUrl('https://login.microsoftonline.com/tid/v2.0', {
      lookup: async () => ['20.190.160.22'],
      allowlist: ['login.microsoftonline.com'],
    });
    expect(ok.hostname).toBe('login.microsoftonline.com');
  });

  it('parse SSO_ISSUER_HOST_ALLOWLIST', () => {
    expect(parseSsoIssuerHostAllowlist(' login.microsoftonline.com, *.google.com ')).toEqual([
      'login.microsoftonline.com',
      'google.com',
    ]);
  });
});
