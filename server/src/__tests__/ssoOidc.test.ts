import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { buildFixture, type Fixture, auth } from './fixtures.js';
import { saveSsoConfig } from '../lib/ssoConfig.js';
import { completeSsoLogin } from '../lib/ssoLogin.js';
import { generateMfaSecret } from '../lib/mfa.js';
import type { Request } from 'express';

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

  it('happy path stub : start → callback → fragment sso_token', async () => {
    const start = await request(app)
      .get(`/auth/sso/start?institutionId=${fx.a.institutionId}&email=${encodeURIComponent(`enseignant@${domain}`)}`)
      .expect(302);
    const location = start.headers.location as string;
    expect(location).toContain('/auth/sso/callback?');
    expect(location).toContain('code=stub');

    const cb = await request(app).get(location.replace(/^https?:\/\/[^/]+/, '')).expect(302);
    const redir = cb.headers.location as string;
    expect(redir).toMatch(/#sso_token=/);
    expect(redir).not.toMatch(/sso_error/);
  });

  it('MFA coexistence : SSO renvoie sso_mfa si mfaEnabled', async () => {
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
      expect(cb.headers.location).toMatch(/#sso_mfa=/);
    } finally {
      await prisma.strkProfile.update({
        where: { id: fx.a.teacher.id },
        data: { mfaEnabled: false, mfaSecret: null },
      });
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
