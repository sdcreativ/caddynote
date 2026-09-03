import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import DataTable from "@/components/common/DataTable";
import { 
  CreditCard, 
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Calendar,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  FileText,
} from "lucide-react";
import SubscriptionPlansAdmin from '@/components/admin/SubscriptionPlansAdmin';
import { SubscriptionMetricsPanel } from '@/components/admin/SubscriptionMetricsPanel';
import { fetchDiagnostics } from '@/services/strkOpsService';
import { findIntegration } from '@/lib/integrationDiagnostics';
import { subscriptionService } from '@/services/subscriptionService';
import type { BillingHistory as BillingHistoryRow } from '@/types/subscription';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useSubscriptionAlerts } from "@/hooks/useSubscriptionAlerts";
import { apiClient, ApiError } from '@/lib/apiClient';

interface Subscription {
  id: string;
  institutionName: string;
  planName: string;
  status: 'active' | 'expired' | 'cancelled' | 'trial' | 'suspended';
  monthlyRevenue: number;
  startDate: Date;
  endDate: Date;
  userCount: number;
  maxUsers: number;
  userEmail: string;
  firstName: string;
  lastName: string;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
}

type BackfillResponse = {
  dryRun: boolean;
  plan: { id: string; name: string; slug: string };
  orphanCount: number;
  created: Array<{ institutionId: string; planName?: string; action: string }>;
  skipped: Array<{ institutionId: string; reason?: string }>;
};

const InstitutionSubscriptionBackfillCard = ({ onDone }: { onDone: () => void }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [lastPreview, setLastPreview] = useState<BackfillResponse | null>(null);

  const runBackfill = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const result = await apiClient.post<BackfillResponse>('/subscriptions/backfill-institutions', {
        dryRun,
        status: 'trial',
      });
      setLastPreview(result);
      toast({
        title: dryRun ? 'Prévisualisation' : 'Rattachement effectué',
        description: dryRun
          ? `${result.orphanCount} établissement(s) orphelin(s) → plan ${result.plan.name}.`
          : `${result.created.length} abo(s) créé(s) sur ${result.plan.name} (${result.skipped.length} ignoré(s)).`,
      });
      if (!dryRun) onDone();
    } catch (e) {
      toast({
        title: 'Backfill impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rattacher les établissements sans plan</CardTitle>
        <CardDescription>
          Les écoles sans abonnement active/trial/grace sont rattachées au plan défaut (Performance),
          sans écraser les abonnements existants. Prévisualisez avant d’appliquer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void runBackfill(true)}>
          Prévisualiser (dry-run)
        </Button>
        <Button
          type="button"
          disabled={busy || !lastPreview || lastPreview.orphanCount === 0}
          onClick={() => void runBackfill(false)}
        >
          Appliquer le rattachement
        </Button>
        {lastPreview ? (
          <p className="w-full text-sm text-muted-foreground">
            Dernier résultat : {lastPreview.orphanCount} orphelin(s) → {lastPreview.plan.name}
            {lastPreview.dryRun ? ' (simulation)' : ` · ${lastPreview.created.length} créé(s)`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const SubscriptionManager = () => {
  const { toast } = useToast();
  const { alerts: subscriptionAlerts } = useSubscriptionAlerts();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [stripeStatus, setStripeStatus] = useState<{
    configured?: boolean;
    ok?: boolean;
    detail?: string;
    webhook?: { configured?: boolean; ok?: boolean; detail?: string };
  } | null>(null);
  const [billingSubId, setBillingSubId] = useState<string | null>(null);
  const [billingRows, setBillingRows] = useState<BillingHistoryRow[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; isTrial?: boolean | null }>>([]);
  const [changePlanSubId, setChangePlanSubId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [dunningFocus, setDunningFocus] = useState<'expiring_subscriptions' | 'ending_trials' | null>(
    null
  );

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      
      const { subscriptions: data } = await apiClient.get<{ subscriptions: any[] }>('/subscriptions/all');

      const formattedSubscriptions: Subscription[] = (data || []).map(sub => {
        const profile = sub.profile;
        return {
          id: sub.id,
          institutionName: sub.institution?.name || 'Sans établissement',
          planName: sub.plan_?.name || sub.plan || 'Standard',
          status: sub.status as 'active' | 'expired' | 'cancelled' | 'trial' | 'suspended',
          monthlyRevenue: Number(sub.plan_?.priceMonthly ?? 0),
          startDate: new Date(sub.startsAt || sub.createdAt),
          endDate: new Date(sub.expiresAt || sub.createdAt),
          userCount: Number(sub.userCount ?? 1),
          maxUsers: Number(sub.plan_?.maxUsers ?? 100) || 100,
          userEmail: profile?.email || '',
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
          stripeCustomerId: sub.stripeCustomerId ?? null,
        };
      });

      setSubscriptions(formattedSubscriptions);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les abonnements",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    void (async () => {
      try {
        const diag = await fetchDiagnostics();
        const stripe = findIntegration(diag.integrations, 'stripe');
        const webhook = findIntegration(diag.integrations, 'stripe_webhook');
        setStripeStatus({
          configured: stripe?.configured,
          ok: stripe?.ok,
          detail: stripe?.detail || stripe?.notes,
          webhook: webhook
            ? { configured: webhook.configured, ok: webhook.ok, detail: webhook.detail || webhook.notes }
            : undefined,
        });
      } catch {
        setStripeStatus(null);
      }
    })();
    void (async () => {
      try {
        const { plans: list } = await apiClient.get<{ plans: any[] }>('/subscriptions/plans/manage');
        setPlans((list || []).map((p) => ({ id: p.id, name: p.name, isTrial: p.isTrial })));
      } catch {
        setPlans([]);
      }
    })();
  }, []);

  const handleChangePlan = async () => {
    if (!changePlanSubId || !selectedPlanId) return;
    try {
      await apiClient.patch(`/subscriptions/${changePlanSubId}/admin`, {
        action: 'change_plan',
        planId: selectedPlanId,
      });
      toast({ title: 'Plan mis à jour' });
      setChangePlanSubId(null);
      await fetchSubscriptions();
    } catch (error) {
      toast({
        title: 'Changement de plan impossible',
        description: error instanceof ApiError ? error.message : 'Erreur serveur',
        variant: 'destructive',
      });
    }
  };

  const openBillingHistory = async (subscriptionId: string) => {
    setBillingSubId(subscriptionId);
    setBillingLoading(true);
    try {
      const rows = await subscriptionService.getBillingHistory(subscriptionId);
      setBillingRows(rows);
    } catch (error) {
      setBillingRows([]);
      toast({
        title: 'Historique indisponible',
        description: error instanceof ApiError ? error.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBillingLoading(false);
    }
  };

  // Métriques financières dérivées des abonnements réels
  const totalRevenue = subscriptions
    .filter((sub) => sub.status === 'active' || sub.status === 'trial')
    .reduce((sum, sub) => sum + sub.monthlyRevenue, 0);
  const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active').length;
  const trialSubscriptions = subscriptions.filter(sub => sub.status === 'trial').length;
  const cancelledSubscriptions = subscriptions.filter(sub => sub.status === 'cancelled').length;
  const totalUsers = subscriptions.reduce((sum, sub) => sum + sub.userCount, 0);

  const monthKey = (d: Date) =>
    d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

  const revenueData = (() => {
    const now = new Date();
    const buckets: { month: string; revenue: number; subscriptions: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        month: monthKey(d),
        revenue: 0,
        subscriptions: 0,
      });
    }
    // MRR du mois = somme des prix des abonnements actifs pendant ce mois.
    for (const bucket of buckets) {
      const [y, m] = bucket.key.split('-').map(Number);
      const monthStart = new Date(y, m, 1);
      const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
      for (const sub of subscriptions) {
        const activeDuring =
          sub.startDate <= monthEnd &&
          sub.endDate >= monthStart &&
          sub.status !== 'cancelled';
        if (activeDuring) {
          bucket.subscriptions += 1;
          if (sub.status === 'active' || sub.status === 'trial') {
            bucket.revenue += sub.monthlyRevenue;
          }
        }
      }
    }
    return buckets.map(({ month, revenue, subscriptions: count }) => ({
      month,
      revenue,
      subscriptions: count,
    }));
  })();

  const planCounts = subscriptions.reduce((acc, sub) => {
    if (sub.status === 'cancelled') return acc;
    acc[sub.planName] = (acc[sub.planName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const planColors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'];
  const planDistribution =
    Object.keys(planCounts).length > 0
      ? Object.entries(planCounts).map(([name, value], index) => ({
          name,
          value,
          color: planColors[index % planColors.length],
        }))
      : [{ name: 'Aucun', value: 1, color: '#cbd5e1' }];

  const conversionRate =
    subscriptions.length > 0
      ? Math.round((activeSubscriptions / Math.max(subscriptions.length, 1)) * 100)
      : 0;
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Actif</Badge>;
      case 'trial':
        return <Badge className="bg-blue-100 text-blue-800"><Calendar className="h-3 w-3 mr-1" />Essai</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Expiré</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="h-3 w-3 mr-1" />Annulé</Badge>;
      case 'suspended':
        return <Badge className="bg-amber-100 text-amber-900"><Pause className="h-3 w-3 mr-1" />Suspendu</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const handleSubscriptionAction = async (
    action: 'extend' | 'suspend' | 'reactivate' | 'cancel',
    subscriptionId: string
  ) => {
    try {
      await apiClient.patch(`/subscriptions/${subscriptionId}/admin`, {
        action: action === 'extend' ? 'extend' : action,
        extendDays: action === 'extend' ? 30 : undefined,
      });
      const labels: Record<string, string> = {
        extend: 'Abonnement prolongé de 30 jours',
        suspend: 'Abonnement suspendu',
        reactivate: 'Abonnement réactivé',
        cancel: 'Abonnement annulé',
      };
      toast({ title: labels[action] || 'Action effectuée' });
      await fetchSubscriptions();
    } catch (error) {
      toast({
        title: 'Action impossible',
        description: error instanceof ApiError ? error.message : 'Erreur serveur',
        variant: 'destructive',
      });
    }
  };

  const handleMonthlyReport = () => {
    const now = new Date();
    const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const header = [
      'Utilisateur',
      'Email',
      'Plan',
      'Statut',
      'Revenus_mensuels_EUR',
      'Debut',
      'Fin',
    ];
    const rows = subscriptions.map((sub) => [
      `${sub.firstName} ${sub.lastName}`.trim(),
      sub.userEmail,
      sub.planName,
      sub.status,
      String(sub.monthlyRevenue),
      sub.startDate.toISOString().slice(0, 10),
      sub.endDate.toISOString().slice(0, 10),
    ]);
    const summary = [
      [],
      ['Resume'],
      ['Mois', monthLabel],
      ['Revenus_mensuels_EUR', String(totalRevenue)],
      ['Abonnements_actifs', String(activeSubscriptions)],
      ['Abonnements_essai', String(trialSubscriptions)],
      ['Total_abonnements', String(subscriptions.length)],
    ];
    const csv = [header, ...rows, ...summary]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rapport-abonnements-${now.toISOString().slice(0, 7)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Rapport mensuel exporté',
      description: `Fichier CSV généré pour ${monthLabel}.`,
    });
  };

  const handleFinancialAnalytics = () => {
    document.getElementById('financial-analytics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const columns = [
    {
      key: "institutionName",
      label: "Établissement / utilisateur",
      render: (value: any, item: any) => (
        <div>
          <div className="font-medium">{item.institutionName}</div>
          <div className="text-sm text-muted-foreground">
            {item.firstName} {item.lastName} · {item.userEmail}
          </div>
        </div>
      ),
    },
    {
      key: "planName",
      label: "Plan",
      render: (value: any, item: any) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">{item.planName}</Badge>
          {item.stripeSubscriptionId ? (
            <Badge variant="default">Stripe</Badge>
          ) : (
            <Badge variant="secondary">DB only</Badge>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Statut",
      render: (value: any, item: any) => getStatusBadge(item.status),
    },
    {
      key: "monthlyRevenue",
      label: "Revenus/mois",
      render: (value: any, item: any) => (
        <div className="font-medium">{item.monthlyRevenue}€</div>
      ),
    },
    {
      key: "userCount",
      label: "Utilisation",
      render: (value: any, item: any) => {
        const usage = (item.userCount / item.maxUsers) * 100;
        return (
          <div className="space-y-1">
            <div className="text-sm">{item.userCount}/{item.maxUsers}</div>
            <Progress value={usage} className="h-1" />
          </div>
        );
      },
    },
    {
      key: "endDate",
      label: "Fin d'abonnement",
      render: (value: any, item: any) => {
        const date = new Date(item.endDate);
        return <div className="text-sm">{date.toLocaleDateString()}</div>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (value: any, item: any) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void handleSubscriptionAction('extend', item.id)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Prolonger (+30 j)
              </DropdownMenuItem>
              {item.status === 'suspended' || item.status === 'cancelled' ? (
                <DropdownMenuItem onClick={() => void handleSubscriptionAction('reactivate', item.id)}>
                  <Play className="mr-2 h-4 w-4" />
                  Réactiver
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void handleSubscriptionAction('suspend', item.id)}>
                  <Pause className="mr-2 h-4 w-4" />
                  Suspendre
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void openBillingHistory(item.id)}>
                <FileText className="mr-2 h-4 w-4" />
                Historique facturation
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setChangePlanSubId(item.id);
                  setSelectedPlanId(plans[0]?.id || '');
                }}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Changer de plan (DB)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void (async () => {
                    try {
                      const res = await apiClient.post<{ mode?: string }>(
                        `/subscriptions/${item.id}/admin/sync-stripe`,
                        {}
                      );
                      toast({
                        title: 'Synchronisé depuis Stripe',
                        description: res.mode || 'ok',
                      });
                      await fetchSubscriptions();
                    } catch (e) {
                      toast({
                        title: e instanceof ApiError && e.status === 422 ? 'Mode DB only' : 'Sync impossible',
                        description: e instanceof ApiError ? e.message : 'Erreur',
                        variant: 'destructive',
                      });
                    }
                  })()
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Stripe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void (async () => {
                    try {
                      const { url } = await apiClient.post<{ url: string }>(
                        `/subscriptions/${item.id}/admin/billing-portal`,
                        {}
                      );
                      window.open(url, '_blank', 'noopener,noreferrer');
                    } catch (e) {
                      toast({
                        title: 'Portail Stripe',
                        description: e instanceof ApiError ? e.message : 'Erreur',
                        variant: 'destructive',
                      });
                    }
                  })()
                }
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Portail Stripe client
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void handleSubscriptionAction('cancel', item.id)}>
                <XCircle className="mr-2 h-4 w-4" />
                Annuler
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gestion des Abonnements</h2>
        <div className="flex space-x-2">
          <Button type="button" variant="outline" onClick={handleMonthlyReport}>
            <Calendar className="h-4 w-4 mr-2" />
            Rapport mensuel
          </Button>
          <Button type="button" onClick={handleFinancialAnalytics}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Analytics abonnements (MRR)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center text-sm font-medium">
            <CreditCard className="h-4 w-4 mr-2" />
            Stripe (ops)
          </CardTitle>
          <CardDescription>
            Intégration Stripe : sync réelle si `stripeSubscriptionId` présent ; sinon actions ops ={' '}
            <strong>DB only</strong> (badge sur chaque ligne). Portail client pour les abo liés.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {stripeStatus == null ? (
            <span className="text-muted-foreground">Statut indisponible</span>
          ) : (
            <>
              <Badge variant={stripeStatus.configured === false ? 'secondary' : stripeStatus.ok === false ? 'destructive' : 'default'}>
                API :{' '}
                {stripeStatus.configured === false
                  ? 'non configuré'
                  : stripeStatus.ok === false
                    ? stripeStatus.detail || 'erreur'
                    : 'OK'}
              </Badge>
              <Badge
                variant={
                  stripeStatus.webhook?.configured === false
                    ? 'secondary'
                    : stripeStatus.webhook?.ok === false
                      ? 'destructive'
                      : 'outline'
                }
              >
                Webhook :{' '}
                {stripeStatus.webhook?.configured === false
                  ? 'non configuré'
                  : stripeStatus.webhook?.ok === false
                    ? stripeStatus.webhook.detail || 'erreur'
                    : 'OK'}
              </Badge>
            </>
          )}
        </CardContent>
      </Card>

      <InstitutionSubscriptionBackfillCard onDone={fetchSubscriptions} />

      <SubscriptionPlansAdmin />

      {billingSubId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Historique facturation</CardTitle>
              <CardDescription className="font-mono text-xs">{billingSubId}</CardDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setBillingSubId(null)}>
              Fermer
            </Button>
          </CardHeader>
          <CardContent>
            {billingLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : billingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune facture enregistrée.</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                {billingRows.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                    <span>
                      {Number(b.amount).toLocaleString('fr-FR', {
                        style: 'currency',
                        currency: (b.currency || 'eur').toUpperCase(),
                      })}{' '}
                      · {b.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {b.payment_date
                        ? new Date(b.payment_date).toLocaleDateString('fr-FR')
                        : '—'}
                      {b.invoice_url ? (
                        <>
                          {' · '}
                          <a
                            className="underline"
                            href={b.invoice_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Facture
                          </a>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {changePlanSubId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Changer de plan (ops)</CardTitle>
              <CardDescription>
                Met à jour planId en base (essai→payant si plan non-trial). Stripe sync manuelle via
                portail client si besoin.
              </CardDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setChangePlanSubId(null)}>
              Fermer
            </Button>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] space-y-1">
              <label className="text-xs text-muted-foreground">Nouveau plan</label>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isTrial ? ' (essai)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" onClick={() => void handleChangePlan()} disabled={!selectedPlanId}>
              Appliquer
            </Button>
          </CardContent>
        </Card>
      )}

      <SubscriptionMetricsPanel
        totalRevenue={totalRevenue}
        activeSubscriptions={activeSubscriptions}
        trialSubscriptions={trialSubscriptions}
        cancelledSubscriptions={cancelledSubscriptions}
        totalUsers={totalUsers}
        conversionRate={conversionRate}
        revenueData={revenueData}
        planDistribution={planDistribution}
      />

      {/* Tableau des abonnements */}
      <Card id="subscription-list">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            Liste des Abonnements
            {dunningFocus ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (filtre dunning)
              </span>
            ) : null}
          </CardTitle>
          {dunningFocus ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setDunningFocus(null)}>
              Afficher tous
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={
              dunningFocus
                ? (() => {
                    const alert = subscriptionAlerts.find((a) => a.type === dunningFocus);
                    const ids = new Set((alert?.items || []).map((i) => i.id));
                    return subscriptions.filter((s) => ids.has(s.id));
                  })()
                : subscriptions
            }
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Alertes abonnements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Dunning / alertes abonnements
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Essais qui se terminent, expirations — cliquez pour filtrer la liste.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {subscriptionAlerts.length > 0 ? (
              subscriptionAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="space-y-2 rounded-lg bg-orange-50 p-3 dark:bg-orange-950"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">{alert.message}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDunningFocus(alert.type);
                        document
                          .getElementById('subscription-list')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      {alert.actionLabel}
                    </Button>
                  </div>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {(alert.items || []).slice(0, 15).map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {item.profile?.firstName} {item.profile?.lastName} · {item.profile?.email}
                          {item.expiresAt
                            ? ` · expire ${new Date(item.expiresAt).toLocaleDateString('fr-FR')}`
                            : ''}
                          {item.trialEndsAt
                            ? ` · essai → ${new Date(item.trialEndsAt).toLocaleDateString('fr-FR')}`
                            : ''}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => {
                            void apiClient
                              .post(`/subscriptions/${item.id}/admin/dunning-nudge`, {})
                              .then(() =>
                                toast({
                                  title: 'Relance enregistrée',
                                  description: 'Notification + audit dunning.',
                                })
                              )
                              .catch((e) =>
                                toast({
                                  title: 'Relance impossible',
                                  description: e instanceof ApiError ? e.message : 'Erreur',
                                  variant: 'destructive',
                                })
                              );
                          }}
                        >
                          Relancer
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span>Aucune alerte d'abonnement active</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionManager;