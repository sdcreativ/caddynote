/**
 * Web Push (VAPID) — abonnements navigateur / PWA.
 * Sans VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY : non configuré (opt-in silencieux).
 */
import webpush from 'web-push';
import { prisma } from './prisma.js';
import { areExternalServicesDisabled } from './testMode.js';

export const isWebPushConfigured = (): boolean =>
  !areExternalServicesDisabled() &&
  !!(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());

let vapidReady = false;

const ensureVapid = () => {
  if (vapidReady || !isWebPushConfigured()) return;
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:ops@caddynote.app';
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim());
  vapidReady = true;
};

export const getVapidPublicKey = (): string | null =>
  isWebPushConfigured() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/** Envoie une notification Web Push à tous les abonnements actifs de l’utilisateur. */
export const sendWebPushToUser = async (userId: string, payload: PushPayload): Promise<number> => {
  if (!isWebPushConfigured()) return 0;

  const settings = await prisma.strkNotificationSetting.findUnique({ where: { userId } });
  if (settings && !settings.pushNotifications) return 0;

  const subs = await prisma.strkPushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return 0;

  ensureVapid();
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/notifications',
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
      sent += 1;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      // Endpoint mort / révoqué → nettoyer
      if (status === 404 || status === 410) {
        await prisma.strkPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        console.error('Web Push send failed:', err);
      }
    }
  }
  return sent;
};
