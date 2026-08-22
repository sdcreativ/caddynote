import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import { fetchAuditLog, type AuditLogEntry } from '@/services/strkAuditService';

/**
 * IAM-005 — consultation du journal d’audit serveur (direction uniquement).
 */
const actorLabel = (entry: AuditLogEntry) => {
  const a = entry.actor;
  if (!a) return '—';
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ');
  return name || a.email || a.id;
};

const AuditLogPage = () => {
  const { t } = useTranslation('audit');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLog({
        institutionId: user?.institutionId || undefined,
        action: actionFilter.trim() || undefined,
        limit: 100,
      });
      setLogs(data);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('loadError');
      setError(message);
      toast({ title: tc('status.error'), description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.institutionId, actionFilter, toast, t, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('refresh')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{tc('actions.filter')}</CardTitle>
          <CardDescription>{t('filterDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="audit-action">{t('action')}</Label>
            <Input
              id="audit-action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder={t('actionPlaceholder')}
              className="w-64"
            />
          </div>
          <Button type="button" onClick={() => void load()}>
            {t('apply')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <LoadingState label={t('loading')} />
          ) : error ? (
            <ErrorState description={error} onRetry={() => void load()} />
          ) : logs.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.date')}</TableHead>
                  <TableHead>{t('columns.action')}</TableHead>
                  <TableHead>{t('columns.actor')}</TableHead>
                  <TableHead>{t('columns.target')}</TableHead>
                  <TableHead>{t('columns.ip')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(entry.createdAt).toLocaleString('fr-FR')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="text-sm">{actorLabel(entry)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.targetType ? `${entry.targetType}` : '—'}
                      {entry.targetId ? (
                        <span className="ml-1 font-mono text-xs">{entry.targetId.slice(0, 8)}…</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.ipAddress || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScrollText className="h-3.5 w-3.5" />
        {t('footer')}
      </p>
    </div>
  );
};

export default AuditLogPage;
