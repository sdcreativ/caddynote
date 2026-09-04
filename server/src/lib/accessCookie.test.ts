import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE_NAME,
  cookieSameSite,
  isCookieMutationOriginAllowed,
  readAccessToken,
  shouldIssueAccessTokenInBody,
} from './accessCookie.js';
import type { Request } from 'express';

const req = (headers: Record<string, string>, method = 'GET'): Request =>
  ({ headers, method } as Request);

describe('accessCookie', () => {
  it('préfère Bearer au cookie', () => {
    const extracted = readAccessToken(
      req({
        authorization: 'Bearer header-token',
        cookie: `${ACCESS_COOKIE_NAME}=cookie-token`,
      })
    );
    expect(extracted).toEqual({ token: 'header-token', via: 'bearer' });
  });

  it('lit le cookie si aucun Bearer', () => {
    const extracted = readAccessToken(req({ cookie: `${ACCESS_COOKIE_NAME}=cookie-token` }));
    expect(extracted).toEqual({ token: 'cookie-token', via: 'cookie' });
  });

  it('SameSite par défaut n’est pas none en local', () => {
    expect(cookieSameSite()).not.toBe('none');
  });

  it('n’expose pas le JWT dans le JSON pour un Origin navigateur hors test', () => {
    const prevNode = process.env.NODE_ENV;
    const prevIssue = process.env.ISSUE_BEARER_IN_BODY;
    const prevTestMode = process.env.CADDYNOTE_TEST_MODE;
    process.env.NODE_ENV = 'production';
    delete process.env.ISSUE_BEARER_IN_BODY;
    delete process.env.CADDYNOTE_TEST_MODE;
    try {
      expect(shouldIssueAccessTokenInBody(req({ origin: 'http://localhost:8080' }))).toBe(false);
      expect(
        shouldIssueAccessTokenInBody(
          req({ origin: 'http://localhost:8080', 'x-caddynote-bearer': '1' })
        )
      ).toBe(false);
      expect(shouldIssueAccessTokenInBody(req({ 'x-caddynote-bearer': '1' }))).toBe(true);
      process.env.ISSUE_BEARER_IN_BODY = 'true';
      expect(shouldIssueAccessTokenInBody(req({ origin: 'http://localhost:8080' }))).toBe(true);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevIssue === undefined) delete process.env.ISSUE_BEARER_IN_BODY;
      else process.env.ISSUE_BEARER_IN_BODY = prevIssue;
      if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
      else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
    }
  });

  it('refuse une mutation cookie depuis une origine inconnue', () => {
    expect(
      isCookieMutationOriginAllowed(req({ origin: 'https://evil.test' }, 'POST'))
    ).toBe(false);
    expect(
      isCookieMutationOriginAllowed(req({ origin: 'http://localhost:8080' }, 'POST'))
    ).toBe(true);
    expect(isCookieMutationOriginAllowed(req({}, 'GET'))).toBe(true);
  });
});
