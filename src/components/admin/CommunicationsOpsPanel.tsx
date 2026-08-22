import { useCallback, useEffect, useState } from 'react';
import { MailWarning, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApiError } from '@/lib/apiClient';
import {
  listFailedCommunications,
  retryCommunication,
  purgeFailedCommunications,
  type CommOpsLog,
} from '@/services/strkOpsService';

/** File communications failed / queued — retry & purge. */
const CommunicationsOpsPanel = () => {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [status, setStatus] = useState<'failed' | 'queued'>('failed');
  const [logs, setLogs] = useState<CommOpsLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFailedCommunications(status);
      setLogs(res.logs || []);
    } catch (e) {
      toast({
        title: 'File indisponible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retryCommunication(id);
      toast({ title: 'Relancé en file' });
      await load();
    } catch (e) {
      toast({
        title: 'Retry impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const onPurge = async () => {
    const ok = await confirm({
      description: 'Supprimer les communications failed de plus de 30 jours ?',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyId('__purge__');
    try {
      const res = await purgeFailedCommunications(30);
      toast({ title: `${res.deleted} journal(aux) purgé(s)` });
      await load();
    } catch (e) {
      toast({
        title: 'Purge impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailWarning className="h-4 w-4" /> File communications
          </CardTitle>
          <CardDescription>Retry failed → queued · purge des failed anciens.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={status === 'failed' ? 'default' : 'outline'}
            onClick={() => setStatus('failed')}
          >
            Failed
          </Button>
          <Button
            type="button"
            size="sm"
            variant={status === 'queued' ? 'default' : 'outline'}
            onClick={() => setStatus('queued')}
          >
            Queued
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void onPurge()}
            disabled={!!busyId}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Purge &gt;30j
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {loading ? 'Chargement…' : `Aucun journal « ${status} ».`}
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto text-xs">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{log.channel}</Badge>
                    <Badge variant={log.status === 'failed' ? 'destructive' : 'secondary'}>
                      {log.status}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{log.id.slice(0, 8)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {log.toAddress || log.recipientId.slice(0, 8)} · {log.useCase || '—'}
                  </p>
                  {log.errorMessage && <p className="text-destructive">{log.errorMessage}</p>}
                  <p className="text-muted-foreground">
                    {new Date(log.requestedAt).toLocaleString('fr-FR')}
                  </p>
                </div>
                {log.status === 'failed' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === log.id}
                    onClick={() => void onRetry(log.id)}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default CommunicationsOpsPanel;
