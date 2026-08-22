import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';

interface QuotaRow {
  type: string;
  current: number;
  limit: number | null;
  allowed: boolean;
  warning: boolean;
}

interface FeatureSnapshot {
  planFeatures: Record<string, boolean>;
  overrides: Record<string, boolean>;
  platformFlags?: Record<string, boolean>;
  effective: Record<string, boolean>;
}

const LABELS: Record<string, string> = {
  students: 'Élèves',
  users: 'Utilisateurs',
  smsPerMonth: 'SMS / mois',
  storageGb: 'Stockage (Go)',
};

/** SAA-003 / SAA-005 — quotas + feature flags (établissement courant ou forcé). */
type QuotasAndFlagsPanelProps = {
  /** Super-admin : établissement sélectionné explicitement. */
  institutionId?: string;
};

export const QuotasAndFlagsPanel = ({ institutionId: institutionIdProp }: QuotasAndFlagsPanelProps) => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [features, setFeatures] = useState<FeatureSnapshot | null>(null);
  const canEditFlags = user?.role === 'admin';
  const institutionId = institutionIdProp || user?.institutionId || undefined;

  useEffect(() => {
    if (!institutionId) return;
    Promise.all([
      apiClient.get<{ quotas: QuotaRow[] }>(`/institutions/${institutionId}/quotas`),
      apiClient.get<FeatureSnapshot>(`/institutions/${institutionId}/features`),
    ])
      .then(([q, f]) => {
        setQuotas(q.quotas);
        setFeatures(f);
      })
      .catch(() => toast({ title: 'Impossible de charger quotas/flags', variant: 'destructive' }));
  }, [institutionId, toast]);

  const toggleFlag = async (key: string, enabled: boolean) => {
    if (!institutionId || !canEditFlags) return;
    try {
      const { overrides } = await apiClient.put<{ overrides: Record<string, boolean> }>(
        `/institutions/${institutionId}/features/${key}`,
        { enabled }
      );
      setFeatures((prev) =>
        prev
          ? {
              ...prev,
              overrides,
              effective: { ...prev.effective, [key]: enabled },
            }
          : prev
      );
    } catch {
      toast({ title: 'Mise à jour impossible', variant: 'destructive' });
    }
  };

  if (!institutionId) {
    return <EmptyState title="Aucun établissement" description="Sélectionnez un établissement pour voir les quotas." />;
  }

  const flagKeys = Array.from(
    new Set([
      'finance',
      'communications',
      'admissions',
      'documents',
      'canteen',
      'lot9_services',
      'exercises_ai',
      'advancedReports',
      ...Object.keys(features?.planFeatures ?? {}),
      ...Object.keys(features?.overrides ?? {}),
      ...Object.keys(features?.platformFlags ?? {}),
      ...Object.keys(features?.effective ?? {}),
    ])
  ).map((k) => (k === 'aiTutor' ? 'exercises_ai' : k === 'lot9Services' ? 'lot9_services' : k));
  const uniqueFlagKeys = Array.from(new Set(flagKeys));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Quotas (SAA-003)</CardTitle>
          <CardDescription>Plafonds du plan actif, y compris le stockage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {quotas.length === 0 ? (
            <EmptyState title="Aucun quota" />
          ) : (
            quotas.map((q) => (
              <div key={q.type} className="flex items-center justify-between text-sm">
                <span>{LABELS[q.type] || q.type}</span>
                <div className="flex items-center gap-2">
                  <span>
                    {q.current}
                    {q.limit != null ? ` / ${q.limit}` : ' / ∞'}
                  </span>
                  {q.warning && <Badge variant="outline">Attention</Badge>}
                  {!q.allowed && <Badge variant="destructive">Plein</Badge>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags (SAA-005)</CardTitle>
          <CardDescription>
            {canEditFlags
              ? 'Surcharges tenant (admin). Effectif = plateforme > override > plan > défaut module.'
              : 'Lecture seule — plan + overrides + plateforme.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {uniqueFlagKeys.map((key) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs">{key}</span>
              <Switch
                checked={!!features?.effective?.[key]}
                disabled={!canEditFlags}
                onCheckedChange={(v) => toggleFlag(key, v)}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
