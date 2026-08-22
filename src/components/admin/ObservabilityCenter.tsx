import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  RefreshCw,
  ScrollText,
  Server,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { fetchDiagnostics, fetchOpsMetrics, type DiagnosticsPayload, type OpsMetrics } from '@/services/strkOpsService';
import { apiClient, ApiError } from '@/lib/apiClient';
import CriticalAlertsCenter from '@/components/admin/CriticalAlertsCenter';
import CommunicationsOpsPanel from '@/components/admin/CommunicationsOpsPanel';

type AuditRow = {
  id: string;
  action: string;
  createdAt: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  actor?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
};

const dbOk = (database?: string) => database === 'up' || database === 'connected';

/** Diagnostics API + alertes critiques + aperçu audit / SOC. */
const ObservabilityCenter = () => {
  const { toast } = useToast();
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [ops, setOps] = useState<OpsMetrics | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [failedAuth, setFailedAuth] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'health' | 'alerts' | 'soc' | 'jobs'>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#jobs') return 'jobs';
    return 'health';
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [diag, auditRes, loginFailed, mfaFailed, opsRes] = await Promise.all([
        fetchDiagnostics(),
        apiClient
          .get<{ logs: AuditRow[] }>('/audit-log?limit=15')
          .catch(() => ({ logs: [] as AuditRow[] })),
        apiClient
          .get<{ logs: AuditRow[] }>('/audit-log?action=auth.login.failed&limit=40')
          .catch(() => ({ logs: [] as AuditRow[] })),
        apiClient
          .get<{ logs: AuditRow[] }>('/audit-log?action=auth.mfa.failed&limit=40')
          .catch(() => ({ logs: [] as AuditRow[] })),
        fetchOpsMetrics().catch(() => null),
      ]);
      setData(diag);
      setAudit(auditRes.logs || []);
      const merged = [...(loginFailed.logs || []), ...(mfaFailed.logs || [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setFailedAuth(merged.slice(0, 40));
      setOps(opsRes);
    } catch (e) {
      toast({
        title: 'Observabilité indisponible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const healthy = data?.status === 'ok' || dbOk(data?.database);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Observabilité</h2>
          <p className="text-sm text-muted-foreground">
            Santé API, alertes critiques (diagnostics) et tentatives d’auth échouées.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'health' as const, label: 'Santé & métriques' },
            { id: 'alerts' as const, label: 'Alertes critiques' },
            { id: 'soc' as const, label: 'SOC auth' },
            { id: 'jobs' as const, label: 'File comms' },
          ] as const
        ).map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? 'default' : 'outline'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tab === 'alerts' ? (
        <CriticalAlertsCenter embedded />
      ) : tab === 'jobs' ? (
        <CommunicationsOpsPanel />
      ) : tab === 'soc' ? (
        <Card id="failed-auth-soc">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Tentatives d’auth échouées
            </CardTitle>
            <CardDescription>
              login.failed + mfa.failed — compteur 24h : {ops?.security.failedAuthLast24h ?? '—'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {failedAuth.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune tentative récente journalisée.</p>
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto text-xs">
                {failedAuth.map((row) => {
                  const reason =
                    row.metadata && typeof row.metadata.reason === 'string'
                      ? row.metadata.reason
                      : null;
                  const actorLabel =
                    row.actor?.email ||
                    [row.actor?.firstName, row.actor?.lastName].filter(Boolean).join(' ') ||
                    'compte inconnu';
                  return (
                    <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                      <div>
                        <p className="font-mono text-[11px]">{row.action}</p>
                        <p className="text-muted-foreground">
                          {actorLabel}
                          {reason ? ` · ${reason}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-muted-foreground">
                        <p className="font-mono">{row.ipAddress || 'IP —'}</p>
                        <p>{new Date(row.createdAt).toLocaleString('fr-FR')}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Erreurs 5xx</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{ops?.http.total5xx ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  Taux {(ops ? (ops.http.errorRate * 100).toFixed(2) : '—')}% ·{' '}
                  {ops?.http.totalRequests ?? 0} req
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Latence moy.</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {ops?.http.avgLatencyMs != null ? `${ops.http.avgLatencyMs.toFixed(0)} ms` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">Depuis démarrage process</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Jobs / file</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">
                  {ops?.jobs.queueStarted ? 'Queue OK' : 'Queue arrêtée'} · rôle{' '}
                  {ops?.jobs.processRole ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Comms queued {ops?.communications.queued ?? 0} · failed 24h{' '}
                  {ops?.communications.failedLast24h ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => setTab('soc')}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Auth échoués 24h</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{ops?.security.failedAuthLast24h ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Cliquez pour le détail SOC</p>
              </CardContent>
            </Card>
          </div>

          {(ops?.history?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Historique ops (process)</CardTitle>
                <CardDescription>
                  Anneau mémoire locale API (max 24) — pas de persistance durable entre redémarrages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
                  {[...(ops?.history || [])].reverse().map((h) => (
                    <li key={h.timestamp} className="flex flex-wrap justify-between gap-2 border-b py-1">
                      <span>{new Date(h.timestamp).toLocaleString('fr-FR')}</span>
                      <span>
                        5xx {h.http.total5xx} · err {(h.http.errorRate * 100).toFixed(2)}% · lat{' '}
                        {h.http.avgLatencyMs != null ? `${h.http.avgLatencyMs.toFixed(0)}ms` : '—'} ·
                        authfail {h.security.failedAuthLast24h} · comms fail {h.communications.failedLast24h}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" /> Statut API
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={healthy ? 'default' : 'destructive'}>{data?.status ?? '…'}</Badge>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data?.timestamp ? new Date(data.timestamp).toLocaleString('fr-FR') : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" /> Base de données
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {dbOk(data?.database) ? (
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <span className="font-medium">{data?.database ?? '…'}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" /> Sauvegarde / purge
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>Cron : {data?.backupCron || 'non configuré'}</p>
                <p>RPO hint : {data?.rpoHintHours != null ? `${data.rpoHintHours}h` : '—'}</p>
                <p>Purge fichiers : {data?.filePurgeEnabled ? 'oui' : 'non'}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Intégrations</CardTitle>
              <CardDescription>État déclaré par GET /diagnostics</CardDescription>
            </CardHeader>
            <CardContent>
              {!data?.integrations || Object.keys(data.integrations).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune intégration signalée.</p>
              ) : (
                <ul className="divide-y">
                  {Object.entries(data.integrations).map(([name, info]) => (
                    <li key={name} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">
                        {info.configured === false
                          ? 'non configuré'
                          : info.ok === false
                            ? info.detail || 'erreur'
                            : 'OK'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="h-4 w-4" /> Audit récent
              </CardTitle>
              <CardDescription>15 derniers événements (GET /audit-log).</CardDescription>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun événement.</p>
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {audit.map((row) => (
                    <li
                      key={row.id}
                      className="flex justify-between gap-2 border-b border-slate-100 py-1"
                    >
                      <span className="font-mono">{row.action}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString('fr-FR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ObservabilityCenter;
