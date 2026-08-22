import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { campaignDeliveryReport } from '../lib/campaignSchedule.js';
import { buildFixture, auth, type Fixture } from './fixtures.js';

/**
 * §5.10 P2 — rapport de délivrance campagnes (useCase persisté + endpoint ops).
 */
describe('Communications — rapport délivrance campagnes (§5.10)', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('persiste useCase sur le journal et agrège le rapport 7j', async () => {
    const send = await request(app)
      .post('/admin/campaign-send')
      .set(auth(fx.globalAdmin.token))
      .send({
        recipientIds: [fx.a.student.id],
        channel: 'push',
        subject: 'Campagne §5.10',
        body: 'Message campagne test',
        useCase: 'platform_campaign',
      });
    expect(send.status).toBe(202);
    expect(send.body.ok).toBe(1);

    const log = await prisma.strkCommunicationLog.findFirst({
      where: { recipientId: fx.a.student.id, useCase: 'platform_campaign' },
      orderBy: { requestedAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect(log!.useCase).toBe('platform_campaign');

    const report = await campaignDeliveryReport('platform_campaign');
    expect(report.since).toBeTruthy();
    const total = report.rows.reduce((n, r) => n + r.count, 0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(report.rows.some((r) => r.channel === 'push')).toBe(true);

    const http = await request(app)
      .get('/admin/campaign-delivery-report')
      .set(auth(fx.globalAdmin.token));
    expect(http.status).toBe(200);
    expect(Array.isArray(http.body.rows)).toBe(true);
    expect(http.body.rows.reduce((n: number, r: { count: number }) => n + r.count, 0)).toBeGreaterThanOrEqual(1);
  });

  it('refuse le rapport aux non-admins', async () => {
    const res = await request(app)
      .get('/admin/campaign-delivery-report')
      .set(auth(fx.a.schoolAdmin.token));
    expect(res.status).toBe(403);
  });
});
