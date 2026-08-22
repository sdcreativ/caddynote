import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type StatusPayload = {
  service: string;
  status: string;
  checkedAt: string;
  snapshotAt: string | null;
  indicators: {
    errorRate: number;
    total5xx: number | null;
    avgLatencyMs: number | null;
    communicationsQueued: number | null;
    communicationsFailed24h: number | null;
  };
  history: Array<{ timestamp: string; errorRate: number; total5xx: number }>;
  notice?: string;
};

/** Page status publique (SLO léger) — GET /status API. */
const StatusPage = () => {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    void fetch(`${base}/status`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatusPayload>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
  }, []);

  const variant =
    data?.status === 'operational' ? 'default' : data?.status === 'degraded' ? 'destructive' : 'secondary';

  return (
    <PublicShell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-16">
        <div className="flex items-center gap-3">
          <Activity className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Statut CaddyNote</h1>
            <p className="text-sm text-muted-foreground">Indicateurs de disponibilité (snapshot ops).</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && <p className="text-sm text-muted-foreground">Chargement…</p>}

        {data && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{data.service}</CardTitle>
                  <CardDescription>
                    Vérifié {new Date(data.checkedAt).toLocaleString('fr-FR')}
                    {data.snapshotAt
                      ? ` · snapshot ${new Date(data.snapshotAt).toLocaleString('fr-FR')}`
                      : ''}
                  </CardDescription>
                </div>
                <Badge variant={variant}>{data.status}</Badge>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
                <p>Taux d’erreur : {((data.indicators.errorRate || 0) * 100).toFixed(2)}%</p>
                <p>5xx : {data.indicators.total5xx ?? '—'}</p>
                <p>
                  Latence moy. :{' '}
                  {data.indicators.avgLatencyMs != null
                    ? `${data.indicators.avgLatencyMs.toFixed(0)} ms`
                    : '—'}
                </p>
                <p>Comms en file : {data.indicators.communicationsQueued ?? '—'}</p>
                <p>Comms échoués 24h : {data.indicators.communicationsFailed24h ?? '—'}</p>
              </CardContent>
            </Card>

            {data.history?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Historique récent</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
                    {[...data.history].reverse().map((h) => (
                      <li key={h.timestamp}>
                        {new Date(h.timestamp).toLocaleString('fr-FR')} · err{' '}
                        {(h.errorRate * 100).toFixed(2)}% · 5xx {h.total5xx}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {data.notice && <p className="text-xs text-muted-foreground">{data.notice}</p>}
          </>
        )}
      </div>
    </PublicShell>
  );
};

export default StatusPage;
