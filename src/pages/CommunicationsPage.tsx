import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Megaphone, Send, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  listCommunicationLogs,
  sendCommunication,
  type ComChannel,
  type CommunicationLog,
} from '@/services/strkCommunicationService';
import { ApiError } from '@/lib/apiClient';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

/**
 * COM-001/004 — envoi multicanal + journal de livraison (API déjà en place).
 */
export default function CommunicationsPage() {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation('communications');
  const { t: tc } = useTranslation('common');
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [channel, setChannel] = useState<ComChannel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const canUseModule = Boolean(user?.institutionId);
  const canSend =
    canUseModule &&
    ['admin', 'school_admin', 'teacher', 'head_teacher', 'secretary'].includes(user?.role || '');

  const refresh = useCallback(async () => {
    if (!user?.institutionId) {
      setLogs([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listCommunicationLogs({ institutionId: user.institutionId });
      setLogs(data);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : t('networkError');
      setLoadError(message);
      toast({
        title: t('loadErrorTitle'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.institutionId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Module établissement : masqué en nav pour le super admin sans tenant ;
  // accès direct → pilotage métier.
  if (user && !user.institutionId) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      await sendCommunication({
        recipientId: recipientId.trim(),
        channel,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        isCritical: false,
      });
      toast({ title: t('queuedTitle'), description: t('queuedBody') });
      setBody('');
      setSubject('');
      await refresh();
    } catch (err) {
      toast({
        title: t('sendFailedTitle'),
        description: err instanceof ApiError ? err.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#0B1F3A]">
            {t('title')}
          </h1>
          <p className="mt-1 text-slate-500">
            {t('subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {canSend && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Send className="h-5 w-5 text-[#1D70D8]" />
              {t('composeTitle')}
            </CardTitle>
            <CardDescription>
              {t('composeDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSend} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="recipient">{t('recipient')}</Label>
                <Input
                  id="recipient"
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  placeholder={t('recipientPlaceholder')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>{t('channel')}</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as ComChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">{t('channels.email')}</SelectItem>
                    <SelectItem value="sms">{t('channels.sms')}</SelectItem>
                    <SelectItem value="whatsapp">{t('channels.whatsapp')}</SelectItem>
                    <SelectItem value="push">{t('channels.push')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">{t('subject')}</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="body">{t('body')}</Label>
                <Textarea
                  id="body"
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={sending} className="bg-[#1D70D8] hover:bg-[#1a63c2]">
                  <Megaphone className="mr-2 h-4 w-4" />
                  {sending ? t('sending') : tc('actions.send')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('journalTitle')}</CardTitle>
          <CardDescription>{t('journalDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label={t('loading')} />
          ) : loadError ? (
            <ErrorState description={loadError} onRetry={() => void refresh()} />
          ) : logs.length === 0 ? (
            <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {logs.slice(0, 50).map((log) => (
                <li key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {log.channel.toUpperCase()}
                      {log.subject ? ` — ${log.subject}` : ''}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(log.requestedAt).toLocaleString('fr-FR')}
                      {log.errorMessage ? ` · ${log.errorMessage}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {log.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
