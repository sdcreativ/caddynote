import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  type AuthSession,
} from '@/services/strkAuthSessionsService';

/** Sessions authentifiées révocables (IAM-004). */
export function SessionsPanel() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listSessions());
    } catch (e) {
      toast({
        title: t('sessions.title'),
        description: e instanceof ApiError ? e.message : t('sessions.loadError'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevoke = async (id: string) => {
    try {
      await revokeSession(id);
      toast({ title: t('sessions.revoked') });
      await load();
    } catch (e) {
      toast({
        title: t('sessions.failTitle'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const onRevokeOthers = async () => {
    try {
      const n = await revokeOtherSessions();
      toast({ title: t('sessions.revokedOthers', { count: n }) });
      await load();
    } catch (e) {
      toast({
        title: t('sessions.failTitle'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('sessions.intro')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {t('sessions.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onRevokeOthers()} disabled={loading}>
            {t('sessions.revokeOthers')}
          </Button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sessions.empty')}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.userAgent || t('sessions.unknownDevice')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('sessions.lastSeen', { datetime: new Date(s.lastSeenAt).toLocaleString('fr-FR') })}
                  {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.current && <Badge>{t('sessions.current')}</Badge>}
                {!s.current && (
                  <Button size="sm" variant="outline" onClick={() => void onRevoke(s.id)}>
                    {t('sessions.revoke')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
