/**
 * §7 — recette transverse : status public, IDOR ops, flags module.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { MODULE_FEATURES_DEFAULT_ON } from '../lib/featureFlags.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

describe('Transverse qualité produit — recette §7', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterAll(async () => {
    // Restaurer flags éventuellement coupés
    for (const key of ['finance', 'admissions', 'documents', 'lot9_services'] as const) {
      await request(app)
        .put(`/institutions/${fx.a.institutionId}/features/${key}`)
        .set(auth(fx.globalAdmin.token))
        .send({ enabled: null });
    }
  });

  describe('7.1 — feature flags enforce (P0)', () => {
    it('MODULE_FEATURES_DEFAULT_ON contient les modules métier attendus', () => {
      expect(MODULE_FEATURES_DEFAULT_ON).toEqual(
        expect.arrayContaining(['finance', 'communications', 'admissions', 'documents', 'canteen', 'lot9_services'])
      );
    });

    it('finance / admissions / documents / lot9 bloqués quand flag off', async () => {
      for (const key of ['finance', 'admissions', 'documents', 'lot9_services'] as const) {
        await request(app)
          .put(`/institutions/${fx.a.institutionId}/features/${key}`)
          .set(auth(fx.globalAdmin.token))
          .send({ enabled: false });
      }

      const finance = await request(app)
        .get(`/finance/fee-items?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(finance.status).toBe(403);
      expect(finance.body.code).toBe('feature_disabled');

      const admissions = await request(app)
        .get('/admissions')
        .set(auth(fx.a.schoolAdmin.token));
      expect(admissions.status).toBe(403);
      expect(admissions.body.code).toBe('feature_disabled');

      const documents = await request(app)
        .get(`/documents?institutionId=${fx.a.institutionId}`)
        .set(auth(fx.a.schoolAdmin.token));
      expect(documents.status).toBe(403);
      expect(documents.body.code).toBe('feature_disabled');

      const lot9 = await request(app)
        .get('/services/transport/routes')
        .set(auth(fx.a.schoolAdmin.token));
      expect(lot9.status).toBe(403);
      expect(lot9.body.code).toBe('feature_disabled');
    });
  });

  describe('7.1 — IDOR / ops (P1)', () => {
    it('school_admin ne peut pas lire la file contact ops ni search admin', async () => {
      const contact = await request(app)
        .get('/admin/contact-messages')
        .set(auth(fx.a.schoolAdmin.token));
      expect(contact.status).toBe(403);

      const search = await request(app)
        .get('/admin/search?q=test')
        .set(auth(fx.a.schoolAdmin.token));
      expect(search.status).toBe(403);
    });

    it('admin plateforme lit contact-messages ; convert refuse un id inconnu', async () => {
      const list = await request(app)
        .get('/admin/contact-messages?status=all')
        .set(auth(fx.globalAdmin.token));
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.messages)).toBe(true);

      const missing = await request(app)
        .post('/admin/contact-messages/00000000-0000-4000-8000-000000000099/convert')
        .set(auth(fx.globalAdmin.token));
      expect(missing.status).toBe(404);
    });
  });

  describe('7.2 — status page publique (P2)', () => {
    it('GET /status est public et structurellement stable', async () => {
      await prisma.strkSetting.upsert({
        where: { category_key: { category: 'system', key: 'publicStatusSnapshot' } },
        create: {
          category: 'system',
          key: 'publicStatusSnapshot',
          value: {
            timestamp: new Date().toISOString(),
            http: { errorRate: 0.01, total5xx: 0, avgLatencyMs: 40 },
            communications: { queued: 0, failedLast24h: 0 },
            history: [],
          },
          description: 'test snapshot',
          isPublic: true,
        },
        update: {
          value: {
            timestamp: new Date().toISOString(),
            http: { errorRate: 0.01, total5xx: 0, avgLatencyMs: 40 },
            communications: { queued: 0, failedLast24h: 0 },
            history: [],
          },
        },
      });

      const res = await request(app).get('/status');
      expect(res.status).toBe(200);
      expect(res.body.service).toBe('CaddyNote');
      expect(['operational', 'degraded', 'unknown']).toContain(res.body.status);
      expect(res.body.indicators).toBeDefined();
    });
  });
});
