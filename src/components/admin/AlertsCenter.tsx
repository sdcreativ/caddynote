import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
  Clock,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSubscriptionAlerts } from '@/hooks/useSubscriptionAlerts';
import { fetchDiagnostics, type DiagnosticsPayload } from '@/services/strkOpsService';
import { apiClient } from '@/lib/apiClient';

type AlertType = 'critical' | 'warning' | 'info' | 'success';

type OpsAlert = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  source: string;
  section?: string;
};

type AlertsCenterProps = {
  onNavigateSection?: (section: string) => void;
  /** Filtre d’affichage : all | system | billing */
  focus?: 'all' | 'system' | 'billing';
  title?: string;
};

const DISMISS_STORAGE_KEY = 'caddynote.superadmin.dismissedAlerts';

const readDismissedLocal = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

const writeDismissedLocal = (set: Set<string>) => {
  localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...set]));
};

const AlertsCenter = ({
  onNavigateSection,
  focus = 'all',
  title = 'Centre d’alertes',
}: AlertsCenterProps) => {
  const { toast } = useToast();
  const { alerts: subscriptionAlerts, loading: subscriptionLoading, refetch: refetchSubs } =
    useSubscriptionAlerts();
  const [diag, setDiag] = useState<DiagnosticsPayload | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissedLocal());

  useEffect(() => {
    void apiClient
      .get<{ ids: string[] }>('/admin/dismissed-alerts')
      .then((res) => {
        const next = new Set(res.ids || []);
        setDismissed(next);
        writeDismissedLocal(next);
      })
      .catch(() => undefined);
  }, []);

  const persistDismissed = (next: Set<string>) => {
    writeDismissedLocal(next);
    void apiClient.put('/admin/dismissed-alerts', { ids: [...next] }).catch(() => undefined);
  };

  const dismissAlert = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissed(next);
      return next;
    });
  };

  const clearDismissed = () => {
    setDismissed(new Set());
    persistDismissed(new Set());
  };

  const loadDiag = useCallback(async () => {
    setLoadingDiag(true);
    try {
      setDiag(await fetchDiagnostics());
    } catch {
      setDiag(null);
      toast({
        title: 'Diagnostics indisponibles',
        description: 'Impossible de charger l’état système.',
        variant: 'destructive',
      });
    } finally {
      setLoadingDiag(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDiag();
  }, [loadDiag]);

  const systemAlerts = useMemo(() => {
    const list: OpsAlert[] = [];
    if (!diag) return list;

    if (diag.database && diag.database !== 'up' && diag.database !== 'connected') {
      list.push({
        id: 'db-status',
        type: 'critical',
        title: 'Base de données',
        message: `Statut Postgres : ${diag.database}`,
        timestamp: new Date(diag.timestamp),
        source: 'Système',
        section: 'system',
      });
    }

    if (diag.status && diag.status !== 'ok' && diag.status !== 'healthy') {
      list.push({
        id: 'api-status',
        type: 'critical',
        title: 'API',
        message: `Statut global : ${diag.status}`,
        timestamp: new Date(diag.timestamp),
        source: 'Système',
        section: 'system',
      });
    }

    if (diag.integrations) {
      for (const [name, info] of Object.entries(diag.integrations)) {
        if (info.configured === false) {
          list.push({
            id: `int-${name}-cfg`,
            type: 'warning',
            title: `Intégration ${name}`,
            message: 'Non configurée (variables d’environnement manquantes).',
            timestamp: new Date(diag.timestamp),
            source: 'Intégrations',
            section: 'settings',
          });
        } else if (info.ok === false) {
          list.push({
            id: `int-${name}-err`,
            type: 'critical',
            title: `Intégration ${name}`,
            message: info.detail || 'En erreur',
            timestamp: new Date(diag.timestamp),
            source: 'Intégrations',
            section: 'critical-alerts',
          });
        }
      }
    }

    if (list.length === 0) {
      list.push({
        id: 'system-ok',
        type: 'success',
        title: 'Système nominal',
        message: `Diagnostics OK — ${new Date(diag.timestamp).toLocaleString('fr-FR')}`,
        timestamp: new Date(diag.timestamp),
        source: 'Système',
        section: 'system',
      });
    }

    return list;
  }, [diag]);

  const billingAlerts: OpsAlert[] = subscriptionAlerts.map((subAlert) => ({
    id: subAlert.id,
    type: subAlert.priority === 'high' ? 'critical' : 'warning',
    title: subAlert.title,
    message: subAlert.message,
    timestamp: new Date(),
    source: 'Abonnements',
    section: subAlert.actionSection || 'subscriptions',
  }));

  const allAlerts = [...systemAlerts, ...billingAlerts].filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (focus === 'system') return a.source !== 'Abonnements';
    if (focus === 'billing') return a.source === 'Abonnements';
    return true;
  });

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const diff = Date.now() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `il y a ${hours}h`;
    if (minutes > 0) return `il y a ${minutes}min`;
    return 'à l’instant';
  };

  const loading = loadingDiag || subscriptionLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Alertes dérivées des diagnostics API et des abonnements — aucune donnée fictive.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              void loadDiag();
              void refetchSubs();
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          {dismissed.size > 0 && (
            <Button type="button" variant="ghost" onClick={clearDismissed}>
              Réafficher masquées ({dismissed.size})
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Critiques</p>
            <p className="text-2xl font-bold">
              {allAlerts.filter((a) => a.type === 'critical').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Avertissements</p>
            <p className="text-2xl font-bold">
              {allAlerts.filter((a) => a.type === 'warning').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total visibles</p>
            <p className="text-2xl font-bold">{allAlerts.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {allAlerts.map((alert) => (
          <Alert key={alert.id} className="relative">
            <div className="flex items-start gap-3 pr-8">
              {getAlertIcon(alert.type)}
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base font-semibold">{alert.title}</CardTitle>
                  <Badge variant={alert.type === 'critical' ? 'destructive' : 'secondary'}>
                    {alert.source}
                  </Badge>
                  <span className="flex items-center text-xs text-muted-foreground">
                    <Clock className="mr-1 h-3 w-3" />
                    {formatTimestamp(alert.timestamp)}
                  </span>
                </div>
                <AlertDescription>{alert.message}</AlertDescription>
                {alert.section && onNavigateSection && alert.type !== 'success' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => onNavigateSection(alert.section!)}
                  >
                    {alert.source === 'Abonnements' ? (
                      <>
                        <CreditCard className="mr-2 h-3 w-3" /> Voir abonnements
                      </>
                    ) : (
                      'Ouvrir la section'
                    )}
                  </Button>
                )}
              </div>
              {alert.type !== 'success' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-8 w-8"
                  onClick={() => dismissAlert(alert.id)}
                  aria-label="Masquer l’alerte"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Alert>
        ))}

        {!loading && allAlerts.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <CheckCircle className="h-5 w-5" />
              Aucune alerte active
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AlertsCenter;
