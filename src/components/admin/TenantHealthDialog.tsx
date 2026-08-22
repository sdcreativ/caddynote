import { useCallback, useEffect, useState } from 'react';
import { Activity, Snowflake, CreditCard, Users, Gauge } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

type QuotaRow = { key: string; current: number; limit: number | null; allowed: boolean; warning?: boolean };

type HealthPayload = {
  health: {
    score: number;
    band: string;
    factors: Array<{ key: string; label: string; impact: number; detail: string }>;
  };
  institution: {
    id: string;
    name: string;
    type: string;
    email?: string | null;
  };
  frozen: boolean;
  subscription: {
    id: string;
    status: string;
    planName: string;
    expiresAt?: string;
  } | null;
  usersActive: number;
  quotas: QuotaRow[];
  lastLogins: Array<{ email: string | null; lastLoginAt: string | null; role: string }>;
};

type TenantHealthDialogProps = {
  institutionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Fiche santé tenant unifiée (score + freeze + abo + quotas). */
const TenantHealthDialog = ({ institutionId, open, onOpenChange }: TenantHealthDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [onboarding, setOnboarding] = useState<{
    percent: number;
    steps: Array<{ id: string; label: string; done: boolean; detail?: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    if (!institutionId) return;
    setLoading(true);
    try {
      const [healthRes, onboardRes] = await Promise.all([
        apiClient.get<HealthPayload>(`/institutions/${institutionId}/health`),
        apiClient
          .get<{
            percent: number;
            steps: Array<{ id: string; label: string; done: boolean; detail?: string }>;
          }>(`/institutions/${institutionId}/onboarding`)
          .catch(() => null),
      ]);
      setData(healthRes);
      setOnboarding(onboardRes);
    } catch (e) {
      toast({
        title: 'Fiche tenant indisponible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [institutionId, toast]);

  useEffect(() => {
    if (open && institutionId) void load();
  }, [open, institutionId, load]);

  const toggleFreeze = async () => {
    if (!institutionId || !data) return;
    setBusy(true);
    try {
      await apiClient.post(`/institutions/${institutionId}/${data.frozen ? 'unfreeze' : 'freeze'}`, {});
      toast({ title: data.frozen ? 'Établissement dégelé' : 'Établissement gelé' });
      await load();
    } catch (e) {
      toast({
        title: 'Action impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const exportOffboard = async () => {
    if (!institutionId) return;
    setBusy(true);
    try {
      const bundle = await apiClient.post<Record<string, unknown>>(
        `/institutions/${institutionId}/offboard/export`,
        {}
      );
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `offboard-${institutionId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export offboarding téléchargé' });
    } catch (e) {
      toast({
        title: 'Export impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const bandVariant =
    data?.health.band === 'healthy'
      ? 'default'
      : data?.health.band === 'watch'
        ? 'secondary'
        : 'destructive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Santé établissement
          </DialogTitle>
          <DialogDescription>
            {data?.institution.name || 'Chargement…'} — score unifié, onboarding, quotas.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={bandVariant}>
                Score {data.health.score}/100 · {data.health.band}
              </Badge>
              <Badge variant={data.frozen ? 'destructive' : 'secondary'}>
                {data.frozen ? 'Gelé (lecture seule)' : 'Actif'}
              </Badge>
              <Badge variant="outline">{data.institution.type}</Badge>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void toggleFreeze()}>
                <Snowflake className="mr-1 h-3.5 w-3.5" />
                {data.frozen ? 'Dégeler' : 'Geler'}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void exportOffboard()}>
                Export offboarding
              </Button>
            </div>

            {data.health.factors.length > 0 && (
              <ul className="space-y-1 rounded-md border p-3 text-xs text-muted-foreground">
                {data.health.factors.map((f) => (
                  <li key={f.key}>
                    {f.label} ({f.impact}) — {f.detail}
                  </li>
                ))}
              </ul>
            )}

            {onboarding && (
              <div className="rounded-md border p-3">
                <p className="mb-2 font-medium">Onboarding {onboarding.percent}%</p>
                <ul className="space-y-1 text-xs">
                  {onboarding.steps.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {s.done ? '✓' : '○'} {s.label}
                      </span>
                      <span className="text-muted-foreground">{s.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border p-3">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <CreditCard className="h-4 w-4" /> Abonnement
              </p>
              {data.subscription ? (
                <p>
                  {data.subscription.planName} · <Badge variant="outline">{data.subscription.status}</Badge>
                  {data.subscription.expiresAt
                    ? ` · expire ${new Date(data.subscription.expiresAt).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              ) : (
                <p className="text-muted-foreground">Aucun abonnement rattaché.</p>
              )}
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <Gauge className="h-4 w-4" /> Quotas
              </p>
              <ul className="space-y-1 text-xs">
                {data.quotas.map((q) => (
                  <li key={q.key}>
                    {q.key}: {q.current}/{q.limit ?? '∞'}{' '}
                    {!q.allowed ? '(bloqué)' : q.warning ? '(alerte)' : ''}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-1 flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" /> Dernières connexions ({data.usersActive} actifs)
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {data.lastLogins.map((u, i) => (
                  <li key={`${u.email}-${i}`}>
                    {u.email || '—'} · {u.role}
                    {u.lastLoginAt ? ` · ${new Date(u.lastLoginAt).toLocaleString('fr-FR')}` : ' · jamais'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TenantHealthDialog;
