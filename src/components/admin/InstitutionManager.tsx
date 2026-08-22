import { useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import DataTable from "@/components/common/DataTable";
import {
  Plus,
  Search,
  FileDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Users,
  BarChart3,
  Settings2,
  Snowflake,
  Sun,
  Activity,
} from "lucide-react";
import { apiClient, ApiError } from '@/lib/apiClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStrkInstitutions } from "@/hooks/useStrkInstitutions";
import CreateInstitutionDialog from "@/components/admin/CreateInstitutionDialog";
import EditInstitutionDialog from "@/components/admin/EditInstitutionDialog";
import { QuotasAndFlagsPanel } from "@/components/admin/QuotasAndFlagsPanel";
import TenantHealthDialog from "@/components/admin/TenantHealthDialog";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Institution } from "@/types/strk";
import { OPS_FROZEN_FLAG } from "@/components/admin/tenantHealthFlags";
import { StrkAnalyticsService, type DashboardMetrics, type InstitutionRankingEntry } from "@/services/strkAnalyticsService";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const TYPE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

const InstitutionManager = () => {
  const { t } = useTranslation('institutions');
  const { t: tc } = useTranslation('common');
  const confirm = useConfirmDialog();
  const { institutions, isLoading, removeInstitution, editInstitution, loadInstitutions } = useStrkInstitutions();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showQuotasDialog, setShowQuotasDialog] = useState(false);
  const [healthInstitutionId, setHealthInstitutionId] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [ranking, setRanking] = useState<InstitutionRankingEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dash = await StrkAnalyticsService.getDashboardMetrics();
        if (!cancelled) setMetrics(dash);
      } catch {
        if (!cancelled) setMetrics(null);
      }
      try {
        const rank = await StrkAnalyticsService.getInstitutionRanking();
        if (!cancelled) setRanking(rank.ranking);
      } catch {
        if (!cancelled) setRanking([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rankingById = Object.fromEntries(ranking.map((entry) => [entry.institutionId, entry]));

  const isFrozen = (item: Institution) => item.featureOverrides?.[OPS_FROZEN_FLAG] === true;

  const handleFreeze = async (item: Institution, freeze: boolean) => {
    try {
      await apiClient.post(`/institutions/${item.id}/${freeze ? 'freeze' : 'unfreeze'}`, {});
      toast({
        title: freeze ? 'Établissement gelé' : 'Établissement dégelé',
        description: freeze
          ? 'Écritures bloquées (lecture seule) pour ce tenant.'
          : 'Écritures rétablies.',
      });
      await loadInstitutions();
    } catch (e) {
      toast({
        title: 'Action impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  const institutionTypes = [
    { value: 'all', label: t('manager.allTypes') },
    { value: 'school', label: t('types.school') },
    { value: 'middle_school', label: t('types.middle_school') },
    { value: 'high_school', label: t('types.high_school') },
    { value: 'university', label: t('types.university') },
    { value: 'training_center', label: t('manager.trainingCenter') }
  ];

  const filteredInstitutions = institutions.filter(institution => {
    const matchesSearch = institution.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         institution.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'all' || institution.type === selectedType;
    return matchesSearch && matchesType;
  });

  const typeDistribution = institutionTypes
    .filter(type => type.value !== 'all')
    .map((type, index) => ({
      name: type.label,
      value: institutions.filter(inst => inst.type === type.value).length,
      color: TYPE_COLORS[index % TYPE_COLORS.length]
    }))
    .filter(entry => entry.value > 0);

  const rankingChart = ranking.slice(0, 8).map((entry) => ({
    name: entry.name.length > 16 ? `${entry.name.slice(0, 14)}…` : entry.name,
    utilisateurs: entry.totalUsers,
  }));

  const handleExportData = () => {
    if (filteredInstitutions.length === 0) {
      toast({
        title: t('manager.exportNoneTitle'),
        description: t('manager.exportNoneBody'),
        variant: "destructive",
      });
      return;
    }

    const csvData = filteredInstitutions.map(inst => ({
      [t('manager.csv.name')]: inst.name,
      [t('manager.csv.type')]: inst.type,
      [t('manager.csv.email')]: inst.email,
      [t('manager.csv.phone')]: inst.phone,
      [t('manager.csv.address')]: inst.address
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'institutions.csv';
    a.click();
    window.URL.revokeObjectURL(url);

      toast({
        title: t('manager.exportDoneTitle'),
        description: t('manager.exportDoneBody')
      });
  };

  const handleDeleteInstitution = async (id: string) => {
    const ok = await confirm({
      title: tc('actions.confirm'),
      description: t('manager.deleteConfirm'),
      variant: 'destructive',
      confirmLabel: tc('actions.delete'),
    });
    if (ok) {
      await removeInstitution(id);
    }
  };

  const columns: { key: string; label: string; render?: (value: unknown, item: (typeof filteredInstitutions)[number]) => ReactNode }[] = [
    {
      key: "name",
      label: t('columns.name'),
      render: (_value, item) => (
        <div className="font-medium">{item.name}</div>
      ),
    },
    {
      key: "type",
      label: t('columns.type'),
      render: (_value, item) => {
        const type = institutionTypes.find(t => t.value === item.type);
        return <Badge variant="outline">{type?.label || item.type}</Badge>;
      },
    },
    {
      key: "email",
      label: t('columns.email'),
    },
    {
      key: "phone",
      label: t('columns.phone'),
    },
    {
      key: "analytics",
      label: t('columns.headcount'),
      render: (_value, item) => {
        const entry = rankingById[item.id];
        if (!entry) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex space-x-2 text-sm">
            <Badge variant="secondary">
              <Users className="h-3 w-3 mr-1" />
              {entry.totalUsers}
            </Badge>
            <Badge variant="secondary">
              <BarChart3 className="h-3 w-3 mr-1" />
              {entry.attendanceRate == null ? '—' : `${Math.round(entry.attendanceRate)} %`}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "actions",
      label: t('columns.actions'),
      render: (_value, item) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('columns.actions')}</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedInstitution(item);
                  setShowEditDialog(true);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                {tc('actions.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHealthInstitutionId(item.id)}>
                <Activity className="mr-2 h-4 w-4" />
                Fiche santé
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedInstitution(item);
                  setShowQuotasDialog(true);
                }}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Quotas & flags
              </DropdownMenuItem>
              {isFrozen(item) ? (
                <DropdownMenuItem onClick={() => void handleFreeze(item, false)}>
                  <Sun className="mr-2 h-4 w-4" />
                  Dégeler (ops)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void handleFreeze(item, true)}>
                  <Snowflake className="mr-2 h-4 w-4" />
                  Geler (lecture seule)
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => handleDeleteInstitution(item.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {tc('actions.delete')}
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
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleExportData}>
            <FileDown className="h-4 w-4 mr-2" />
            {tc('actions.export')}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('manager.newInstitution')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('manager.totalInstitutions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{institutions.length}</div>
            <p className="text-xs text-muted-foreground">{t('manager.totalInstitutionsHint')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('manager.totalUsers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics ? metrics.totalUsers : '—'}</div>
            <p className="text-xs text-muted-foreground">
              {metrics ? t('manager.usersBreakdown', { students: metrics.students, teachers: metrics.teachers }) : t('manager.loading')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('manager.attendance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.attendanceRate == null ? '—' : `${Math.round(metrics.attendanceRate)} %`}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.attendanceRate == null ? t('manager.noAttendance') : t('manager.attendanceHint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('manager.typeDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {typeDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">{t('manager.noInstitutionsChart')}</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('manager.headcountByInstitution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {rankingChart.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6">
                  {t('manager.rankingUnavailable')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rankingChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="utilisateurs" fill="#3b82f6" name={t('manager.usersSeries')} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('manager.listTitle')}</CardTitle>
          <div className="flex space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              {institutionTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns as any}
            data={filteredInstitutions}
            loading={isLoading}
          />
        </CardContent>
      </Card>

      <CreateInstitutionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onInstitutionCreated={() => void loadInstitutions()}
      />

      <EditInstitutionDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        institution={selectedInstitution}
        onSave={editInstitution}
      />

      <Dialog open={showQuotasDialog} onOpenChange={setShowQuotasDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Quotas & flags — {selectedInstitution?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedInstitution ? (
            <QuotasAndFlagsPanel institutionId={selectedInstitution.id} />
          ) : null}
        </DialogContent>
      </Dialog>

      <TenantHealthDialog
        institutionId={healthInstitutionId}
        open={!!healthInstitutionId}
        onOpenChange={(open) => {
          if (!open) setHealthInstitutionId(null);
        }}
      />
    </div>
  );
};

export default InstitutionManager;
