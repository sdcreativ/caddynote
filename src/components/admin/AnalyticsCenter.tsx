import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  Download,
  Info,
  MessageSquare,
  FileText,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { useAdvancedAnalytics } from "@/hooks/useAdvancedAnalytics";
import AdvancedAnalyticsDashboard from "@/components/analytics/AdvancedAnalyticsDashboard";
import { fetchProductTelemetry } from '@/services/strkOpsService';
import { trackProductEvent } from '@/lib/productTelemetry';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * RPT-003 : pas de télémétrie inventée. L’onglet Activité expose des signaux
 * métier réels (messages, documents, tendances hebdo). Onglet Produit =
 * agrégats `product.*` réellement enregistrés.
 */
const NotConnected = ({ reason }: { reason: string }) => (
  <Card>
    <CardContent className="p-6 flex items-start gap-3 text-muted-foreground">
      <Info className="h-5 w-5 mt-0.5 shrink-0" />
      <p className="text-sm">{reason}</p>
    </CardContent>
  </Card>
);

const AnalyticsCenter = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [productDays, setProductDays] = useState(30);
  const [productLoading, setProductLoading] = useState(false);
  const [productTelemetry, setProductTelemetry] = useState<{
    totalEvents: number;
    features: Array<{ feature: string; count: number }>;
  } | null>(null);
  const {
    metrics,
    institutionRanking,
    insights,
    exportAnalyticsReport,
    periodDays,
    refreshData,
    loading,
  } = useAdvancedAnalytics(selectedPeriod);

  const periodLabel = `${periodDays} derniers jours`;

  useEffect(() => {
    trackProductEvent('analytics_center', 'Ouverture analytics');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProductLoading(true);
    void fetchProductTelemetry(productDays)
      .then((data) => {
        if (!cancelled) {
          setProductTelemetry({
            totalEvents: data.totalEvents,
            features: data.features,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setProductTelemetry(null);
      })
      .finally(() => {
        if (!cancelled) setProductLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Centre d'Analytics</h2>
        <div className="flex space-x-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as typeof selectedPeriod)}
            className="px-3 py-2 border rounded-md"
            disabled={loading}
          >
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
            <option value="90d">3 derniers mois</option>
            <option value="1y">1 an</option>
          </select>
          <Button variant="outline" onClick={() => void refreshData()} disabled={loading}>
            Actualiser
          </Button>
          <Button variant="outline" onClick={exportAnalyticsReport}>
            <Download className="h-4 w-4 mr-2" />
            Exporter rapport
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Période active : {periodDays} jours (messages, documents, nouveaux comptes, tendances).
      </p>

      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((insight, index) => (
                <div key={index} className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="behavior">Activité</TabsTrigger>
          <TabsTrigger value="product">Produit</TabsTrigger>
          <TabsTrigger value="institutions">Établissements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AdvancedAnalyticsDashboard period={selectedPeriod} embedded />
        </TabsContent>

        <TabsContent value="behavior" className="space-y-6">
          {metrics ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Messages</p>
                      <p className="text-2xl font-bold">{metrics.messagesExchanged}</p>
                      <p className="text-xs text-muted-foreground">{periodLabel}</p>
                    </div>
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Documents</p>
                      <p className="text-2xl font-bold">{metrics.documentsShared}</p>
                      <p className="text-xs text-muted-foreground">{periodLabel}</p>
                    </div>
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Nouveaux comptes</p>
                      <p className="text-2xl font-bold">{metrics.newUsersThisMonth}</p>
                      <p className="text-xs text-muted-foreground">{periodLabel}</p>
                    </div>
                    <UserPlus className="h-8 w-8 text-muted-foreground" />
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Tendances hebdomadaires</CardTitle>
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
                        <Bar dataKey="absences" fill="#ef4444" name="Absences" />
                        <Bar dataKey="retards" fill="#f59e0b" name="Retards" />
                        <Bar dataKey="signatures" fill="#22c55e" name="Signatures" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <NotConnected reason="Heures d’activité, appareils et navigateurs : télémétrie client absente — non simulée." />
            </>
          ) : (
            <NotConnected reason="Chargement des métriques d’activité…" />
          )}
        </TabsContent>

        <TabsContent value="product" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Événements `product.*` (console Super Admin, KPIs, etc.) — pas de données inventées.
            </p>
            <select
              value={productDays}
              onChange={(e) => setProductDays(Number(e.target.value))}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
              <option value={90}>90 jours</option>
            </select>
          </div>
          {productLoading ? (
            <NotConnected reason="Chargement de la télémétrie produit…" />
          ) : productTelemetry ? (
            <>
              <Card>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Événements produit</p>
                    <p className="text-2xl font-bold">{productTelemetry.totalEvents}</p>
                    <p className="text-xs text-muted-foreground">{productDays} derniers jours</p>
                  </div>
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </CardContent>
              </Card>
              {productTelemetry.features.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Features utilisées</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={productTelemetry.features.slice(0, 15)}
                          layout="vertical"
                          margin={{ left: 24, right: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="feature" width={140} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#0ea5e9" name="Événements" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <NotConnected reason="Aucun événement product.* sur la période — ouverture des sections Super Admin en générera." />
              )}
            </>
          ) : (
            <NotConnected reason="Télémétrie produit indisponible (droits admin ou API)." />
          )}
        </TabsContent>

        <TabsContent value="institutions" className="space-y-6">
          {institutionRanking ? (
            <Card>
              <CardHeader>
                <CardTitle>Classement des Établissements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {institutionRanking.map((institution, index) => (
                    <div
                      key={institution.institutionId}
                      className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{institution.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {institution.totalUsers} utilisateur{institution.totalUsers > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-medium">
                        {institution.attendanceRate !== null
                          ? `${institution.attendanceRate}% d'assiduité`
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <NotConnected reason="Réservé à l'administrateur global." />
          )}
          <p className="text-xs text-muted-foreground">
            Aucune répartition géographique : ce produit n'associe pas de région à un établissement.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsCenter;
