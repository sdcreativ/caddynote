import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LifeBuoy, Plus, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import {
  fetchSupportTickets,
  fetchSupportTicket,
  createSupportTicket,
  replySupportTicket,
  updateSupportTicket,
  escalateSupportTicket,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "@/services/strkSupportService";

/**
 * SAA-006 (Lot 10) — jusqu'ici aucune interface n'existait pour le support
 * client (backend nouvellement construit, voir server/src/routes/
 * support.routes.ts). Page volontairement simple : liste + fil de
 * messages, priorité/statut modifiables par le personnel, note interne
 * jamais visible du demandeur.
 */
const TICKET_STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "closed",
];

const TICKET_PRIORITIES: SupportTicketPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

const PRIORITY_VARIANT: Record<SupportTicketPriority, "secondary" | "default" | "destructive"> = {
  low: "secondary",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

const SupportPage = () => {
  const { t } = useTranslation('support');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const isStaff = user?.role === "admin" || user?.role === "school_admin";
  const isPlatformAdmin = user?.role === "admin";

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    ticket: SupportTicket;
    messages: SupportTicketMessage[];
    prospect?: { name: string; email: string; subject: string };
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPriority, setNewPriority] = useState<SupportTicketPriority>("normal");
  const [replyBody, setReplyBody] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setTickets(await fetchSupportTickets());
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.loadListError'), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const loadDetail = async (id: string) => {
    setSelectedId(id);
    try {
      setSelected(await fetchSupportTicket(id));
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.loadDetailError'), variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!newSubject.trim() || !newBody.trim()) return;
    try {
      const ticket = await createSupportTicket({ subject: newSubject, body: newBody, priority: newPriority });
      toast({ title: t('toast.createdTitle'), description: t('toast.createdBody') });
      setCreateOpen(false);
      setNewSubject("");
      setNewBody("");
      setNewPriority("normal");
      await loadTickets();
      await loadDetail(ticket.id);
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.createError'), variant: "destructive" });
    }
  };

  const handleReply = async () => {
    if (!selectedId || !replyBody.trim()) return;
    try {
      const result = await replySupportTicket(selectedId, replyBody, replyInternal);
      setReplyBody("");
      setReplyInternal(false);
      if (!replyInternal && result.prospectEmail) {
        toast({
          title: result.prospectEmailed
            ? t('toast.replyEmailedTitle')
            : t('toast.replySavedNoSmtpTitle'),
          description: result.prospectEmailed
            ? t('toast.replyEmailedBody', { email: result.prospectEmail })
            : t('toast.replySavedNoSmtpBody', { email: result.prospectEmail }),
        });
      }
      await loadDetail(selectedId);
      await loadTickets();
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.replyError'), variant: "destructive" });
    }
  };

  const handleStatusChange = async (status: SupportTicketStatus) => {
    if (!selectedId) return;
    try {
      await updateSupportTicket(selectedId, { status });
      await loadDetail(selectedId);
      await loadTickets();
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.statusError'), variant: "destructive" });
    }
  };

  const handleEscalate = async () => {
    if (!selectedId) return;
    try {
      await escalateSupportTicket(selectedId);
      toast({ title: t('toast.escalatedTitle'), description: t('toast.escalatedBody') });
      await loadDetail(selectedId);
      await loadTickets();
    } catch (error) {
      toast({ title: tc('status.error'), description: t('toast.escalateError'), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="h-7 w-7" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newTicket')}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('tickets')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">{tc('actions.loading')}</p>
            ) : tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => loadDetail(ticket.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-accent ${
                    selectedId === ticket.id ? "border-primary bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{ticket.subject}</span>
                    <Badge variant={PRIORITY_VARIANT[ticket.priority]} className="shrink-0">
                      {t(`priorities.${ticket.priority}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t(`status.${ticket.status}`)}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          {!selected ? (
            <CardContent className="p-12 text-center text-muted-foreground">
              {t('selectTicket')}
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle>{selected.ticket.subject}</CardTitle>
                  {isStaff ? (
                    <Select value={selected.ticket.status} onValueChange={(v) => handleStatusChange(v as SupportTicketStatus)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{t(`status.${s}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge>{t(`status.${selected.ticket.status}`)}</Badge>
                  )}
                </div>
                <CardDescription>
                  {t('priorityLabel', { priority: t(`priorities.${selected.ticket.priority}`) })}
                  {selected.ticket.slaDueAt && (
                    <span className="ml-2">
                      · SLA {new Date(selected.ticket.slaDueAt).toLocaleString('fr-FR')}
                      {selected.ticket.slaBreached ? ` (${t('slaBreached')})` : ''}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isStaff && selected.ticket.status !== 'closed' && selected.ticket.status !== 'resolved' && (
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleEscalate()}>
                      {t('escalate')}
                    </Button>
                  </div>
                )}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selected.messages.map((m) => (
                    <div key={m.id} className={`p-3 rounded-lg ${m.isInternal ? "bg-amber-50 border border-amber-200" : "bg-muted"}`}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        {m.isInternal && <Lock className="h-3 w-3" />}
                        <span>{m.author ? `${m.author.firstName ?? ""} ${m.author.lastName ?? ""}`.trim() : t('userFallback')}</span>
                        {m.isInternal && <span className="font-medium text-amber-700">{t('internalNote')}</span>}
                        <span>· {new Date(m.createdAt).toLocaleString("fr-FR")}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-4 border-t">
                  {isPlatformAdmin && selected.prospect && !replyInternal ? (
                    <p className="text-xs text-muted-foreground">
                      {t('prospectEmailHint', {
                        name: selected.prospect.name,
                        email: selected.prospect.email,
                      })}
                    </p>
                  ) : null}
                  <Textarea
                    placeholder={t('replyPlaceholder')}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    {isPlatformAdmin && (
                      <div className="flex items-center gap-2">
                        <Switch checked={replyInternal} onCheckedChange={setReplyInternal} id="internal-note" />
                        <Label htmlFor="internal-note" className="text-sm cursor-pointer">{t('internalNoteToggle')}</Label>
                      </div>
                    )}
                    <Button onClick={handleReply} disabled={!replyBody.trim()} className="ml-auto">
                      {tc('actions.send')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">{t('subject')}</Label>
              <Input id="subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder={t('subjectPlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">{t('priority')}</Label>
              <Select value={newPriority} onValueChange={(v) => setNewPriority(v as SupportTicketPriority)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{t(`priorities.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">{t('description')}</Label>
              <Textarea id="body" value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4} placeholder={t('bodyPlaceholder')} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{tc('actions.cancel')}</Button>
            <Button onClick={handleCreate} disabled={!newSubject.trim() || !newBody.trim()}>{tc('actions.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupportPage;
