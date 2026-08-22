import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Headphones,
  KeyRound,
  RefreshCw,
  Search,
  ShieldOff,
  History,
  LifeBuoy,
  Send,
  UserRoundSearch,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { adminSearch } from '@/services/strkOpsService';
import { apiClient, ApiError } from '@/lib/apiClient';
import TenantHealthDialog from '@/components/admin/TenantHealthDialog';
import {
  fetchSupportTickets,
  fetchSupportTicket,
  createSupportTicket,
  replySupportTicket,
  updateSupportTicket,
  fetchContactOpsMessages,
  convertContactToTicket,
  updateContactOpsMessage,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketStatus,
  type SupportTicketPriority,
  type ContactOpsMessage,
} from '@/services/strkSupportService';

type TimelineEvent = { kind: string; id: string; at: string; label: string };

const STATUSES: SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
];

/** Support ops : recherche, inbox tickets (reply/status/assign), reset MFA/mdp, timeline. */
const SupportOpsCenter = () => {
  const { t } = useTranslation('superAdmin');
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const { user, startImpersonation } = useStrkAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<
    Array<{
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      role: string;
      isActive: boolean;
    }>
  >([]);
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);
  const [healthInstitutionId, setHealthInstitutionId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateTicketId, setImpersonateTicketId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPriority, setNewPriority] = useState<SupportTicketPriority>('normal');
  const [newInstitutionId, setNewInstitutionId] = useState('');
  const [newBehalfUserId, setNewBehalfUserId] = useState('');
  const [newEscalate, setNewEscalate] = useState(true);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [contactMessages, setContactMessages] = useState<ContactOpsMessage[]>([]);

  const loadTickets = useCallback(async () => {
    try {
      setTickets(await fetchSupportTickets(unassignedOnly ? { unassigned: true } : undefined));
    } catch {
      setTickets([]);
    }
  }, [unassignedOnly]);

  const loadContactInbox = useCallback(async () => {
    try {
      setContactMessages(await fetchContactOpsMessages('new'));
    } catch {
      setContactMessages([]);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    void loadContactInbox();
  }, [loadContactInbox]);

  const openTicket = async (id: string) => {
    setSelectedTicketId(id);
    setBusy(true);
    try {
      const { ticket, messages: msgs } = await fetchSupportTicket(id);
      setTicketDetail(ticket);
      setMessages(msgs || []);
    } catch (e) {
      toast({
        title: 'Ticket indisponible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSearch = async () => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await adminSearch(q.trim());
      setUsers(res.users);
      setInstitutions(res.institutions);
    } catch (e) {
      toast({
        title: 'Recherche impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const resetMfa = async () => {
    if (!targetUserId.trim()) return;
    const ok = await confirm({
      description: 'Réinitialiser le MFA et révoquer les sessions ?',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiClient.post(`/users/${targetUserId.trim()}/admin-reset-mfa`, {});
      toast({ title: 'MFA réinitialisé' });
    } catch (e) {
      toast({
        title: 'Échec MFA',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!targetUserId.trim()) return;
    const ok = await confirm({
      description: 'Générer un mot de passe temporaire et révoquer les sessions ?',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiClient.post<{ tempPassword: string }>(
        `/users/${targetUserId.trim()}/admin-reset-password`,
        {}
      );
      setTempPassword(res.tempPassword);
      toast({ title: 'Mot de passe temporaire généré' });
    } catch (e) {
      toast({
        title: 'Échec reset',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const loadTimeline = async () => {
    if (!targetUserId.trim()) return;
    setBusy(true);
    try {
      const res = await apiClient.get<{ events: TimelineEvent[] }>(
        `/users/${targetUserId.trim()}/timeline?limit=40`
      );
      setTimeline(res.events || []);
    } catch (e) {
      toast({
        title: 'Timeline indisponible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicketId || !replyBody.trim()) return;
    setBusy(true);
    try {
      await replySupportTicket(selectedTicketId, replyBody.trim(), replyInternal);
      setReplyBody('');
      toast({ title: 'Réponse envoyée' });
      await openTicket(selectedTicketId);
      await loadTickets();
    } catch (e) {
      toast({
        title: 'Envoi impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: SupportTicketStatus) => {
    if (!selectedTicketId) return;
    setBusy(true);
    try {
      await updateSupportTicket(selectedTicketId, { status });
      toast({ title: `Statut → ${status}` });
      await openTicket(selectedTicketId);
      await loadTickets();
    } catch (e) {
      toast({
        title: 'Mise à jour impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const assignToMe = async () => {
    if (!selectedTicketId || !user?.id) return;
    setBusy(true);
    try {
      await updateSupportTicket(selectedTicketId, { assignedTo: user.id });
      toast({ title: 'Ticket assigné à vous' });
      await openTicket(selectedTicketId);
      await loadTickets();
    } catch (e) {
      toast({
        title: 'Assignation impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !newBody.trim()) return;
    setBusy(true);
    try {
      const ticket = await createSupportTicket({
        subject: newSubject.trim(),
        body: newBody.trim(),
        priority: newPriority,
        institutionId: newInstitutionId.trim() || undefined,
        onBehalfOfUserId: newBehalfUserId.trim() || targetUserId.trim() || undefined,
        escalate: newEscalate,
      });
      setNewSubject('');
      setNewBody('');
      toast({ title: 'Ticket créé', description: ticket.subject });
      await loadTickets();
      await openTicket(ticket.id);
    } catch (e) {
      toast({
        title: 'Création impossible',
        description: e instanceof ApiError ? e.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <Headphones className="h-6 w-6" aria-hidden /> {t('supportOps.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('supportOps.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/support')}>
          <LifeBuoy className="mr-2 h-4 w-4" />
          Ouvrir /support
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Recherche globale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex max-w-xl gap-2">
            <Input
              placeholder="Nom, e-mail, établissement…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void onSearch()}
            />
            <Button type="button" disabled={searching} onClick={() => void onSearch()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${searching ? 'animate-spin' : ''}`} />
              Chercher
            </Button>
          </div>
          {(users.length > 0 || institutions.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Utilisateurs ({users.length})</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 border-b py-1">
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => setTargetUserId(u.id)}
                      >
                        {u.firstName} {u.lastName} · {u.email}
                      </button>
                      <Badge variant={u.isActive ? 'secondary' : 'destructive'}>{u.role}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Établissements ({institutions.length})</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {institutions.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 border-b py-1">
                      <span>
                        {i.name}{' '}
                        <span className="text-muted-foreground">({i.type})</span>
                      </span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHealthInstitutionId(i.id)}>
                        Santé
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">File contact public</CardTitle>
            <CardDescription>
              Messages `/contact` non traités — convertir en ticket support ops.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadContactInbox()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {contactMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun message en attente.</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
              {contactMessages.map((m) => (
                <li key={m.id} className="rounded-md border p-3 space-y-2">
                  <div className="font-medium">{m.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.name} &lt;{m.email}&gt; · {new Date(m.createdAt).toLocaleString('fr-FR')}
                  </div>
                  <p className="line-clamp-2 text-muted-foreground">{m.message}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          try {
                            const res = await convertContactToTicket(m.id);
                            toast({ title: 'Converti en ticket', description: res.ticket.subject });
                            await loadContactInbox();
                            await loadTickets();
                            await openTicket(res.ticket.id);
                          } catch (e) {
                            toast({
                              title: 'Conversion impossible',
                              description: e instanceof ApiError ? e.message : 'Erreur',
                              variant: 'destructive',
                            });
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Convertir en ticket
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          try {
                            await updateContactOpsMessage(m.id, 'acknowledged');
                            await loadContactInbox();
                          } catch (e) {
                            toast({
                              title: 'Mise à jour impossible',
                              description: e instanceof ApiError ? e.message : 'Erreur',
                              variant: 'destructive',
                            });
                          }
                        })()
                      }
                    >
                      Accuser réception
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Créer / escalader un ticket
          </CardTitle>
          <CardDescription>
            Au nom d’un établissement ou utilisateur (admin plateforme). Escalade = priorité haute + assignation à vous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ticket-subject">Sujet</Label>
              <Input
                id="ticket-subject"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Ex. Accès bloqué / facturation"
              />
            </div>
            <div className="space-y-1">
              <Label>Priorité</Label>
              <Select
                value={newPriority}
                onValueChange={(v) => setNewPriority(v as SupportTicketPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'normal', 'high', 'urgent'] as SupportTicketPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ticket-inst">Établissement (UUID)</Label>
              <Input
                id="ticket-inst"
                value={newInstitutionId}
                onChange={(e) => setNewInstitutionId(e.target.value)}
                placeholder="Optionnel — ou choisir via recherche"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ticket-behalf">Pour utilisateur (UUID)</Label>
              <Input
                id="ticket-behalf"
                value={newBehalfUserId || targetUserId}
                onChange={(e) => setNewBehalfUserId(e.target.value)}
                placeholder="Défaut = cible outils ci-dessous"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticket-body">Description</Label>
            <Textarea
              id="ticket-body"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={3}
              placeholder="Contexte, impact, demande…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newEscalate}
                onChange={(e) => setNewEscalate(e.target.checked)}
              />
              Escalader (assignation + priorité ≥ high)
            </label>
            <Button
              type="button"
              disabled={busy || !newSubject.trim() || !newBody.trim()}
              onClick={() => void createTicket()}
            >
              <Send className="mr-2 h-4 w-4" />
              Créer le ticket
            </Button>
            {institutions.slice(0, 5).map((i) => (
              <Button
                key={i.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setNewInstitutionId(i.id)}
              >
                {i.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Inbox tickets</CardTitle>
              <CardDescription>Cliquez pour ouvrir · reply / status / assign · SLA</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(e) => setUnassignedOnly(e.target.checked)}
                />
                Non assignés
              </label>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadTickets()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun ticket.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {tickets.slice(0, 40).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md border px-2 py-1.5 text-left hover:bg-muted ${
                        selectedTicketId === t.id ? 'border-primary bg-muted' : ''
                      }`}
                      onClick={() => void openTicket(t.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{t.subject}</span>
                        <Badge variant={t.slaBreached ? 'destructive' : 'secondary'}>{t.priority}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.institution?.name || 'Sans établissement'} · {t.status}
                        {t.slaBreached ? ' · SLA dépassé' : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Détail ticket</CardTitle>
            <CardDescription>
              {ticketDetail ? ticketDetail.subject : 'Sélectionnez un ticket'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!ticketDetail ? (
              <p className="text-sm text-muted-foreground">Aucun ticket ouvert.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={ticketDetail.status}
                    onValueChange={(v) => void changeStatus(v as SupportTicketStatus)}
                    disabled={busy}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void assignToMe()}>
                    M’assigner
                  </Button>
                  {ticketDetail.institutionId && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setHealthInstitutionId(ticketDetail.institutionId)}
                    >
                      Santé tenant
                    </Button>
                  )}
                </div>
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2 text-xs">
                  {messages.map((m) => (
                    <li key={m.id} className="border-b pb-2">
                      <p className="text-muted-foreground">
                        {m.author?.firstName} {m.author?.lastName}
                        {m.isInternal ? ' · interne' : ''} ·{' '}
                        {new Date(m.createdAt).toLocaleString('fr-FR')}
                      </p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
                <Textarea
                  rows={3}
                  placeholder="Réponse…"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={replyInternal}
                      onChange={(e) => setReplyInternal(e.target.checked)}
                    />
                    Note interne
                  </label>
                  <Button type="button" disabled={busy || !replyBody.trim()} onClick={() => void sendReply()}>
                    <Send className="mr-2 h-4 w-4" />
                    Envoyer
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions compte</CardTitle>
          <CardDescription>UUID cible — ou cliquez un résultat de recherche.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-lg space-y-2">
            <Label htmlFor="support-user">ID utilisateur</Label>
            <Input
              id="support-user"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="uuid"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !targetUserId} onClick={() => void resetMfa()}>
              <ShieldOff className="mr-2 h-4 w-4" />
              Reset MFA
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !targetUserId}
              onClick={() => void resetPassword()}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Reset mot de passe
            </Button>
            <Button type="button" disabled={busy || !targetUserId} onClick={() => void loadTimeline()}>
              <History className="mr-2 h-4 w-4" />
              Timeline
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !targetUserId.trim() || impersonateReason.trim().length < 10}
              onClick={() =>
                void (async () => {
                  const ok = await confirm({
                    description:
                      'Démarrer une impersonation auditée (15 min) ? Motif et ticket seront journalisés. Actions sensibles bloquées.',
                    variant: 'default',
                  });
                  if (!ok) return;
                  setBusy(true);
                  try {
                    await startImpersonation(targetUserId.trim(), {
                      durationMinutes: 15,
                      reason: impersonateReason.trim(),
                      supportTicketId: impersonateTicketId.trim() || selectedTicketId || undefined,
                    });
                  } catch (e) {
                    toast({
                      title: 'Impersonation impossible',
                      description: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Erreur',
                      variant: 'destructive',
                    });
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              <UserRoundSearch className="mr-2 h-4 w-4" />
              Se connecter en tant que
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="imp-reason">Motif impersonation (obligatoire)</Label>
              <Input
                id="imp-reason"
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                placeholder="Ex. ticket client — vérifier affichage notes"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imp-ticket">Ticket support (UUID, optionnel)</Label>
              <Input
                id="imp-ticket"
                value={impersonateTicketId || selectedTicketId || ''}
                onChange={(e) => setImpersonateTicketId(e.target.value)}
                placeholder="Prérempli si un ticket est ouvert"
              />
            </div>
          </div>
          {tempPassword && (
            <p className="rounded-md border bg-amber-50 p-3 font-mono text-sm">
              Mot de passe temporaire : {tempPassword}
            </p>
          )}
          {timeline.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
              {timeline.map((ev) => (
                <li key={`${ev.kind}-${ev.id}`} className="flex justify-between gap-2 border-b py-1">
                  <span>
                    <Badge variant="outline" className="mr-2">
                      {ev.kind}
                    </Badge>
                    {ev.label}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(ev.at).toLocaleString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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

export default SupportOpsCenter;
