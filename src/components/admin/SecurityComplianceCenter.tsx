import { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  Trash2,
  RefreshCw,
  MonitorSmartphone,
  FileArchive,
  Download,
  UserX,
  Info,
  BookOpen,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  type AuthSession,
} from '@/services/strkAuthSessionsService';
import { fetchDiagnostics, purgeFiles, fetchRopa, saveRopa, type PurgeResult } from '@/services/strkOpsService';
import { apiClient, ApiError } from '@/lib/apiClient';

/** Sessions + rétention fichiers + export DSAR / désactivation soft. */
const SecurityComplianceCenter = () => {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const prompt = usePromptDialog();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);
  const [purgeEnabled, setPurgeEnabled] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [dsarBusy, setDsarBusy] = useState(false);
  const [targetSessions, setTargetSessions] = useState<
    Array<{ id: string; userAgent?: string | null; ipAddress?: string | null; lastSeenAt: string }>
  >([]);
  const [consents, setConsents] = useState<
    Array<{
      id: string;
      channel: string;
      optedIn: boolean;
      profile?: { email?: string | null; firstName?: string | null; lastName?: string | null };
    }>
  >([]);
  const [ropa, setRopa] = useState<
    Array<{ id: string; purpose: string; legalBasis: string; dataCategories: string[]; retention: string }>
  >([]);
  const [ropaMeta, setRopaMeta] = useState<{ version: number; exportedAt: string | null }>({
    version: 0,
    exportedAt: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, diag, ropaRes, consentRes] = await Promise.all([
        listSessions(),
        fetchDiagnostics().catch(() => null),
        fetchRopa().catch(() => ({ entries: [], version: 0, exportedAt: null })),
        apiClient
          .get<{ preferences: typeof consents }>('/communications/preferences/registry?optedOut=true')
          .catch(() => ({ preferences: [] })),
      ]);
      setSessions(s);
      setPurgeEnabled(!!diag?.filePurgeEnabled);
      setRopa(ropaRes.entries || []);
      setRopaMeta({
        version: ropaRes.version ?? 0,
        exportedAt: ropaRes.exportedAt ?? null,
      });
      setConsents(consentRes.preferences || []);
    } catch (e) {
      toast({
        title: 'Sessions indisponibles',
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

  const onRevoke = async (id: string) => {
    try {
      await revokeSession(id);
      toast({ title: 'Session révoquée' });
      await load();
    } catch (e) {
      toast({
        title: 'Échec',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  const onRevokeOthers = async () => {
    try {
      const n = await revokeOtherSessions();
      toast({ title: `${n} session(s) révoquée(s)` });
      await load();
    } catch (e) {
      toast({
        title: 'Échec',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  const onPurgeDryRun = async () => {
    setPurgeBusy(true);
    try {
      const result = await purgeFiles(true);
      setPurgeResult(result);
      toast({
        title: 'Dry-run purge terminé',
        description: `${result.candidates.length} candidat(s) à la rétention.`,
      });
    } catch (e) {
      toast({
        title: 'Purge impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setPurgeBusy(false);
    }
  };

  const onPurgeDestructive = async () => {
    if (!purgeEnabled) {
      toast({
        title: 'Purge désactivée',
        description: 'FILE_PURGE_ENABLED doit être true côté API.',
        variant: 'destructive',
      });
      return;
    }
    const typed = await prompt({
      title: 'Purge destructive S3',
      description:
        'Admissions rejetées >365j, messages >730j. Action irréversible.',
      variant: 'destructive',
      confirmLabel: 'Purger',
      typeToConfirm: 'PURGE',
      typeToConfirmLabel: 'Tapez PURGE pour confirmer',
    });
    if (!typed) {
      toast({ title: 'Purge annulée' });
      return;
    }
    setPurgeBusy(true);
    try {
      const result = await purgeFiles(false);
      setPurgeResult(result);
      toast({
        title: result.dryRun ? 'Toujours en dry-run' : 'Purge exécutée',
        description: result.dryRun
          ? 'Le serveur a forcé dry-run (flag absent ?).'
          : `${result.deleted.length} objet(s) supprimé(s), ${result.errors.length} erreur(s).`,
        variant: result.dryRun || result.errors.length ? 'destructive' : 'default',
      });
    } catch (e) {
      toast({
        title: 'Purge impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setPurgeBusy(false);
    }
  };

  const onPrivacyExport = async () => {
    if (!targetUserId.trim()) return;
    setDsarBusy(true);
    try {
      const data = await apiClient.get<Record<string, unknown>>(
        `/users/${targetUserId.trim()}/privacy-export`
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-export-${targetUserId.trim().slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export DSAR téléchargé' });
    } catch (e) {
      toast({
        title: 'Export impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setDsarBusy(false);
    }
  };

  const onAnonymize = async () => {
    if (!targetUserId.trim()) return;
    const typed = await prompt({
      title: 'Anonymiser le compte',
      description:
        'Anonymisation irréversible : PII remplacées, sessions révoquées, compte désactivé.',
      variant: 'destructive',
      confirmLabel: 'Anonymiser',
      typeToConfirm: 'ANONYMISER',
      typeToConfirmLabel: 'Tapez ANONYMISER pour confirmer',
    });
    if (!typed) {
      toast({ title: 'Anonymisation annulée' });
      return;
    }
    setDsarBusy(true);
    try {
      const res = await apiClient.post<{ anonymizedEmail: string }>(
        `/users/${targetUserId.trim()}/anonymize`,
        {}
      );
      toast({
        title: 'Compte anonymisé',
        description: `E-mail technique : ${res.anonymizedEmail}`,
      });
    } catch (e) {
      toast({
        title: 'Anonymisation impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setDsarBusy(false);
    }
  };

  const onSoftDeactivate = async () => {
    if (!targetUserId.trim()) return;
    const ok = await confirm({
      description: 'Désactiver ce compte (soft) et révoquer ses sessions ?',
      variant: 'destructive',
    });
    if (!ok) return;
    setDsarBusy(true);
    try {
      await apiClient.delete(`/users/${targetUserId.trim()}`);
      toast({ title: 'Compte désactivé (soft)' });
    } catch (e) {
      toast({
        title: 'Désactivation impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setDsarBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Sécurité & RGPD</h2>
          <p className="text-sm text-muted-foreground">
            Sessions, rétention fichiers (DOC-005), export DSAR et désactivation soft.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          <Button variant="destructive" onClick={() => void onRevokeOthers()}>
            Déconnecter les autres appareils
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" /> Politique de conservation
          </CardTitle>
          <CardDescription>
            Admissions rejetées/annulées &gt; 365 j · messages S3 &gt; 730 j. Receipts/devoirs hors
            purge auto. Destructive uniquement si FILE_PURGE_ENABLED=true.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant={purgeEnabled ? 'destructive' : 'secondary'}>
            FILE_PURGE_ENABLED={purgeEnabled ? 'true' : 'false'}
          </Badge>
          <Button type="button" variant="outline" disabled={purgeBusy} onClick={() => void onPurgeDryRun()}>
            <FileArchive className="mr-2 h-4 w-4" />
            {purgeBusy ? 'Analyse…' : 'Dry-run purge fichiers'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={purgeBusy || !purgeEnabled}
            onClick={() => void onPurgeDestructive()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Purge destructive
          </Button>
        </CardContent>
      </Card>

      {purgeResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Résultat dry-run — {purgeResult.candidates.length} candidat(s)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {purgeResult.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun fichier à purger.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs font-mono">
                {purgeResult.candidates.slice(0, 50).map((c) => (
                  <li key={c.key}>
                    {c.key} — {c.reason} ({c.sizeBytes} o)
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" /> DSAR — export / désactivation
          </CardTitle>
          <CardDescription>
            Export JSON administratif. Soft-delete = désactivation. Anonymisation DSAR =
            remplacement PII irréversible (historique métier conservé).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-lg space-y-2">
            <Label htmlFor="dsar-user">ID utilisateur (UUID)</Label>
            <Input
              id="dsar-user"
              placeholder="uuid du compte"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={dsarBusy || !targetUserId.trim()} onClick={() => void onPrivacyExport()}>
              <Download className="mr-2 h-4 w-4" />
              Exporter JSON
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={dsarBusy || !targetUserId.trim()}
              onClick={() => void onSoftDeactivate()}
            >
              <UserX className="mr-2 h-4 w-4" />
              Désactiver (soft)
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={dsarBusy || !targetUserId.trim()}
              onClick={() => void onAnonymize()}
            >
              <UserX className="mr-2 h-4 w-4" />
              Anonymiser (DSAR)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={dsarBusy || !targetUserId.trim()}
              onClick={() =>
                void (async () => {
                  setDsarBusy(true);
                  try {
                    const { sessions: rows } = await apiClient.get<{
                      sessions: typeof targetSessions;
                    }>(`/users/${targetUserId.trim()}/sessions`);
                    setTargetSessions(rows || []);
                  } catch (e) {
                    toast({
                      title: 'Sessions cible',
                      description: e instanceof ApiError ? e.message : 'Erreur',
                      variant: 'destructive',
                    });
                  } finally {
                    setDsarBusy(false);
                  }
                })()
              }
            >
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              Sessions de ce compte
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={dsarBusy || !targetUserId.trim()}
              onClick={() =>
                void (async () => {
                  const ok = await confirm({
                    description: 'Révoquer toutes les sessions de cet utilisateur ?',
                    variant: 'destructive',
                  });
                  if (!ok) return;
                  setDsarBusy(true);
                  try {
                    const { revoked } = await apiClient.delete<{ revoked: number }>(
                      `/users/${targetUserId.trim()}/sessions`
                    );
                    setTargetSessions([]);
                    toast({ title: `${revoked} session(s) révoquée(s)` });
                  } catch (e) {
                    toast({
                      title: 'Révocation impossible',
                      description: e instanceof ApiError ? e.message : 'Erreur',
                      variant: 'destructive',
                    });
                  } finally {
                    setDsarBusy(false);
                  }
                })()
              }
            >
              Révoquer sessions cible
            </Button>
          </div>
          {targetSessions.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {targetSessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-2 border-b py-1">
                  <span>
                    {s.userAgent || 'Appareil'} · {s.ipAddress || '—'}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(s.lastSeenAt).toLocaleString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" /> Consentements (opt-out)
          </CardTitle>
          <CardDescription>Registre COM-003 — canaux désactivés par les utilisateurs.</CardDescription>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun opt-out enregistré.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {consents.slice(0, 40).map((c) => (
                <li key={c.id} className="flex justify-between gap-2 border-b py-1">
                  <span>
                    {c.profile?.email || c.profile?.firstName} · {c.channel}
                  </span>
                  <Badge variant="destructive">opt-out</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" /> Registre des traitements (RoPA)
            </CardTitle>
            <CardDescription>
              Éditable — persisté dans settings system/ropaRegister. Version {ropaMeta.version}
              {ropaMeta.exportedAt
                ? ` · dernière sauvegarde ${new Date(ropaMeta.exportedAt).toLocaleString('fr-FR')}`
                : ''}
              .
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={ropa.length === 0}
              onClick={() => {
                const blob = new Blob(
                  [
                    JSON.stringify(
                      {
                        version: ropaMeta.version,
                        exportedAt: new Date().toISOString(),
                        entries: ropa,
                      },
                      null,
                      2
                    ),
                  ],
                  { type: 'application/json' }
                );
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ropa-caddynote-v${ropaMeta.version || 0}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={dsarBusy || ropa.length === 0}
              onClick={() =>
                void (async () => {
                  setDsarBusy(true);
                  try {
                    const saved = await saveRopa(ropa);
                    setRopaMeta({
                      version: saved.version,
                      exportedAt: saved.exportedAt,
                    });
                    toast({ title: 'RoPA enregistré', description: `Version ${saved.version}` });
                  } catch (e) {
                    toast({
                      title: 'Enregistrement impossible',
                      description: e instanceof ApiError ? e.message : 'Erreur',
                      variant: 'destructive',
                    });
                  } finally {
                    setDsarBusy(false);
                  }
                })()
              }
            >
              Enregistrer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {ropa.map((e, idx) => (
              <li key={e.id} className="space-y-2 rounded-md border p-3">
                <Input
                  value={e.purpose}
                  onChange={(ev) =>
                    setRopa((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, purpose: ev.target.value } : r))
                    )
                  }
                  placeholder="Finalité"
                />
                <Input
                  value={e.legalBasis}
                  onChange={(ev) =>
                    setRopa((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, legalBasis: ev.target.value } : r))
                    )
                  }
                  placeholder="Base légale"
                />
                <Input
                  value={e.dataCategories.join(', ')}
                  onChange={(ev) =>
                    setRopa((rows) =>
                      rows.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              dataCategories: ev.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : r
                      )
                    )
                  }
                  placeholder="Catégories (séparées par des virgules)"
                />
                <Input
                  value={e.retention}
                  onChange={(ev) =>
                    setRopa((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, retention: ev.target.value } : r))
                    )
                  }
                  placeholder="Conservation"
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Sessions actives (votre compte)
          </CardTitle>
          <CardDescription>GET/DELETE /auth/sessions — révocation serveur (IAM-004). MFA obligatoire pour rôles sensibles côté API.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune session.</p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <MonitorSmartphone className="mt-0.5 h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium">
                        {s.userAgent || 'Appareil inconnu'}
                        {s.current && (
                          <Badge className="ml-2" variant="secondary">
                            Session courante
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        IP {s.ipAddress || '—'} · vu {new Date(s.lastSeenAt).toLocaleString('fr-FR')} ·
                        expire {new Date(s.expiresAt).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="outline" onClick={() => void onRevoke(s.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Révoquer
                    </Button>
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

export default SecurityComplianceCenter;
