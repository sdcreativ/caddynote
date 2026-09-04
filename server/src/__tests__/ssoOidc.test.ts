import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, type Fixture, auth } from './fixtures.js';
import { saveSsoConfig } from '../lib/ssoConfig.js';
import { completeSsoLogin } from '../lib/ssoLogin.js';
import { generateMfaSecret } from '../lib/mfa.js';
import { ACCESS_COOKIE_NAME } from '../lib/accessCookie.js';
import type { Request } from 'express';

const fragmentParams = (location: string): URLSearchParams => {
  const hash = location.includes('#') ? location.slice(location.indexOf('#') + 1) : '';
  return new URLSearchParams(hash);
};

const cookieFrom = (res: request.Response): string | undefined => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((c) => c.startsWith(`${ACCESS_COOKIE_NAME}=`));
};

/**
 * S4 — SSO OIDC (Azure AD / stub test).
 * Stub IdP uniquement en NODE_ENV=test.
 */
describe('SSO OIDC (S4)', () => {
  let fx: Fixture;
  const domain = `sso-${Date.now()}.test`;

  beforeAll(async () => {
    fx = await buildFixture();
    await prisma.strkProfile.update({
      where: { id: fx.a.teacher.id },
      data: { email: `enseignant@${domain}` },
    });
    await saveSsoConfig(
      fx.a.institutionId,
      {
        enabled: true,
        provider: 'stub',
        clientId: 'stub-client',
        clientSecret: 'stub-secret',
        displayName: 'Microsoft',
        emailDomains: [domain],
      },
      null
    );
  });

  afterAll(async () => {
    await prisma.strkSetting.deleteMany({
      where: {
        OR: [
          { category: 'institution', key: `sso:${fx.a.institutionId}` },
          { category: 'sso_pending' },
          { category: 'sso_adopt' },
        ],
      },
    }).catch(() => undefined);
  });

  it('public-config n’expose pas le secret', async () => {
    const res = await request(app)
      .get(`/auth/sso/public-config?institutionId=${fx.a.institutionId}`)
      .expect(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.displayName).toBe('Microsoft');
    expect(JSON.stringify(res.body)).not.toMatch(/stub-secret|clientSecret/i);
  });

  it('admin GET sso-config masque le secret', async () => {
    const res = await request(app)
      .get(`/institutions/${fx.a.institutionId}/sso-config`)
      .set(auth(fx.globalAdmin.token))
      .expect(200);
    expect(res.body.config.enabled).toBe(true);
    expect(res.body.config.clientSecret).toBe('********');
    expect(res.body.config.hasClientSecret).toBe(true);
  });

  it('discover trouve l’établissement par domaine', async () => {
    const res = await request(app)
      .get(`/auth/sso/discover?email=${encodeURIComponent(`enseignant@${domain}`)}`)
      .expect(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.institutionId).toBe(fx.a.institutionId);
  });

  it('refuse un user inconnu (pas de provisionnement)', async () => {
    const fakeReq = { ip: '127.0.0.1', headers: {} } as Request;
    const result = await completeSsoLogin({
      req: fakeReq,
      institutionId: fx.a.institutionId,
      email: `inconnu@${domain}`,
      config: { enabled: true, provider: 'stub', clientId: 'x', emailDomains: [domain] },
      idpSub: 'stub:x',
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('sso_unknown_user');
  });

  it('refuse un compte d’un autre tenant', async () => {
    const fakeReq = { ip: '127.0.0.1', headers: {} } as Request;
    const result = await completeSsoLogin({
      req: fakeReq,
      institutionId: fx.a.institutionId,
      email: fx.b.teacher.email,
      config: { enabled: true, provider: 'stub', clientId: 'x' },
      idpSub: 'stub:y',
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.code).toBe('sso_tenant_mismatch');
  });

  it('happy path stub : start → callback → code adopt (pas de JWT)', async () => {
    const start = await request(app)
      .get(`/auth/sso/start?institutionId=${fx.a.institutionId}&email=${encodeURIComponent(`enseignant@${domain}`)}`)
      .expect(302);
    const location = start.headers.location as string;
    expect(location).toContain('/auth/sso/callback?');
    expect(location).toContain('code=stub');

    const cb = await request(app).get(location.replace(/^https?:\/\/[^/]+/, '')).expect(302);
    const redir = cb.headers.location as string;
    const params = fragmentParams(redir);
    const code = params.get('sso_code');
    expect(code).toBeTruthy();
    expect(redir).not.toMatch(/sso_error|sso_token|sso_mfa/);
    expect(redir).not.toMatch(/eyJ/);

    const adopted = await request(app)
      .post('/auth/adopt')
      .set('Origin', 'http://localhost:8080')
      .send({ code });
    expect(adopted.status).toBe(200);
    expect(adopted.body.mfaRequired).toBeFalsy();
    expect(cookieFrom(adopted)).toMatch(new RegExp(`^${ACCESS_COOKIE_NAME}=`));

    const replay = await request(app)
      .post('/auth/adopt')
      .set('Origin', 'http://localhost:8080')
      .send({ code });
    expect(replay.status).toBe(401);
    expect(cookieFrom(replay)).toBeUndefined();
  });

  it('MFA coexistence : SSO renvoie un code adopt, pas le JWT MFA', async () => {
    const secret = generateMfaSecret();
    await prisma.strkProfile.update({
      where: { id: fx.a.teacher.id },
      data: { mfaEnabled: true, mfaSecret: secret },
    });

    try {
      const start = await request(app)
        .get(`/auth/sso/start?institutionId=${fx.a.institutionId}&email=${encodeURIComponent(`enseignant@${domain}`)}`)
        .expect(302);
      const cb = await request(app)
        .get((start.headers.location as string).replace(/^https?:\/\/[^/]+/, ''))
        .expect(302);
      const redir = cb.headers.location as string;
      const code = fragmentParams(redir).get('sso_code');
      expect(code).toBeTruthy();
      expect(redir).not.toMatch(/sso_mfa=|sso_token=|eyJ/);

      const adopted = await request(app)
        .post('/auth/adopt')
        .set('Origin', 'http://localhost:8080')
        .send({ code });
      expect(adopted.status).toBe(200);
      expect(adopted.body.mfaRequired).toBe(true);
      expect(adopted.body.challengeToken).toMatch(/^eyJ/);
      expect(cookieFrom(adopted)).toBeUndefined();
    } finally {
      await prisma.strkProfile.update({
        where: { id: fx.a.teacher.id },
        data: { mfaEnabled: false, mfaSecret: null },
      });
    }
  });

  it('start refuse une issuerUrl interne déjà en base, sans la renvoyer', async () => {
    const key = `sso:${fx.a.institutionId}`;
    const previous = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'institution', key } },
      select: { value: true },
    });
    await prisma.strkSetting.update({
      where: { category_key: { category: 'institution', key } },
      data: {
        value: {
          enabled: true,
          provider: 'oidc',
          clientId: 'x',
          clientSecret: 'y',
          issuerUrl: 'https://127.0.0.1/oidc',
          emailDomains: [domain],
        },
      },
    });
    try {
      const res = await request(app).get(`/auth/sso/start?institutionId=${fx.a.institutionId}`).expect(302);
      const location = res.headers.location as string;
      expect(location).toMatch(/sso_error=sso_failed/);
      expect(location).not.toMatch(/sso_issuer_invalide|127\.0\.0\.1|169\.254|SSO_UNSAFE_URL/);
    } finally {
      if (previous?.value) {
        await prisma.strkSetting.update({
          where: { category_key: { category: 'institution', key } },
          data: { value: previous.value },
        });
      }
    }
  });

  it('login mot de passe reste possible', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: fx.a.schoolAdmin.email, password: 'Password123!' })
      .expect(200);
    expect(res.body.token || res.body.mfaRequired).toBeTruthy();
  });
});
