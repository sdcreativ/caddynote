import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, ApiError } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Cable, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type DespsStatus = {
  configured: boolean;
  baseUrlHost: string | null;
  notes: string;
  pingReady?: boolean;
};

/** Affiché uniquement si `VITE_DESPS_PREVIEW=true` (ops plateforme). */
export const isDespsPreviewEnabled = () =>
  String(import.meta.env.VITE_DESPS_PREVIEW ?? '').toLowerCase() === 'true';

/**
 * Ops DESPS — dry-run export élèves (permission platform.integrations.desps).
 * Surface preview uniquement : pas d’envoi live tant que le contrat API n’est pas figé.
 */
export function DespsOpsPanel({ institutions }: { institutions: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<DespsStatus | null>(null);
  const [institutionId, setInstitutionId] = useState(institutions[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiClient.get<DespsStatus>('/admin/integrations/desps/status');
      setStatus(s);
      setForbidden(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setForbidden(true);
        setStatus(null);
        return;
      }
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!institutionId && institutions[0]) setInstitutionId(institutions[0].id);
  }, [institutions, institutionId]);

  if (forbidden) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Cable className="h-4 w-4" aria-hidden /> DESPS / DSC
          <Badge variant="outline">Preview</Badge>
        </CardTitle>
        <CardDescription>
          Connecteur stub — dry-run local uniquement. Sync live désactivée tant que le contrat API n’est pas branché.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <p className="text-sm text-muted-foreground">
            {status.configured
              ? `Configuré (${status.baseUrlHost ?? '—'})`
              : status.notes}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Statut indisponible</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Établissement</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !status?.pingReady}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await apiClient.post<{ ok: boolean; status?: number }>('/admin/integrations/desps/ping', {});
                toast({
                  title: r.ok ? 'Ping OK' : 'Ping échoué',
                  description: r.status != null ? `HTTP ${r.status}` : undefined,
                  variant: r.ok ? 'default' : 'destructive',
                });
              } catch (e) {
                toast({
                  title: 'Ping impossible',
                  description: e instanceof ApiError ? e.message : 'Erreur',
                  variant: 'destructive',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Ping
          </Button>
          <Button
            type="button"
            disabled={busy || !institutionId}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await apiClient.post<{
                  mode: string;
                  message: string;
                  snapshot: { count: number };
                }>('/admin/integrations/desps/sync/students', { institutionId });
                toast({
                  title: `Dry-run · ${r.snapshot.count} élève(s)`,
                  description: r.message,
                });
              } catch (e) {
                toast({
                  title: 'Sync impossible',
                  description: e instanceof ApiError ? e.message : 'Erreur',
                  variant: 'destructive',
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Dry-run élèves
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
