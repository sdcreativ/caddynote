import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  getCommunicationPreferences,
  setCommunicationPreference,
  type ComChannel,
} from '@/services/strkCommunicationService';
import { Mail, MessageSquare, Smartphone, Bell } from 'lucide-react';

const CHANNELS: { channel: ComChannel; icon: typeof Mail }[] = [
  { channel: 'email', icon: Mail },
  { channel: 'sms', icon: Smartphone },
  { channel: 'whatsapp', icon: MessageSquare },
  { channel: 'push', icon: Bell },
];

/** Préférences canaux COM (opt-in / opt-out). */
export function CommunicationPreferencesPanel() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [opted, setOpted] = useState<Record<ComChannel, boolean>>({
    email: true,
    sms: false,
    whatsapp: false,
    push: true,
  });
  const [busy, setBusy] = useState<ComChannel | null>(null);

  const load = useCallback(async () => {
    try {
      const prefs = await getCommunicationPreferences();
      const next = { email: true, sms: false, whatsapp: false, push: true } as Record<
        ComChannel,
        boolean
      >;
      for (const p of prefs) {
        next[p.channel] = p.optedIn;
      }
      setOpted(next);
    } catch (e) {
      toast({
        title: t('prefs.title'),
        description: e instanceof ApiError ? e.message : t('prefs.loadError'),
        variant: 'destructive',
      });
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (channel: ComChannel, value: boolean) => {
    setBusy(channel);
    const prev = opted[channel];
    setOpted((o) => ({ ...o, [channel]: value }));
    try {
      await setCommunicationPreference(channel, value);
    } catch (e) {
      setOpted((o) => ({ ...o, [channel]: prev }));
      toast({
        title: t('prefs.failTitle'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {CHANNELS.map(({ channel, icon: Icon }) => (
        <div key={channel} className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Icon className="h-4 w-4 shrink-0" />
            <div>
              <Label>{t(`channels.${channel}.label`)}</Label>
              <p className="text-sm text-muted-foreground">{t(`channels.${channel}.hint`)}</p>
            </div>
          </div>
          <Switch
            checked={opted[channel]}
            disabled={busy === channel}
            onCheckedChange={(checked) => void onToggle(channel, checked)}
          />
        </div>
      ))}
    </div>
  );
}
