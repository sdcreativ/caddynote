/**
 * Opt-in Web Push (VAPID) — Paramètres utilisateur.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function WebPushOptIn() {
  const { t } = useTranslation('settings');
  const { toast } = useToast();
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const meta = await apiClient.get<{ configured: boolean; publicKey: string | null }>(
        '/push/vapid-public-key'
      );
      setConfigured(meta.configured && !!meta.publicKey);
      if (!meta.configured || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setSubscribed(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      const meta = await apiClient.get<{ configured: boolean; publicKey: string | null }>(
        '/push/vapid-public-key'
      );
      if (!meta.configured || !meta.publicKey) {
        toast({ title: t('webPush.unavailableTitle'), description: t('webPush.unavailableBody'), variant: 'destructive' });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({ title: t('webPush.deniedTitle'), description: t('webPush.deniedBody'), variant: 'destructive' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(meta.publicKey),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('subscription incomplete');
      }
      await apiClient.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setSubscribed(true);
      toast({ title: t('webPush.enabledTitle'), description: t('webPush.enabledBody') });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('webPush.errorBody');
      toast({ title: t('webPush.errorTitle'), description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiClient.delete(`/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast({ title: t('webPush.disabledTitle') });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('webPush.errorBody');
      toast({ title: t('webPush.errorTitle'), description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">{t('webPush.unavailableBody')}</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={subscribed ? 'outline' : 'default'} disabled={busy} onClick={() => void (subscribed ? disable() : enable())}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : subscribed ? <BellOff className="mr-2 h-4 w-4" /> : <Bell className="mr-2 h-4 w-4" />}
        {subscribed ? t('webPush.disable') : t('webPush.enable')}
      </Button>
      <span className="text-sm text-muted-foreground">
        {subscribed ? t('webPush.statusOn') : t('webPush.statusOff')}
      </span>
    </div>
  );
}
