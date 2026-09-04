import { describe, expect, it, vi } from 'vitest';
import { fetchDiscovery } from './ssoOidc.js';
import { UnsafeSsoUrlError } from './safeOutboundUrl.js';

describe('fetchDiscovery — SSRF', () => {
  it('ne contacte pas une issuerUrl interne', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchDiscovery('https://127.0.0.1/oidc')).rejects.toBeInstanceOf(UnsafeSsoUrlError);
    await expect(fetchDiscovery('https://169.254.169.254/latest')).rejects.toBeInstanceOf(UnsafeSsoUrlError);
    await expect(fetchDiscovery('http://login.microsoftonline.com/tid')).rejects.toBeInstanceOf(UnsafeSsoUrlError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
