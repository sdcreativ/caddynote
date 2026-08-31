import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useInstitutionStats } from "@/hooks/useInstitutionStats";
import { useStrkInstitutions } from "@/hooks/useStrkInstitutions";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { fetchDiagnostics } from "@/services/strkOpsService";
import {
  Users,
  Building2,
  Activity,
  Shield,
  TrendingUp,
  Clock,
  Headphones,
  CreditCard,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MobileCompactStat } from "@/components/dashboard/MobileActionPrimitives";

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
  '#06b6d4',
];

/**
 * Accueil console ops plateforme — métriques & raccourcis CaddyNote.
 * Pas de parcours métier école (élèves / classes / exercices / espace établissement).
 */
const SuperAdminOverview = () => {
  const { t } = useTranslation('superAdmin');
  const navigate = useNavigate();
  // RPT-001 : filtre établissement (desktop) pour scopper les métriques utilisateurs.
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const { metrics, loading: metricsLoading } = useSystemMetrics(institutionId);
  const { stats, loading: statsLoading } = useInstitutionStats();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const [systemOk, setSystemOk] = useState<boolean | null>(null);
  const [systemDetail, setSystemDetail] = useState('Vérification…');

  useEffect(() => {
    loadInstitutions();
  }, [loadInstitutions]);

  useEffect(() => {
    void (async () => {
      try {
        const diag = await fetchDiagnostics();
        const dbOk = diag.database === 'up' || diag.database === 'connected';
        const ok = (diag.status === 'ok' || dbOk) && dbOk;
        setSystemOk(ok);
        setSystemDetail(
          ok
            ? `Diagnostics OK — ${new Date(diag.timestamp).toLocaleString('fr-FR')}`
            : `Dégradé — DB ${diag.database} / status ${diag.status}`
        );
      } catch {
        setSystemOk(false);
        setSystemDetail('Diagnostics indisponibles');
      }
    })();
  }, []);

  const loading = metricsLoading || statsLoading;

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin global',
    school_admin: 'Admin école',
    teacher: 'Enseignant',
    head_teacher: 'Prof. principal',
    student: 'Étudiant',
    parent: 'Parent',
    secretary: 'Secrétaire',
    accountant: 'Comptable',
    supervisor: 'Vie scolaire',
    group_owner: 'Groupe',
  };

  const userRoleData = Object.entries(metrics.usersByRole)
    .filter(([, count]) => count > 0)
    .reduce<{ name: string; value: number; role: string }[]>((acc, [role, count]) => {
      const name = ROLE_LABELS[role] ?? role;
      const existing = acc.find((e) => e.name === name);
      if (existing) existing.value += count;
      else acc.push({ name, value: count, role });
      return acc;
    }, []);

  const INSTITUTION_TYPE_LABELS: Record<string, string> = {
    high_school: 'Lycée',
    middle_school: 'Collège',
    school: 'École',
    university: 'Université',
    private_school: 'École privée',
    training_center: 'Centre de formation',
  };

  const institutionTypeData = Object.entries(stats.institutionTypes).map(([type, count]) => ({
    name: INSTITUTION_TYPE_LABELS[type] ?? type,
    value: count,
  }));

  const systemStatusLabel =
    systemOk === null
      ? t('overview.systemChecking')
      : systemOk
        ? t('overview.systemOk')
        : t('overview.systemDegraded');

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="mb-2 h-8 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mobile : pulse plateforme uniquement */}
      <div className="space-y-4 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{t('overview.titleShort')}</h2>
          <div className="flex shrink-0 items-center gap-1.5" title={systemDetail}>
            <div
              className={`h-2 w-2 rounded-full ${
                systemOk === null
                  ? 'bg-slate-300'
                  : systemOk
                    ? 'bg-success animate-pulse'
                    : 'bg-destructive'
              }`}
            />
            <span className="text-xs font-medium text-slate-600">{systemStatusLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MobileCompactStat
            title={t('overview.kpiUsers')}
            value={metrics.totalUsers.toLocaleString()}
            tone="blue"
            hint={`${metrics.activeUsers} actifs`}
            onClick={() => navigate('/super-admin/users')}
          />
          <MobileCompactStat
            title={t('overview.kpiSchools')}
            value={stats.totalInstitutions.toLocaleString()}
            tone="emerald"
            onClick={() => navigate('/super-admin/institutions')}
          />
          <MobileCompactStat
            title={t('overview.kpiNew')}
            value={String(metrics.newUsersLast30Days)}
            tone="amber"
            hint="30 jours"
          />
          <MobileCompactStat
            title={t('overview.kpiPlatformAdmins')}
            value={String(metrics.usersByRole.admin ?? 0)}
            tone="violet"
            onClick={() => navigate('/super-admin/users')}
          />
        </div>
      </div>

      {/* Desktop : contexte ops (sans CTA école — déjà dans la sidebar) */}
      <div className="hidden rounded-xl border border-border bg-muted/40 px-4 py-3 md:block">
        <p className="text-[11px] font-medium text-muted-foreground">{t('hereLabel')}</p>
        <p className="text-sm font-semibold">{t('console')}</p>
        <p className="text-sm text-muted-foreground">{t('consoleHint')}</p>
      </div>

      <div className="hidden space-y-2 md:block">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('overview.quickActions')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link to="/super-admin/institutions">
              <Building2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('items.institutions')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/super-admin/subscriptions">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('items.subscriptions')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/super-admin/support-ops">
              <Headphones className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('items.supportOps')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/super-admin/observability">
              <Activity className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('items.observability')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="hidden items-center justify-between md:flex">
        <div>
          <h2 className="text-2xl font-bold">{t('overview.title')}</h2>
          <p className="text-muted-foreground">{t('overview.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-1" title={systemDetail}>
          <div
            className={`h-2 w-2 rounded-full ${
              systemOk === null
                ? 'bg-slate-300'
                : systemOk
                  ? 'bg-success animate-pulse'
                  : 'bg-destructive'
            }`}
          />
          <span className="text-sm text-muted-foreground">{systemStatusLabel}</span>
        </div>
      </div>

      <div className="hidden w-full max-w-xs md:block">
        <ReportFilters
          value={{ institutionId }}
          onChange={(next) => setInstitutionId(next.institutionId)}
          show={{ institution: true }}
          institutions={institutions.map((inst) => ({ id: inst.id, name: inst.name }))}
        />
      </div>

      <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Users className="mr-2 h-4 w-4" />
              {t('overview.kpiUsers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalUsers.toLocaleString()}</div>
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <TrendingUp className="mr-1 h-3 w-3" />
              {metrics.activeUsers} actifs
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-success">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Building2 className="mr-2 h-4 w-4" />
              {t('items.institutions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInstitutions.toLocaleString()}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('overview.kpiSchoolsHint')}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Activity className="mr-2 h-4 w-4" />
              {t('overview.kpiNew')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.newUsersLast30Days}</div>
            <div className="mt-1 text-xs text-muted-foreground">30 jours</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-info">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Shield className="mr-2 h-4 w-4" />
              {t('overview.kpiPlatformAdmins')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.usersByRole.admin ?? 0}</div>
            <div className="mt-1 text-xs text-muted-foreground">{t('overview.kpiPlatformAdminsHint')}</div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden grid-cols-1 gap-6 md:grid lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('overview.chartRoles')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userRoleData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {userRoleData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('overview.chartSchoolTypes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={institutionTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-base md:text-lg">
            <Clock className="mr-2 h-4 w-4" />
            {t('overview.recentActivity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.recentActivities.length > 0 ? (
              metrics.recentActivities.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">
                        {activity.description || activity.type}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {activity.actor
                          ? `${activity.actor.firstName ?? ''} ${activity.actor.lastName ?? ''}`.trim()
                          : 'Système'}
                        {activity.institution?.name ? ` · ${activity.institution.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {activity.createdAt
                      ? new Date(activity.createdAt).toLocaleDateString('fr-FR')
                      : ''}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                <Activity className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>{t('overview.recentActivityEmpty')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminOverview;
