import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Send, RefreshCw, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiClient, ApiError } from '@/lib/apiClient';
import { listMessageTemplates, type ComChannel, type MessageTemplate } from '@/services/strkCommunicationService';
import { getCommsKillSwitch, type CommsKillSwitch } from '@/services/strkOpsService';

type Institution = { id: string; name: string };
type UserRow = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
  institutionId?: string | null;
  isActive?: boolean;
};

const ROLE_OPTIONS = [
  { value: 'school_admin', label: 'Admins établissement' },
  { value: 'teacher', label: 'Enseignants' },
  { value: 'parent', label: 'Parents' },
  { value: 'student', label: 'Élèves' },
] as const;

/**
 * Campagnes multi-tenant : sélection d’établissements → destinataires par rôle
 * → boucle POST /communications/send (admin global = contacts « all »).
 */
const CommunicationTools = () => {
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roleTarget, setRoleTarget] = useState<string>('school_admin');
  const [channel, setChannel] = useState<ComChannel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewUsers, setPreviewUsers] = useState<UserRow[]>([]);
  const [lastResult, setLastResult] = useState<{ ok: number; fail: number } | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [kill, setKill] = useState<CommsKillSwitch | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [deliveryReport, setDeliveryReport] = useState<{
    since: string;
    rows: Array<{ status: string; channel: string; count: number }>;
  } | null>(null);

  const loadInstitutions = useCallback(async () => {
    setLoading(true);
    try {
      const [{ institutions: list }, tpls, killSw] = await Promise.all([
        apiClient.get<{ institutions: Institution[] }>('/institutions'),
        listMessageTemplates().catch(() => [] as MessageTemplate[]),
        getCommsKillSwitch().catch(() => null),
      ]);
      setInstitutions((list || []).map((i) => ({ id: i.id, name: i.name })));
      setTemplates(tpls.filter((t) => t.isActive));
      setKill(killSw);
    } catch (e) {
      toast({
        title: 'Établissements indisponibles',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadInstitutions();
  }, [loadInstitutions]);

  const toggleInstitution = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(institutions.map((i) => i.id)));
  const clearAll = () => setSelectedIds(new Set());

  const loadPreview = async () => {
    if (selectedIds.size === 0) {
      setPreviewUsers([]);
      return;
    }
    try {
      const qs = new URLSearchParams({
        role: roleTarget,
        institutionIds: [...selectedIds].join(','),
      });
      const { users } = await apiClient.get<{ users: UserRow[] }>(
        `/admin/campaign-recipients?${qs.toString()}`
      );
      setPreviewUsers(users || []);
    } catch (e) {
      toast({
        title: 'Aperçu impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when selection/role change
  }, [selectedIds, roleTarget]);

  const recipientCount = useMemo(() => previewUsers.length, [previewUsers]);

  const onSend = async () => {
    if (!body.trim()) {
      toast({ title: 'Corps du message requis', variant: 'destructive' });
      return;
    }
    if (previewUsers.length === 0) {
      toast({ title: 'Aucun destinataire', variant: 'destructive' });
      return;
    }
    const confirmed = await confirm({
      description: scheduleAt
        ? `Planifier pour ${new Date(scheduleAt).toLocaleString('fr-FR')} (${previewUsers.length} destinataires) ?`
        : `Envoyer à ${previewUsers.length} destinataire(s) sur ${selectedIds.size} établissement(s) ?`,
      variant: 'default',
    });
    if (!confirmed) return;

    setSending(true);
    try {
      let ok = 0;
      let fail = 0;
      const ids = previewUsers.map((u) => u.id);

      if (scheduleAt) {
        const scheduledAt = new Date(scheduleAt).toISOString();
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          await apiClient.post('/admin/campaign-schedule', {
            scheduledAt,
            recipientIds: chunk,
            channel,
            subject: subject.trim() || undefined,
            body: body.trim(),
            useCase: 'platform_campaign_scheduled',
          });
          ok += chunk.length;
        }
        setLastResult({ ok, fail: 0 });
        toast({
          title: 'Campagne planifiée',
          description: `${ok} destinataire(s) · ${new Date(scheduleAt).toLocaleString('fr-FR')}`,
        });
      } else {
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const res = await apiClient.post<{ ok: number; fail: number }>('/admin/campaign-send', {
            recipientIds: chunk,
            channel,
            subject: subject.trim() || undefined,
            body: body.trim(),
            useCase: 'platform_campaign',
          });
          ok += res.ok;
          fail += res.fail;
        }
        setLastResult({ ok, fail });
        toast({
          title: 'Campagne mise en file',
          description: `${ok} OK · ${fail} échec(s)`,
          variant: fail > 0 ? 'destructive' : 'default',
        });
      }
    } catch (e) {
      toast({
        title: 'Campagne impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Campagnes multi-tenant</h2>
          <p className="text-sm text-muted-foreground">
            Sélectionnez des établissements, un rôle cible, puis envoyez via l’API communications.
            {kill && (kill.email || kill.sms || kill.whatsapp) ? (
              <span className="ml-1 text-amber-700">
                Kill-switch actif :
                {kill.email ? ' email' : ''}
                {kill.sms ? ' sms' : ''}
                {kill.whatsapp ? ' whatsapp' : ''}.
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/super-admin/observability#jobs">
            File comms / livraisons <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" /> Établissements
          </CardTitle>
          <CardDescription>
            {selectedIds.size} sélectionné(s) · {recipientCount} destinataire(s) ({roleTarget})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAll} disabled={loading}>
              Tout sélectionner
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
              Effacer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadInstitutions()}
              disabled={loading}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
            {institutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun établissement.</p>
            ) : (
              institutions.map((inst) => (
                <label key={inst.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.has(inst.id)}
                    onCheckedChange={() => toggleInstitution(inst.id)}
                  />
                  <span>{inst.name}</span>
                </label>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Rôle cible</Label>
            <Select value={roleTarget} onValueChange={setRoleTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as ComChannel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="push">Push (in-app)</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Modèle (optionnel)</Label>
            <Select
              value={templateId || '__none__'}
              onValueChange={(v) => {
                const id = v === '__none__' ? '' : v;
                setTemplateId(id);
                const tpl = templates.find((t) => t.id === id);
                if (tpl) {
                  setChannel(tpl.channel);
                  setSubject(tpl.subject || '');
                  setBody(tpl.body);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucun modèle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun — contenu libre</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.useCase} · {t.channel} · {t.locale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="camp-subject">Sujet (e-mail)</Label>
            <Input
              id="camp-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Annonce plateforme"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="camp-body">Corps</Label>
            <Textarea
              id="camp-body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Contenu de la campagne…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <div className="space-y-1">
              <Label htmlFor="camp-schedule">Planifier (optionnel)</Label>
              <Input
                id="camp-schedule"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            </div>
            <Button type="button" disabled={sending || recipientCount === 0} onClick={() => void onSend()}>
              <Send className="mr-2 h-4 w-4" />
              {sending
                ? 'Envoi…'
                : scheduleAt
                  ? `Planifier (${recipientCount})`
                  : `Envoyer (${recipientCount})`}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void apiClient
                  .get<{
                    since: string;
                    rows: Array<{ status: string; channel: string; count: number }>;
                  }>('/admin/campaign-delivery-report')
                  .then(setDeliveryReport)
                  .catch((e) =>
                    toast({
                      title: 'Rapport indisponible',
                      description: e instanceof ApiError ? e.message : 'Erreur',
                      variant: 'destructive',
                    })
                  )
              }
            >
              Rapport 7j
            </Button>
            {lastResult && (
              <Badge variant={lastResult.fail ? 'destructive' : 'secondary'}>
                Dernier run : {lastResult.ok} OK / {lastResult.fail} échec
              </Badge>
            )}
          </div>
          {deliveryReport && (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Délivrance depuis {new Date(deliveryReport.since).toLocaleDateString('fr-FR')} :{' '}
              {deliveryReport.rows.map((r) => `${r.channel}/${r.status}=${r.count}`).join(' · ') ||
                'aucune donnée'}
            </p>
          )}
          {previewUsers.length > 0 && (
            <p className="text-xs text-muted-foreground md:col-span-2">
              Aperçu :{' '}
              {previewUsers
                .slice(0, 8)
                .map((u) => u.email || `${u.firstName} ${u.lastName}`)
                .join(', ')}
              {previewUsers.length > 8 ? `… (+${previewUsers.length - 8})` : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CommunicationTools;
