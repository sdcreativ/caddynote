import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchDiagnostics, type DiagnosticsPayload } from '@/services/strkOpsService';

/** Alertes dérivées des diagnostics réels — plus de mockAlerts. */
const CriticalAlertsCenter = ({ embedded = false }: { embedded?: boolean }) => {
  const [diag, setDiag] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDiag(await fetchDiagnostics());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts: Array<{ severity: 'critical' | 'warning' | 'ok'; title: string; detail: string }> = [];
  if (diag) {
    if (diag.database !== 'up' && diag.database !== 'connected') {
      alerts.push({
        severity: 'critical',
        title: 'Base de données',
        detail: `Statut Postgres : ${diag.database}`,
      });
    }
    if (diag.integrations) {
      for (const [name, info] of Object.entries(diag.integrations)) {
        if (info.configured === false) {
          alerts.push({
            severity: 'warning',
            title: `Intégration ${name}`,
            detail: 'Non configurée (variables d’environnement manquantes).',
          });
        } else if (info.ok === false) {
          alerts.push({
            severity: 'critical',
            title: `Intégration ${name}`,
            detail: info.detail || 'En erreur',
          });
        }
      }
    }
    if (alerts.length === 0) {
      alerts.push({
        severity: 'ok',
        title: 'Système nominal',
        detail: `Diagnostics OK — ${new Date(diag.timestamp).toLocaleString('fr-FR')}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Alertes critiques</h2>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      )}
      <div className="space-y-3">
        {alerts.map((a, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {a.severity === 'ok' ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle
                    className={`h-5 w-5 ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-500'}`}
                  />
                )}
                {a.title}
                <Badge variant={a.severity === 'critical' ? 'destructive' : 'secondary'}>{a.severity}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{a.detail}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default CriticalAlertsCenter;
