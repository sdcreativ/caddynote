import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { buildFixture, type Fixture } from './fixtures.js';
import { runNotificationAndActivityRetention } from '../lib/notificationActivityRetention.js';

describe('rétention notifications / activités', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  it('supprime les notifs expirées et les activités trop anciennes', async () => {
    const past = new Date(Date.now() - 86400000);
    const ancient = new Date(Date.now() - 120 * 86400000);

    await prisma.notification.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        title: 'Expirée',
        message: 'à purger',
        expiresAt: past,
      },
    });
    await prisma.strkNotification.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        title: 'Expirée strk',
        message: 'à purger',
        expiresAt: past,
      },
    });
    await prisma.strkActivity.create({
      data: {
        institutionId: fx.a.institutionId,
        userId: fx.a.schoolAdmin.id,
        type: 'test.old',
        description: 'ancienne',
        createdAt: ancient,
      },
    });
    await prisma.notification.create({
      data: {
        userId: fx.a.schoolAdmin.id,
        title: 'Active',
        message: 'garder',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const result = await runNotificationAndActivityRetention();
    expect(result.notificationsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.strkNotificationsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.activitiesDeleted).toBeGreaterThanOrEqual(1);

    const kept = await prisma.notification.findMany({
      where: { userId: fx.a.schoolAdmin.id, title: 'Active' },
    });
    expect(kept.length).toBeGreaterThanOrEqual(1);
  });
});
