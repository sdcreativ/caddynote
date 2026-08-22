import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAdvancedAnalytics } from '@/hooks/useAdvancedAnalytics';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  Users,
  MessageSquare,
  FileText,
  Download,
  RefreshCw,
  Target,
  Info,
} from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const AdvancedAnalyticsDashboard: React.FC<{
  period?: '7d' | '30d' | '90d' | '1y';
  /** Masque le header redondant quand embarqué dans AnalyticsCenter */
  embedded?: boolean;
}> = ({ period = '30d', embedded = false }) => {
  const { metrics, institutionRanking, loading, insights, refreshData, exportAnalyticsReport, periodDays } =
    useAdvancedAnalytics(period);

  const [selectedTab, setSelectedTab] = useState('overview');

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!metrics) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Aucune donnée d'analytics disponible</p>
        </CardContent>
      </Card>
    );
  }

  const colors = { primary: '#3b82f6', secondary: '#ef4444', success: '#22c55e', warning: '#f59e0b', info: '#8b5cf6' };
  const periodLabel = `${periodDays} derniers jours`;

  // RPT-003 : ce bandeau est réutilisé sur les onglets sans donnée réelle
  // (télémétrie appareils / APM) — voir useAdvancedAnalytics.tsx.
  const NotConnected = ({ reason }: { reason: string }) => (
    <Card>
      <CardContent className="p-6 flex items-start gap-3 text-muted-foreground">
        <Info className="h-5 w-5 mt-0.5 shrink-0" />
        <p className="text-sm">{reason}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics Avancées</h1>
            <p className="text-muted-foreground">Analyse détaillée des performances et de l'engagement</p>
            <p className="text-xs text-muted-foreground mt-1">
              Dernière mise à jour : {new Date(metrics.generatedAt).toLocaleString('fr-FR')} · période{' '}
              {periodLabel}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button onClick={exportAnalyticsReport}>
              <Download className="mr-2 h-4 w-4" />
              Exporter
            </Button>
          </div>
        </div>
      )}

      {!embedded && insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Target className="mr-2 h-5 w-5" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.map((insight, index) => (
                <div key={index} className="flex items-center p-3 bg-secondary/10 rounded-lg">
                  <span className="text-sm">{insight}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs principaux — tous réels (voir useAdvancedAnalytics.tsx) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Utilisateurs Actifs</p>
                <p className="text-2xl font-bold">{metrics.activeUsers.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  sur {metrics.totalUsers.toLocaleString()} au total
                </p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Nouveaux Comptes</p>
                <p className="text-2xl font-bold">{metrics.newUsersThisMonth}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Messages Échangés</p>
                <p className="text-2xl font-bold">{metrics.messagesExchanged}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-info" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Documents Générés</p>
                <p className="text-2xl font-bold">{metrics.documentsShared}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              <FileText className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs principales */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="behavior">Activité</TabsTrigger>
          <TabsTrigger value="performance">Absences</TabsTrigger>
          <TabsTrigger value="institutions">Institutions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tendances hebdomadaires */}
            <Card>
              <CardHeader>
                <CardTitle>Tendances Hebdomadaires</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics.weeklyTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="absences" stackId="1" stroke={colors.secondary} fill={colors.secondary} fillOpacity={0.6} name="Absences" />
                      <Area type="monotone" dataKey="retards" stackId="1" stroke={colors.warning} fill={colors.warning} fillOpacity={0.6} name="Retards" />
                      <Area type="monotone" dataKey="signatures" stackId="2" stroke={colors.success} fill={colors.success} fillOpacity={0.6} name="Signatures" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Tendances mensuelles */}
            <Card>
              <CardHeader>
                <CardTitle>Évolution Mensuelle</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={metrics.monthlyTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="inscriptions" stroke={colors.primary} strokeWidth={3} name="Inscriptions" />
                      <Line type="monotone" dataKey="absences" stroke={colors.secondary} strokeWidth={2} name="Absences" />
                      <Line type="monotone" dataKey="signatures" stroke={colors.success} strokeWidth={2} name="Signatures" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Métriques académiques */}
          <Card>
            <CardHeader>
              <CardTitle>Métriques Académiques</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {metrics.averageGrade !== null ? `${metrics.averageGrade}/20` : '—'}
                  </div>
                  <p className="text-sm text-muted-foreground">Moyenne Générale (notes publiées)</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-success">
                    {metrics.attendanceRate !== null ? `${metrics.attendanceRate}%` : '—'}
                  </div>
                  <p className="text-sm text-muted-foreground">Taux d'Assiduité (aujourd'hui)</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-warning">
                    {metrics.assignmentCompletionRate !== null
                      ? `${(metrics.assignmentCompletionRate * 100).toFixed(1)}%`
                      : '—'}
                  </div>
                  <p className="text-sm text-muted-foreground">Devoirs Rendus</p>
                </div>
              </div>
              {(metrics.averageGrade === null || metrics.assignmentCompletionRate === null) && (
                <p className="text-xs text-muted-foreground mt-4">
                  « — » : pas encore de donnée réelle sur ce périmètre (aucune note publiée / aucun devoir attendu).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metrics.messagesExchanged}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metrics.documentsShared}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Nouveaux comptes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{metrics.newUsersThisMonth}</p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Activité hebdomadaire (absences / retards / signatures)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.weeklyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="absences" fill={colors.secondary} name="Absences" />
                    <Bar dataKey="retards" fill={colors.warning} name="Retards" />
                    <Bar dataKey="signatures" fill={colors.success} name="Signatures" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <NotConnected reason="Heures d’activité, appareils et navigateurs : télémétrie client absente — non simulée." />
        </TabsContent>

        <TabsContent value="performance" className="space-y-6">
          <NotConnected reason="Uptime / latence / 5xx : voir Observabilité (diagnostics API). Ici : absences et retards réels." />
          <Card>
            <CardHeader>
              <CardTitle>Absences et Retards Hebdomadaires</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.weeklyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="absences" stroke={colors.secondary} strokeWidth={3} name="Absences" />
                    <Line type="monotone" dataKey="retards" stroke={colors.warning} strokeWidth={3} name="Retards" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="institutions" className="space-y-6">
          {institutionRanking ? (
            <Card>
              <CardHeader>
                <CardTitle>Classement par Assiduité</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {institutionRanking.map((institution, index) => (
                    <div key={institution.institutionId} className="flex items-center gap-4 p-3 bg-secondary/5 rounded-lg">
                      <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{institution.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {institution.totalUsers} utilisateur{institution.totalUsers > 1 ? 's' : ''}
                        </div>
                      </div>
                      <span className="text-sm font-medium">
                        {institution.attendanceRate !== null ? `${institution.attendanceRate}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <NotConnected reason="Réservé à l'administrateur global." />
          )}
          <NotConnected reason="Scores de satisfaction : nécessite une enquête de satisfaction qui n'existe pas dans ce produit. Non affiché plutôt que simulé." />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedAnalyticsDashboard;
