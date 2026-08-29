/**
 * Rétention NFR — purge notifs expirées + activités anciennes.
 */
import { scheduleExclusiveCron } from './cronLock.js';
import { prisma } from './prisma.js';

const ACTIVITY_RETENTION_DAYS = Math.max(
  30,
  Number(process.env.ACTIVITY_RETENTION_DAYS || 90) || 90
);

export const runNotificationAndActivityRetention = async (): Promise<{
  notificationsDeleted: number;
  strkNotificationsDeleted: number;
  activitiesDeleted: number;
}> => {
  const now = new Date();
  const activityCutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 86400000);

  const [legacy, strk, activities] = await Promise.all([
    prisma.notification.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.strkNotification.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.strkActivity.deleteMany({
      where: { createdAt: { lt: activityCutoff } },
    }),
  ]);

  return {
    notificationsDeleted: legacy.count,
    strkNotificationsDeleted: strk.count,
    activitiesDeleted: activities.count,
  };
};

let started = false;

export const startNotificationActivityRetentionCron = (): void => {
  if (started) return;
  started = true;
  // Quotidien 03:40
  scheduleExclusiveCron('40 3 * * *', 'notification-activity-retention', async () => {
    const result = await runNotificationAndActivityRetention();
    if (
      result.notificationsDeleted +
        result.strkNotificationsDeleted +
        result.activitiesDeleted >
      0
    ) {
      console.info('[retention]', result);
    }
  });
};
