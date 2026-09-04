import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { auth, buildFixture, type Fixture } from './fixtures.js';

describe('GET /settings — lecture filtrée + secrets masqués', () => {
  let fx: Fixture;
  const secret = 'sso-client-secret-must-never-leak';

  beforeAll(async () => {
    fx = await buildFixture();
    const rows = [
      {
        category: 'institution',
        key: `sso:${fx.a.institutionId}`,
        value: { enabled: true, provider: 'stub', clientId: 'id-a', clientSecret: secret },
      },
      {
        category: 'institution',
        key: `sso:${fx.b.institutionId}`,
        value: { enabled: true, provider: 'stub', clientId: 'id-b', clientSecret: 'other-tenant-secret' },
      },
      {
        category: 'system',
        key: 'platformFlags',
        value: { finance: true },
      },
      {
        category: 'system',
        key: 'maintenanceMode',
        value: { enabled: false },
      },
      {
        category: 'sso_pending',
        key: 'pending-state',
        value: { codeVerifier: 'pkce-secret', institutionId: fx.a.institutionId },
      },
      {
        category: 'notifications',
        key: `${fx.a.teacher.id}:emailEnabled`,
        value: true,
      },
    ] as const;
    for (const row of rows) {
      await prisma.strkSetting.upsert({
        where: { category_key: { category: row.category, key: row.key } },
        create: { ...row, isPublic: false },
        update: { value: row.value, isPublic: false },
      });
    }
  }, 30_000);

  afterAll(async () => {
    if (!fx) return;
    await prisma.strkSetting.deleteMany({
      where: {
        OR: [
          { category: 'institution', key: { in: [`sso:${fx.a.institutionId}`, `sso:${fx.b.institutionId}`] } },
          { category: 'sso_pending', key: 'pending-state' },
          { category: 'notifications', key: `${fx.a.teacher.id}:emailEnabled` },
        ],
      },
    });
  });

  it('refuse sans authentification', async () => {
    const res = await request(app).get('/settings');
    expect(res.status).toBe(401);
  });

  it('un enseignant ne dump ni SSO ni flags plateforme ni pending OIDC', async () => {
    const res = await request(app).get('/settings').set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(secret);
    expect(body).not.toContain('other-tenant-secret');
    expect(body).not.toContain('pkce-secret');
    expect(res.body.settings.institution?.[`sso:${fx.a.institutionId}`]).toBeUndefined();
    expect(res.body.settings.system?.platformFlags).toBeUndefined();
    expect(res.body.settings.sso_pending).toBeUndefined();
    expect(res.body.settings.notifications?.[`${fx.a.teacher.id}:emailEnabled`]).toBe(true);
  });

  it('isPublic sur le SSO ne court-circuite pas le tenant', async () => {
    await prisma.strkSetting.update({
      where: { category_key: { category: 'institution', key: `sso:${fx.a.institutionId}` } },
      data: { isPublic: true },
    });
    const teacher = await request(app).get('/settings').set(auth(fx.a.teacher.token));
    expect(teacher.status).toBe(200);
    expect(teacher.body.settings.institution?.[`sso:${fx.a.institutionId}`]).toBeUndefined();
    expect(JSON.stringify(teacher.body)).not.toContain(secret);

    const peer = await request(app)
      .get(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.b.schoolAdmin.token));
    expect(peer.body.value).toBeNull();
    expect(JSON.stringify(peer.body)).not.toContain(secret);
  });

  it('GET /settings/institution/:key SSO renvoie null à l’enseignant', async () => {
    const res = await request(app)
      .get(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.a.teacher.token));
    expect(res.status).toBe(200);
    expect(res.body.value).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it('l’admin voit le SSO masqué, jamais le secret en clair', async () => {
    const res = await request(app)
      .get(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.globalAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.value).toMatchObject({ clientId: 'id-a', clientSecret: '********', hasClientSecret: true });
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it('la direction A ne lit pas le SSO du tenant B', async () => {
    const list = await request(app).get('/settings').set(auth(fx.a.schoolAdmin.token));
    expect(list.status).toBe(200);
    expect(list.body.settings.institution?.[`sso:${fx.b.institutionId}`]).toBeUndefined();
    expect(JSON.stringify(list.body)).not.toContain('other-tenant-secret');

    const one = await request(app)
      .get(`/settings/institution/sso:${fx.b.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token));
    expect(one.body.value).toBeNull();
  });

  it('la direction A lit son SSO masqué et maintenanceMode, pas platformFlags', async () => {
    const res = await request(app).get('/settings').set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(200);
    expect(res.body.settings.institution[`sso:${fx.a.institutionId}`]).toMatchObject({
      clientSecret: '********',
    });
    expect(res.body.settings.system?.maintenanceMode).toEqual({ enabled: false });
    expect(res.body.settings.system?.platformFlags).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});

describe('PUT /settings — écriture bornée au tenant', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30_000);

  afterAll(async () => {
    if (!fx) return;
    await prisma.strkSetting.deleteMany({
      where: {
        OR: [
          { category: 'institution', key: { in: [`sso:${fx.a.institutionId}`, `sso:${fx.b.institutionId}`] } },
          { category: 'attendance', key: `${fx.a.teacher.id}:autoMarkAbsent` },
        ],
      },
    });
  });

  it('la direction A ne peut pas écrire le SSO du tenant B', async () => {
    const res = await request(app)
      .put(`/settings/institution/sso:${fx.b.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ value: { clientSecret: 'stolen' } });
    expect(res.status).toBe(403);

    const stored = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'institution', key: `sso:${fx.b.institutionId}` } },
    });
    expect(JSON.stringify(stored?.value ?? {})).not.toContain('stolen');
  });

  it('refuse une issuerUrl interne (SSRF)', async () => {
    const res = await request(app)
      .put(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ value: { enabled: true, provider: 'oidc', clientId: 'x', issuerUrl: 'https://127.0.0.1/oidc' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('issuerUrl non autorisée');

    const stored = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'institution', key: `sso:${fx.a.institutionId}` } },
    });
    expect(JSON.stringify(stored?.value ?? {})).not.toContain('127.0.0.1');
  });

  it('la direction A peut écrire le SSO de son établissement, secret masqué en réponse', async () => {
    const res = await request(app)
      .put(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.a.schoolAdmin.token))
      .send({ value: { enabled: true, provider: 'stub', clientId: 'own', clientSecret: 'own-secret' } });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('own-secret');
    expect(res.body.setting.value.clientSecret).toBe('********');
  });

  it('refuse platform / system / clé institution sans UUID à la direction', async () => {
    const denied = await Promise.all([
      request(app).put('/settings/system/platformFlags').set(auth(fx.a.schoolAdmin.token)).send({ value: { finance: false } }),
      request(app).put('/settings/platform/announcement').set(auth(fx.a.schoolAdmin.token)).send({ value: { text: 'x' } }),
      request(app).put('/settings/institution/sso:not-an-id').set(auth(fx.a.schoolAdmin.token)).send({ value: {} }),
    ]);
    for (const res of denied) expect(res.status).toBe(403);
  });

  it('un enseignant écrit ses prefs attendance, pas le SSO', async () => {
    const own = await request(app)
      .put(`/settings/attendance/${fx.a.teacher.id}:autoMarkAbsent`)
      .set(auth(fx.a.teacher.token))
      .send({ value: true });
    expect(own.status).toBe(200);

    const sso = await request(app)
      .put(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.a.teacher.token))
      .send({ value: { clientSecret: 'nope' } });
    expect(sso.status).toBe(403);
  });

  it('PUT isPublic sur une clé hors allowlist est ignoré', async () => {
    const res = await request(app)
      .put(`/settings/institution/sso:${fx.a.institutionId}`)
      .set(auth(fx.globalAdmin.token))
      .send({
        value: { enabled: true, provider: 'stub', clientId: 'id-a', clientSecret: 'own-secret' },
        isPublic: true,
      });
    expect(res.status).toBe(200);
    const stored = await prisma.strkSetting.findUnique({
      where: { category_key: { category: 'institution', key: `sso:${fx.a.institutionId}` } },
    });
    expect(stored?.isPublic).toBe(false);
  });

  it('l’admin peut toujours écrire platformFlags', async () => {
    const res = await request(app)
      .put('/settings/system/platformFlags')
      .set(auth(fx.globalAdmin.token))
      .send({ value: { finance: true } });
    expect(res.status).toBe(200);
  });
});
