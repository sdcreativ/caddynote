import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('Web Push + DESPS stubs', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('GET /push/vapid-public-key est public et cohérent', async () => {
    const res = await request(app).get('/push/vapid-public-key');
    expect(res.status).toBe(200);
    expect(typeof res.body.configured).toBe('boolean');
    if (!res.body.configured) {
      expect(res.body.publicKey).toBeNull();
      const sub = await request(app)
        .post('/push/subscribe')
        .set(auth(fx.a.schoolAdmin.token))
        .send({
          endpoint: 'https://example.com/push/test',
          keys: { p256dh: 'x', auth: 'y' },
        });
      expect(sub.status).toBe(501);
    }
  });

  it('DESPS status / dry-run pour admin global', async () => {
    const denied = await request(app)
      .get('/admin/integrations/desps/status')
      .set(auth(fx.a.schoolAdmin.token));
    expect([401, 403]).toContain(denied.status);

    const admin = await request(app)
      .get('/admin/integrations/desps/status')
      .set(auth(fx.globalAdmin.token));
    expect(admin.status).toBe(200);
    expect(admin.body).toHaveProperty('configured');

    const sync = await request(app)
      .post('/admin/integrations/desps/sync/students')
      .set(auth(fx.globalAdmin.token))
      .send({ institutionId: fx.a.institutionId });
    expect(sync.status).toBe(200);
    expect(sync.body.mode).toBe('dry_run');
    expect(typeof sync.body.snapshot.count).toBe('number');
  });
});

describe('Communications AI draft', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('POST /communications/ai/draft exige flag + IA configurée', async () => {
    await request(app)
      .put(`/institutions/${fx.a.institutionId}/features/exercises_ai`)
      .set(auth(fx.globalAdmin.token))
      .send({ enabled: true });

    const res = await request(app)
      .post('/communications/ai/draft')
      .set(auth(fx.a.schoolAdmin.token))
      .send({ intent: 'Rappeler la réunion parents du jeudi' });

    expect([200, 501, 403]).toContain(res.status);
    if (res.status === 501) {
      expect(String(res.body.error || '')).toMatch(/IA|ANTHROPIC|OPENAI/i);
    }
  });
});
