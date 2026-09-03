import { CreditCard, DollarSign, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type RevenuePoint = { month: string; revenue: number; subscriptions: number };
type PlanSlice = { name: string; value: number; color: string };

type SubscriptionMetricsPanelProps = {
  totalRevenue: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  cancelledSubscriptions: number;
  totalUsers: number;
  conversionRate: number;
  revenueData: RevenuePoint[];
  planDistribution: PlanSlice[];
};

/** KPI + graphiques abonnements — extrait de SubscriptionManager. */
export function SubscriptionMetricsPanel({
  totalRevenue,
  activeSubscriptions,
  trialSubscriptions,
  cancelledSubscriptions,
  totalUsers,
  conversionRate,
  revenueData,
  planDistribution,
}: SubscriptionMetricsPanelProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <DollarSign className="mr-2 h-4 w-4" />
              Revenus Mensuels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()}€</div>
            <p className="text-xs text-muted-foreground">MRR abonnements actifs / essai</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <CreditCard className="mr-2 h-4 w-4" />
              Abonnements Actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              {trialSubscriptions} en essai · {cancelledSubscriptions} annulés
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <Users className="mr-2 h-4 w-4" />
              Utilisateurs Totaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Comptes liés aux abonnements</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              <TrendingUp className="mr-2 h-4 w-4" />
              Part actifs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">Actifs / total abonnements</p>
          </CardContent>
        </Card>
      </div>

      <div id="financial-analytics" className="grid scroll-mt-6 grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Évolution des Revenus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Revenus (€)" />
                  <Line type="monotone" dataKey="subscriptions" stroke="#22c55e" name="Abonnements" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {planDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
