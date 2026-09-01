import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Send,
  Search,
  Plus,
  Mail,
  Reply,
  Paperclip,
  X,
  Download,
  ChevronLeft,
} from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  sendMessage,
  fetchReceivedMessages,
  fetchSentMessages,
  markMessageAsRead,
  fetchMessagableUsers,
} from '@/services/strkMessageService';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { StrkMessage } from '@/types/strk';
import { uploadViaPresignedPost } from '@/lib/s3Upload';
import { cn } from '@/lib/utils';

type MessageContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

const contactLabel = (c: MessageContact) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || c.id;

const MessagesPage = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [messages, setMessages] = useState<StrkMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<StrkMessage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [newMessage, setNewMessage] = useState({
    recipient_id: '',
    subject: '',
    content: '',
    message_type: 'general',
    priority: 'normal',
  });
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    try {
      const data =
        activeTab === 'received'
          ? await fetchReceivedMessages(user.id)
          : await fetchSentMessages(user.id);
      setMessages(data);
    } catch {
      toast({
        title: tc('status.error'),
        description: t('loadError'),
        variant: 'destructive',
      });
    }
  }, [activeTab, user, toast, t, tc]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!user || !isComposeOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const users = (await fetchMessagableUsers(user.id)) as MessageContact[];
        if (!cancelled) setContacts(users);
      } catch {
        if (!cancelled) setContacts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isComposeOpen]);

  const resetCompose = () => {
    setComposeFiles([]);
    setNewMessage({
      recipient_id: '',
      subject: '',
      content: '',
      message_type: 'general',
      priority: 'normal',
    });
  };

  const handleSendMessage = async () => {
    if (!user) return;
    if (!newMessage.recipient_id || !newMessage.subject.trim() || !newMessage.content.trim()) {
      toast({
        title: tc('status.error'),
        description: t('sendError'),
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const attachmentKeys: string[] = [];
      for (const file of composeFiles) {
        attachmentKeys.push(await uploadViaPresignedPost('messages', file));
      }

      await sendMessage({
        recipientId: newMessage.recipient_id,
        subject: newMessage.subject,
        content: newMessage.content,
        messageType: newMessage.message_type,
        priority: newMessage.priority,
        attachments: attachmentKeys,
      });

      toast({
        title: t('sentTitle'),
        description: t('sentBody'),
      });

      setIsComposeOpen(false);
      resetCompose();
      void loadMessages();
    } catch {
      toast({
        title: tc('status.error'),
        description: t('sendError'),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const openAttachment = async (key: string) => {
    try {
      const { requestStoredFileDownload, openStoredFile } = await import('@/lib/storedFileAccess');
      await openStoredFile(await requestStoredFileDownload(key));
    } catch {
      toast({
        title: tc('status.error'),
        description: t('loadError'),
        variant: 'destructive',
      });
    }
  };

  const attachmentKeys = (message: StrkMessage): string[] => {
    const raw = message.attachments;
    if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === 'string');
    return [];
  };

  const handleMarkAsRead = async (messageId: string) => {
    try {
      await markMessageAsRead(messageId);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, read_at: new Date().toISOString() } : msg
        )
      );
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const filteredMessages = messages.filter(
    (message) =>
      message.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unreadCount = messages.filter((msg) => !msg.read_at && activeTab === 'received').length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const priorityLabel = (priority: string) => {
    const key = priority as 'low' | 'normal' | 'high' | 'urgent';
    return t(`priorities.${key}`, { defaultValue: priority });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 1) {
      return t('todayAt', { time });
    }
    if (diffDays === 2) {
      return t('yesterdayAt', { time });
    }
    if (diffDays <= 7) {
      return t('daysAgo', { count: diffDays - 1 });
    }
    return date.toLocaleDateString('fr-FR');
  };

  const composeForm = (
    <div className="space-y-4 py-2 md:py-4">
      <div className="space-y-2">
        <Label htmlFor="recipient">{t('recipient')}</Label>
        <Select
          value={newMessage.recipient_id || undefined}
          onValueChange={(value) => setNewMessage({ ...newMessage, recipient_id: value })}
        >
          <SelectTrigger id="recipient" className="h-11 rounded-xl">
            <SelectValue placeholder={t('recipientPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {contacts.length === 0 ? (
              <SelectItem value="__none" disabled>
                {t('recipientEmpty')}
              </SelectItem>
            ) : (
              contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {contactLabel(c)}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="message_type">{t('messageType')}</Label>
          <Select
            value={newMessage.message_type}
            onValueChange={(value) => setNewMessage({ ...newMessage, message_type: value })}
          >
            <SelectTrigger id="message_type" className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">{t('types.general')}</SelectItem>
              <SelectItem value="urgent">{t('types.urgent')}</SelectItem>
              <SelectItem value="academic">{t('types.academic')}</SelectItem>
              <SelectItem value="administrative">{t('types.administrative')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">{t('priority')}</Label>
          <Select
            value={newMessage.priority}
            onValueChange={(value) => setNewMessage({ ...newMessage, priority: value })}
          >
            <SelectTrigger id="priority" className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t('priorities.low')}</SelectItem>
              <SelectItem value="normal">{t('priorities.normal')}</SelectItem>
              <SelectItem value="high">{t('priorities.high')}</SelectItem>
              <SelectItem value="urgent">{t('priorities.urgent')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">{t('subject')}</Label>
        <Input
          id="subject"
          value={newMessage.subject}
          onChange={(e) => setNewMessage({ ...newMessage, subject: e.target.value })}
          placeholder={t('subjectPlaceholder')}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">{t('content')}</Label>
        <Textarea
          id="content"
          value={newMessage.content}
          onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
          placeholder={t('contentPlaceholder')}
          rows={6}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="attachments">{t('attachments')}</Label>
        <Input
          id="attachments"
          type="file"
          accept=".pdf,.jpeg,.jpg,.png,.webp"
          multiple
          className="rounded-xl"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 5);
            setComposeFiles(files);
          }}
        />
        {composeFiles.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {composeFiles.map((f) => (
              <li key={f.name} className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="ml-auto"
                  onClick={() => setComposeFiles((prev) => prev.filter((x) => x !== f))}
                  aria-label="Retirer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        onClick={() => void handleSendMessage()}
        className="h-11 w-full rounded-xl bg-blue-600 hover:bg-blue-700"
        disabled={sending}
      >
        <Send className="mr-2 h-4 w-4" />
        {sending ? t('sending') : t('send')}
      </Button>
    </div>
  );

  const composeTriggerButton = (className?: string) => (
    <Button className={cn('h-11 rounded-xl bg-blue-600 shadow-sm hover:bg-blue-700', className)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('compose')}
    </Button>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* En-tête : empilé sur mobile, côte à côte ≥ md */}
      <div
        className={cn(
          'flex flex-col gap-3',
          selectedMessage
            ? 'hidden md:flex md:flex-row md:items-start md:justify-between'
            : 'md:flex-row md:items-start md:justify-between'
        )}
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm leading-snug text-slate-500 md:text-base">{t('subtitle')}</p>
        </div>

        <Dialog
          open={isComposeOpen}
          onOpenChange={(open) => {
            setIsComposeOpen(open);
            if (!open) resetCompose();
          }}
        >
          <DialogTrigger asChild>{composeTriggerButton('w-full md:w-auto')}</DialogTrigger>
          <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl p-4 sm:max-w-[600px] sm:p-6">
            <DialogHeader>
              <DialogTitle>{t('compose')}</DialogTitle>
            </DialogHeader>
            {composeForm}
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Liste — masquée sur mobile quand un détail est ouvert */}
        <div className={cn('min-w-0 flex-1 space-y-3 md:space-y-4', selectedMessage ? 'hidden lg:block' : 'block')}>
          <div className="flex w-full rounded-xl bg-slate-100/90 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('received');
                setSelectedMessage(null);
              }}
              className={cn(
                'relative flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                activeTab === 'received'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              )}
            >
              <Mail className="h-4 w-4" aria-hidden />
              {t('received')}
              {unreadCount > 0 ? (
                <Badge
                  variant="destructive"
                  className={cn(
                    'h-5 min-w-5 rounded-full px-1.5 text-[10px]',
                    activeTab === 'received' && 'bg-white text-blue-700 hover:bg-white'
                  )}
                >
                  {unreadCount}
                </Badge>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('sent');
                setSelectedMessage(null);
              }}
              className={cn(
                'flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors',
                activeTab === 'sent'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              )}
            >
              <Send className="h-4 w-4" aria-hidden />
              {t('sent')}
            </button>
          </div>

          <div className="relative w-full min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 w-full rounded-xl border-slate-200 bg-white pl-10 shadow-none"
            />
          </div>

          <div className="space-y-2">
            {filteredMessages.map((message) => (
              <button
                key={message.id}
                type="button"
                className={cn(
                  'w-full rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50',
                  selectedMessage?.id === message.id && 'ring-2 ring-blue-500',
                  !message.read_at && activeTab === 'received' && 'border-l-4 border-l-blue-600'
                )}
                onClick={() => {
                  setSelectedMessage(message);
                  if (!message.read_at && activeTab === 'received') {
                    void handleMarkAsRead(message.id);
                  }
                }}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-blue-50 text-sm font-semibold text-blue-700">
                        {activeTab === 'received' ? 'E' : 'M'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'truncate text-sm text-slate-900',
                            !message.read_at && activeTab === 'received'
                              ? 'font-bold'
                              : 'font-semibold'
                          )}
                        >
                          {message.subject}
                        </span>
                        <Badge variant="outline" className={getPriorityColor(message.priority)}>
                          {priorityLabel(message.priority)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{message.content}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">{formatDate(message.created_at)}</p>
                    {!message.read_at && activeTab === 'received' ? (
                      <div className="ml-auto mt-1.5 h-2 w-2 rounded-full bg-blue-600" />
                    ) : null}
                  </div>
                </div>
              </button>
            ))}

            {filteredMessages.length === 0 && (
              <Card className="rounded-2xl border-slate-200/80 shadow-sm">
                <CardContent className="px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                    <MessageSquare className="h-7 w-7 text-slate-400" aria-hidden />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold text-slate-900">{t('emptyTitle')}</h3>
                  <p className="mx-auto max-w-xs text-sm text-slate-500">
                    {searchTerm
                      ? t('emptySearch')
                      : activeTab === 'received'
                        ? t('emptyReceived')
                        : t('emptySent')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Détail — plein écran sur mobile, colonne fixe ≥ lg */}
        {selectedMessage ? (
          <Card className="w-full min-w-0 shrink-0 overflow-hidden rounded-2xl border-slate-200/80 shadow-sm lg:w-96 lg:max-w-[24rem]">
            <CardHeader className="space-y-3 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 h-10 w-10 shrink-0 rounded-full lg:hidden"
                  aria-label={t('backToList')}
                  onClick={() => setSelectedMessage(null)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <CardTitle className="min-w-0 flex-1 text-lg leading-snug">
                  {selectedMessage.subject}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Répondre"
                  className="hidden h-10 w-10 shrink-0 sm:inline-flex"
                >
                  <Reply className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden h-10 w-10 shrink-0 lg:inline-flex"
                  aria-label={tc('actions.close')}
                  onClick={() => setSelectedMessage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{formatDate(selectedMessage.created_at)}</span>
                <Badge variant="outline" className={getPriorityColor(selectedMessage.priority)}>
                  {priorityLabel(selectedMessage.priority)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap text-slate-700">{selectedMessage.content}</p>
                </div>
                {selectedMessage.message_type !== 'general' ? (
                  <Badge variant="secondary">{selectedMessage.message_type}</Badge>
                ) : null}
                {attachmentKeys(selectedMessage).length > 0 ? (
                  <ul className="space-y-2 border-t pt-3">
                    {attachmentKeys(selectedMessage).map((key) => (
                      <li key={key}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-11 w-full justify-start rounded-xl"
                          onClick={() => void openAttachment(key)}
                        >
                          <Download className="mr-2 h-3.5 w-3.5" />
                          <span className="truncate">{key.split('/').pop() ?? key}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default MessagesPage;
