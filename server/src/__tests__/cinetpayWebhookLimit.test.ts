import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { app } from '../index.js';
import {
  CINETPAY_WEBHOOK_LIMIT,
  CINETPAY_WEBHOOK_WINDOW_MS,
  createCinetPayWebhookLimiter,
} from '../routes/finance.routes.js';

describe('Webhook CinetPay — quota', () => {
  it('reste public : 400 sans transaction_id, pas 401', async () => {
    const res = await request(app).post('/finance/webhooks/cinetpay').send({});
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(401);
  });

  it('borne la fenêtre et le plafond (anti-check fournisseur en boucle)', () => {
    expect(CINETPAY_WEBHOOK_LIMIT).toBeLessThanOrEqual(60);
    expect(CINETPAY_WEBHOOK_WINDOW_MS).toBeLessThanOrEqual(60 * 1000);
  });

  it('répond 429 au-delà du quota (hors skip test)', async () => {
    const probe = express();
    probe.post(
      '/hook',
      createCinetPayWebhookLimiter({ limit: 2, windowMs: 60_000, skip: () => false }),
      (_req, res) => {
        res.sendStatus(200);
      }
    );

    expect((await request(probe).post('/hook').send({})).status).toBe(200);
    expect((await request(probe).post('/hook').send({})).status).toBe(200);
    const blocked = await request(probe).post('/hook').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/notifications/i);
  });
});
