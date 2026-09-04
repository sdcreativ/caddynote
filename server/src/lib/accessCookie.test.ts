import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE_NAME,
  cookieSameSite,
  cookieSecure,
  isCookieMutationOriginAllowed,
  publicOriginIsHttps,
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

  it('staging HTTP : Lax et pas Secure (le navigateur jette sinon le cookie MFA)', () => {
    const prev = {
      deploy: process.env.CADDYNOTE_DEPLOYMENT,
      testMode: process.env.CADDYNOTE_TEST_MODE,
      app: process.env.APP_URL,
      cors: process.env.CORS_ORIGIN,
      secure: process.env.COOKIE_SECURE,
      sameSite: process.env.COOKIE_SAMESITE,
    };
    process.env.CADDYNOTE_DEPLOYMENT = 'staging';
    delete process.env.CADDYNOTE_TEST_MODE;
    process.env.APP_URL = 'http://88.96.41.213:8080';
    process.env.CORS_ORIGIN = 'http://88.96.41.213:8080';
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAMESITE;
    try {
      expect(publicOriginIsHttps()).toBe(false);
      expect(cookieSameSite()).toBe('lax');
      expect(cookieSecure()).toBe(false);
    } finally {
      if (prev.deploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
      else process.env.CADDYNOTE_DEPLOYMENT = prev.deploy;
      if (prev.testMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
      else process.env.CADDYNOTE_TEST_MODE = prev.testMode;
      if (prev.app === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev.app;
      if (prev.cors === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = prev.cors;
      if (prev.secure === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = prev.secure;
      if (prev.sameSite === undefined) delete process.env.COOKIE_SAMESITE;
      else process.env.COOKIE_SAMESITE = prev.sameSite;
    }
  });

  it('production HTTPS : None + Secure', () => {
    const prev = {
      deploy: process.env.CADDYNOTE_DEPLOYMENT,
      testMode: process.env.CADDYNOTE_TEST_MODE,
      app: process.env.APP_URL,
      secure: process.env.COOKIE_SECURE,
      sameSite: process.env.COOKIE_SAMESITE,
    };
    process.env.CADDYNOTE_DEPLOYMENT = 'production';
    delete process.env.CADDYNOTE_TEST_MODE;
    process.env.APP_URL = 'https://app.caddynote.example';
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAMESITE;
    try {
      expect(publicOriginIsHttps()).toBe(true);
      expect(cookieSameSite()).toBe('none');
      expect(cookieSecure()).toBe(true);
    } finally {
      if (prev.deploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
      else process.env.CADDYNOTE_DEPLOYMENT = prev.deploy;
      if (prev.testMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
      else process.env.CADDYNOTE_TEST_MODE = prev.testMode;
      if (prev.app === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev.app;
      if (prev.secure === undefined) delete process.env.COOKIE_SECURE;
      else process.env.COOKIE_SECURE = prev.secure;
      if (prev.sameSite === undefined) delete process.env.COOKIE_SAMESITE;
      else process.env.COOKIE_SAMESITE = prev.sameSite;
    }
  });

  it('n’expose pas le JWT dans le JSON pour un Origin navigateur hors test', () => {
    const prevNode = process.env.NODE_ENV;
    const prevIssue = process.env.ISSUE_BEARER_IN_BODY;
    const prevTestMode = process.env.CADDYNOTE_TEST_MODE;
    const prevDeploy = process.env.CADDYNOTE_DEPLOYMENT;
    process.env.NODE_ENV = 'production';
    delete process.env.ISSUE_BEARER_IN_BODY;
    delete process.env.CADDYNOTE_TEST_MODE;
    delete process.env.CADDYNOTE_DEPLOYMENT;
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
      process.env.CADDYNOTE_DEPLOYMENT = 'production';
      expect(shouldIssueAccessTokenInBody(req({ origin: 'http://localhost:8080' }))).toBe(false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevIssue === undefined) delete process.env.ISSUE_BEARER_IN_BODY;
      else process.env.ISSUE_BEARER_IN_BODY = prevIssue;
      if (prevTestMode === undefined) delete process.env.CADDYNOTE_TEST_MODE;
      else process.env.CADDYNOTE_TEST_MODE = prevTestMode;
      if (prevDeploy === undefined) delete process.env.CADDYNOTE_DEPLOYMENT;
      else process.env.CADDYNOTE_DEPLOYMENT = prevDeploy;
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
