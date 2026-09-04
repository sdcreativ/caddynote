import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient, authorizedFetch } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { useStrkAuth } from '@/hooks/useStrkAuth';

interface AuditLogRow {
  id: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  createdAt: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  actor?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null; role?: string } | null;
  institution?: { name: string } | null;
}

/** IAM-005 — journal réel `GET /audit-log` (plus de mock). */
const LogsCenter = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionPrefix, setActionPrefix] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const buildQs = useCallback(
    (extra?: Record<string, string>) => {
      const qs = new URLSearchParams({ limit: '200' });
      if (user?.institutionId && user.role !== 'admin') {
        qs.set('institutionId', user.institutionId);
      }
      if (actionPrefix.trim()) qs.set('action', actionPrefix.trim());
      if (fromDate) qs.set('from', new Date(fromDate).toISOString());
      if (toDate) qs.set('to', new Date(`${toDate}T23:59:59`).toISOString());
      if (extra) Object.entries(extra).forEach(([k, v]) => qs.set(k, v));
      return qs;
    },
    [user?.institutionId, user?.role, actionPrefix, fromDate, toDate]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { logs: rows } = await apiClient.get<{ logs: AuditLogRow[] }>(`/audit-log?${buildQs().toString()}`);
      setLogs(rows);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger le journal d’audit.', variant: 'destructive' });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [buildQs, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const res = await authorizedFetch(`/audit-log?${buildQs({ format: 'csv', limit: '2000' }).toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: 'Export CSV téléchargé' });
    } catch {
      toast({ title: 'Export impossible', variant: 'destructive' });
    }
  };

  const filtered = logs.filter((log) => {
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    const actor = [log.actor?.firstName, log.actor?.lastName, log.actor?.email].filter(Boolean).join(' ').toLowerCase();
    return log.action.toLowerCase().includes(q) || actor.includes(q) || (log.targetType || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Rechercher…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <Input
          className="max-w-[180px]"
          placeholder="Préfixe action (ex. finance)"
          value={actionPrefix}
          onChange={(e) => setActionPrefix(e.target.value)}
        />
        <Input type="date" className="max-w-[160px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" className="max-w-[160px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
        <Button variant="secondary" onClick={() => void exportCsv()} disabled={loading}>
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal d’audit serveur</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Chargement…</p>
          ) : filtered.length === 0 ? (
            <EmptyState title="Aucune entrée" description="Aucune action sensible journalisée pour ce filtre." />
          ) : (
            <ul className="divide-y max-h-[560px] overflow-y-auto">
              {filtered.map((log) => (
                <li key={log.id} className="py-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{log.action}</Badge>
                    <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString('fr-FR')}</span>
                  </div>
                  <p>
                    {[log.actor?.firstName, log.actor?.lastName].filter(Boolean).join(' ') || 'Système'}
                    {log.actor?.email ? ` (${log.actor.email})` : ''}
                    {log.institution?.name ? ` — ${log.institution.name}` : ''}
                  </p>
                  {(log.targetType || log.ipAddress) && (
                    <p className="text-xs text-muted-foreground">
                      {log.targetType ? `${log.targetType}${log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}` : ''}
                      {log.ipAddress ? ` · IP ${log.ipAddress}` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LogsCenter;
