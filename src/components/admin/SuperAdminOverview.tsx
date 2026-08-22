import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { useInstitutionStats } from "@/hooks/useInstitutionStats";
import { useStrkInstitutions } from "@/hooks/useStrkInstitutions";
import { useExercises } from "@/hooks/useExercises";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { fetchDiagnostics } from "@/services/strkOpsService";
import {
  Users,
  Building2,
  Activity,
  Shield,
  TrendingUp,
  Clock,
  Database,
  Server,
  BookOpen,
  Briefcase,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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

const SuperAdminOverview = () => {
  // RPT-001 : filtre établissement sur la vue de supervision /super-admin.
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const { metrics, loading: metricsLoading } = useSystemMetrics(institutionId);
  // Comparaison inter-établissements par nature : ne se filtre pas par
  // établissement (filtrer à un seul établissement viderait le sens de
  // "types d'établissements" et "top établissements par utilisateurs").
  const { stats, loading: statsLoading } = useInstitutionStats();
  const { institutions, loadInstitutions } = useStrkInstitutions();
  const { exercises } = useExercises();
  const scopedExercises = institutionId
    ? exercises.filter((ex) => ex.institution_id === institutionId)
    : exercises;
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

  // Agrégation par libellé affiché (évite plusieurs tranches « Admin » pour
  // secretary / accountant / parent / etc. qui tombaient dans le même fallback).
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
    value: count
  }));

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Console plateforme</p>
          <p className="text-sm text-muted-foreground">
            Supervision technique : métriques, logs, alertes et utilisateurs globaux.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link to="/dashboard">
            <Briefcase className="mr-2 h-4 w-4" aria-hidden />
            Pilotage métier
          </Link>
        </Button>
      </div>

      {/* System Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Vue d'ensemble du système</h2>
          <p className="text-muted-foreground">Dernières métriques plateforme (rafraîchissement manuel)</p>
        </div>
        <div className="flex items-center space-x-2">
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
            <span className="text-sm text-muted-foreground">
              {systemOk === null
                ? 'Vérification…'
                : systemOk
                  ? 'Système opérationnel'
                  : 'Système dégradé'}
            </span>
          </div>
        </div>
      </div>

      {/* RPT-001 : filtre par établissement — scope les métriques ci-dessous
          (utilisateurs, alertes, activité récente) à un seul établissement. */}
      <div className="w-full max-w-xs">
        <ReportFilters
          value={{ institutionId }}
          onChange={(next) => setInstitutionId(next.institutionId)}
          show={{ institution: true }}
          institutions={institutions.map((inst) => ({ id: inst.id, name: inst.name }))}
        />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4 mr-2" />
              Utilisateurs Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalUsers.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              {metrics.activeUsers} actifs
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-success">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4 mr-2" />
              Établissements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalInstitutions.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Institutions actives
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4 mr-2" />
              Nouveaux Comptes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.newUsersLast30Days}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Derniers 30 jours
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <BookOpen className="h-4 w-4 mr-2" />
              Exercices Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scopedExercises.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {scopedExercises.filter((ex) => ex.is_published).length} publiés
              {institutionId ? ' · filtre établissement' : ''}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-info">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium text-muted-foreground">
              <Shield className="h-4 w-4 mr-2" />
              Comptes Administrateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.usersByRole.admin ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Accès global à la plateforme
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Répartition des utilisateurs</CardTitle>
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
                    {userRoleData.map((entry, index) => (
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
            <CardTitle>Types d'établissements</CardTitle>
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

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-4 w-4 mr-2" />
            Activité récente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.recentActivities.length > 0 ? (
              // RPT-003 : bug réel trouvé au passage — cette carte référençait
              // des champs Supabase (`activity_type`, `strk_profiles`,
              // `created_at`) disparus depuis la migration Express/Prisma ;
              // chaque entrée s'affichait vide/« Invalid Date » malgré des
              // activités réellement journalisées. `type`/`description`/
              // `createdAt` sont les champs réels ; `actor` est une jointure
              // manuelle ajoutée côté serveur (userId n'a pas de relation
              // Prisma déclarée vers le profil).
              metrics.recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium">{activity.description || activity.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.actor ? `${activity.actor.firstName ?? ''} ${activity.actor.lastName ?? ''}`.trim() : 'Système'}
                        {activity.institution?.name ? ` · ${activity.institution.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activity.createdAt ? new Date(activity.createdAt).toLocaleDateString('fr-FR') : ''}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Aucune activité récente</p>
                <p className="mt-1 text-xs">
                  Les connexions et actions métier apparaîtront ici dès qu’elles seront journalisées.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminOverview;