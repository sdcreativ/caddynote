import { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, RefreshCw, Play, Shield, Download, CheckCircle2, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  fetchDiagnostics,
  listBackups,
  runBackup,
  getBackupDownloadUrl,
  verifyBackup,
  type BackupEntry,
  type DiagnosticsPayload,
} from '@/services/strkOpsService';
import { ApiError } from '@/lib/apiClient';

const SystemManagement = () => {
  const { toast } = useToast();
  const [diag, setDiag] = useState<DiagnosticsPayload | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [s3Configured, setS3Configured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([fetchDiagnostics(), listBackups()]);
      setDiag(d);
      setBackups(b.backups);
      setS3Configured(b.s3Configured);
    } catch (e) {
      toast({
        title: 'Chargement impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onBackup = async () => {
    setRunning(true);
    try {
      await runBackup();
      toast({ title: 'Sauvegarde lancée' });
      await load();
    } catch (e) {
      toast({
        title: 'Échec sauvegarde',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const onDownload = async (key: string) => {
    setBusyKey(key);
    try {
      const { downloadUrl } = await getBackupDownloadUrl(key);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast({ title: 'Téléchargement', description: 'URL présignée ouverte (valide 1 h).' });
    } catch (e) {
      toast({
        title: 'Téléchargement impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const onVerify = async (key?: string) => {
    setBusyKey(key || '__latest__');
    try {
      const result = await verifyBackup(key);
      toast({
        title: result.ok ? 'Sauvegarde valide' : 'Vérification échouée',
        description: result.detail || result.filename || (result.ok ? 'pg_restore --list OK' : 'Échec'),
        variant: result.ok ? 'default' : 'destructive',
      });
    } catch (e) {
      toast({
        title: 'Vérification impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Système & sauvegardes</h2>
          <p className="text-sm text-muted-foreground">
            Diagnostics, backups S3, téléchargement et vérification (restauration manuelle).
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" /> Base
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Statut</span>
              <Badge>{diag?.status ?? '…'}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Postgres</span>
              <span>{diag?.database ?? '…'}</span>
            </div>
            <div className="flex justify-between">
              <span>Cron backup</span>
              <span>{diag?.backupCron || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>RPO hint</span>
              <span>{diag?.rpoHintHours != null ? `${diag.rpoHintHours}h` : '—'}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4" /> Stockage backups
            </CardTitle>
            <CardDescription>S3 {s3Configured ? 'configuré' : 'non configuré'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => void onBackup()} disabled={running || !s3Configured}>
              <Play className="mr-2 h-4 w-4" />
              {running ? 'Lancement…' : 'Lancer une sauvegarde'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!s3Configured || !!busyKey}
              onClick={() => void onVerify()}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Vérifier la dernière
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Runbook restauration
          </CardTitle>
          <CardDescription>
            Pas de restore destructif via l’API (sécurité). Procédure manuelle :
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Télécharger le dump via le bouton ci-dessous (URL présignée 1 h).</li>
            <li>Vérifier l’intégrité (`pg_restore --list` — bouton Vérifier).</li>
            <li>Hors production : `pg_restore` vers une base dédiée, puis bascule contrôlée.</li>
            <li>Documenter l’opération et l’horodatage dans le journal d’audit.</li>
          </ol>
          <p className="text-xs">Détail : docs/SAUVEGARDE_RESTAURATION.md</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Historique backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun backup listé.</p>
          ) : (
            <ul className="divide-y text-sm">
              {backups.slice(0, 20).map((b) => (
                <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{b.key}</p>
                    <p className="text-muted-foreground">
                      {(b.sizeBytes / 1024 / 1024).toFixed(1)} Mo
                      {b.lastModified ? ` · ${new Date(b.lastModified).toLocaleString('fr-FR')}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey === b.key}
                      onClick={() => void onDownload(b.key)}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Télécharger
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyKey === b.key}
                      onClick={() => void onVerify(b.key)}
                    >
                      Vérifier
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemManagement;
