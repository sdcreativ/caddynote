import { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { StrkAnalyticsService, type DashboardMetrics, type AcademicMetrics } from '@/services/strkAnalyticsService';
import { listGroups, getGroupDashboard, fetchBillingMetrics, type InstitutionGroup } from '@/services/strkOpsService';
import { useStrkInstitutions } from '@/hooks/useStrkInstitutions';
import InstitutionGroupsPanel from '@/components/admin/InstitutionGroupsPanel';
import { trackProductEvent } from '@/lib/productTelemetry';

const ALL = '__all__';

/** KPIs réels (analytics + groupes) — sélecteur multi-groupes / établissement. */
const BusinessKPIDashboard = () => {
  const { toast } = useToast();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [academic, setAcademic] = useState<AcademicMetrics | null>(null);
  const [groups, setGroups] = useState<InstitutionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(ALL);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>(ALL);
  const [groupTotals, setGroupTotals] = useState<{
    students: number;
    teachers: number;
    classes: number;
  } | null>(null);
  const [groupInstitutions, setGroupInstitutions] = useState<
    Array<{ id: string; name: string; students: number; teachers: number; classes: number }>
  >([]);
  const [billing, setBilling] = useState<{
    mrr: number;
    arr: number;
    churnRate30d: number;
    activeSubscriptions: number;
    cancelledSubscriptions30d: number;
    stripeLinkedCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadInstitutions();
    trackProductEvent('business_kpis', 'Ouverture KPIs business');
  }, [loadInstitutions]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const institutionId =
        selectedInstitutionId !== ALL ? selectedInstitutionId : undefined;
      const [m, a, g, bill] = await Promise.all([
        StrkAnalyticsService.getDashboardMetrics(institutionId),
        StrkAnalyticsService.getAcademicMetrics(institutionId),
        listGroups().catch(() => [] as InstitutionGroup[]),
        fetchBillingMetrics().catch(() => null),
      ]);
      setMetrics(m);
      setAcademic(a);
      setGroups(g);
      setBilling(bill);

      if (selectedGroupId !== ALL) {
        const dash = await getGroupDashboard(selectedGroupId).catch(() => null);
        setGroupTotals(dash?.totals ?? null);
        setGroupInstitutions(dash?.institutions ?? []);
      } else {
        setGroupTotals(null);
        setGroupInstitutions([]);
      }
    } catch {
      toast({ title: 'Impossible de charger les KPIs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedInstitutionId, selectedGroupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: 'Établissements', value: metrics?.totalInstitutions ?? '—' },
    { label: 'Utilisateurs', value: metrics?.totalUsers ?? '—' },
    { label: 'Élèves', value: metrics?.students ?? '—' },
    { label: 'Enseignants', value: metrics?.teachers ?? '—' },
    {
      label: 'Présence',
      value: metrics?.attendanceRate == null ? '—' : `${metrics.attendanceRate.toFixed(1)} %`,
    },
    { label: 'Absences (période)', value: metrics?.absences ?? '—' },
    {
      label: 'Moyenne générale',
      value: academic?.averageGrade == null ? '—' : academic.averageGrade.toFixed(2),
    },
    {
      label: 'Devoirs rendus',
      value:
        academic?.assignmentCompletionRate == null
          ? '—'
          : `${(academic.assignmentCompletionRate * 100).toFixed(0)} %`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <BarChart3 className="h-6 w-6" /> KPIs plateforme
          </h2>
          <p className="text-sm text-muted-foreground">
            Données /analytics — générées{' '}
            {metrics?.generatedAt ? new Date(metrics.generatedAt).toLocaleString('fr-FR') : '…'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Périmètre</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Établissement</Label>
            <Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
              <SelectTrigger>
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les établissements</SelectItem>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Groupe multi-établissements</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Aucun (vue plateforme)</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {billing ? `${billing.mrr.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Somme plans active/trial</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ARR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {billing ? `${billing.arr.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Churn 30j</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {billing ? `${(billing.churnRate30d * 100).toFixed(1)} %` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {billing?.cancelledSubscriptions30d ?? 0} annulation(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Abo liés Stripe</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{billing?.stripeLinkedCount ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              sur {billing?.activeSubscriptions ?? '—'} actifs/essais
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effectifs du groupe sélectionné</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {groups.length === 0 ? (
            <p>Aucun groupe (ORG-002) — créez-en un ci-dessous.</p>
          ) : selectedGroupId === ALL ? (
            <p>{groups.length} groupe(s) — sélectionnez-en un pour les effectifs consolidés.</p>
          ) : (
            <>
              {groupTotals && (
                <p>
                  Effectifs consolidés : {groupTotals.students} élèves · {groupTotals.teachers}{' '}
                  enseignants · {groupTotals.classes} classes
                </p>
              )}
              {groupInstitutions.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {groupInstitutions.map((inst) => (
                    <li key={inst.id} className="flex justify-between gap-2 border-b py-1">
                      <span className="font-medium text-foreground">{inst.name}</span>
                      <span>
                        {inst.students} él. · {inst.teachers} ens. · {inst.classes} cl.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InstitutionGroupsPanel />
    </div>
  );
};

export default BusinessKPIDashboard;
