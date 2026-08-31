import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Search, Plus, Mail, Reply, Archive, Paperclip, X, Download } from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { sendMessage, fetchReceivedMessages, fetchSentMessages, markMessageAsRead } from "@/services/strkMessageService";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import { StrkMessage } from "@/types/strk";
import { uploadViaPresignedPost } from "@/lib/s3Upload";
import { apiClient } from "@/lib/apiClient";

const MessagesPage = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const { t } = useTranslation('messages');
  const { t: tc } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [messages, setMessages] = useState<StrkMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<StrkMessage | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [newMessage, setNewMessage] = useState({
    recipient_id: "",
    subject: "",
    content: "",
    message_type: "general",
    priority: "normal"
  });
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
  }, [activeTab, user]);

  const loadMessages = async () => {
    if (!user) return;
    
    try {
      let data: StrkMessage[] = [];
      if (activeTab === 'received') {
        data = await fetchReceivedMessages(user.id);
      } else {
        data = await fetchSentMessages(user.id);
      }
      setMessages(data);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: t('loadError'),
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!user) return;
    if (!newMessage.recipient_id || !newMessage.subject.trim() || !newMessage.content.trim()) {
      toast({
        title: tc('status.error'),
        description: t('sendError'),
        variant: "destructive",
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
      setComposeFiles([]);
      setNewMessage({
        recipient_id: "",
        subject: "",
        content: "",
        message_type: "general",
        priority: "normal"
      });
      loadMessages();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: t('sendError'),
        variant: "destructive",
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
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, read_at: new Date().toISOString() } : msg
        )
      );
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  };

  const filteredMessages = messages.filter(message =>
    message.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    message.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unreadCount = messages.filter(msg => !msg.read_at && activeTab === 'received').length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 1) {
      return t('todayAt', { time });
    } else if (diffDays === 2) {
      return t('yesterdayAt', { time });
    } else if (diffDays <= 7) {
      return t('daysAgo', { count: diffDays - 1 });
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('compose')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t('compose')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="message_type">{t('messageType')}</Label>
                  <Select value={newMessage.message_type} onValueChange={(value) => setNewMessage({ ...newMessage, message_type: value })}>
                    <SelectTrigger>
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
                  <Select value={newMessage.priority} onValueChange={(value) => setNewMessage({ ...newMessage, priority: value })}>
                    <SelectTrigger>
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="attachments">Pièces jointes (PDF / images, max 5)</Label>
                <Input
                  id="attachments"
                  type="file"
                  accept=".pdf,.jpeg,.jpg,.png,.webp"
                  multiple
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
              <Button onClick={handleSendMessage} className="w-full" disabled={sending}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? 'Envoi…' : t('send')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Liste — masquée sur mobile quand un détail est ouvert */}
        <div
          className={`min-w-0 flex-1 space-y-4 ${selectedMessage ? 'hidden lg:block' : 'block'}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full space-x-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-auto">
              <Button
                variant={activeTab === 'received' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('received')}
                className="relative shrink-0"
              >
                <Mail className="mr-2 h-4 w-4" />
                {t('received')}
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant={activeTab === 'sent' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('sent')}
                className="shrink-0"
              >
                <Send className="mr-2 h-4 w-4" />
                {t('sent')}
              </Button>
            </div>
            <div className="relative w-full min-w-0 sm:max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredMessages.map((message) => (
              <Card
                key={message.id}
                className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                  selectedMessage?.id === message.id ? 'ring-2 ring-primary' : ''
                } ${
                  !message.read_at && activeTab === 'received' ? 'border-l-4 border-l-primary' : ''
                }`}
                onClick={() => {
                  setSelectedMessage(message);
                  if (!message.read_at && activeTab === 'received') {
                    handleMarkAsRead(message.id);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center space-x-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback>
                          {activeTab === 'received' ? 'E' : 'M'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`truncate font-medium ${
                              !message.read_at && activeTab === 'received' ? 'font-bold' : ''
                            }`}
                          >
                            {message.subject}
                          </span>
                          <Badge variant="outline" className={getPriorityColor(message.priority)}>
                            {message.priority}
                          </Badge>
                        </div>
                        <p className="line-clamp-1 text-sm text-muted-foreground">
                          {message.content}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(message.created_at)}
                      </p>
                      {!message.read_at && activeTab === 'received' && (
                        <div className="ml-auto mt-1 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}

            {filteredMessages.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium">{t('emptyTitle')}</h3>
                  <p className="text-muted-foreground">
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
        {selectedMessage && (
          <Card className="w-full min-w-0 shrink-0 lg:w-96 lg:max-w-[24rem]">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="min-w-0 text-lg leading-snug">{selectedMessage.subject}</CardTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label="Répondre" className="hidden sm:inline-flex">
                    <Reply className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label={tc('actions.close')}
                    onClick={() => setSelectedMessage(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{formatDate(selectedMessage.created_at)}</span>
                <Badge variant="outline" className={getPriorityColor(selectedMessage.priority)}>
                  {selectedMessage.priority}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap">{selectedMessage.content}</p>
                </div>
                {selectedMessage.message_type !== 'general' && (
                  <Badge variant="secondary">{selectedMessage.message_type}</Badge>
                )}
                {attachmentKeys(selectedMessage).length > 0 ? (
                  <ul className="space-y-2 border-t pt-3">
                    {attachmentKeys(selectedMessage).map((key) => (
                      <li key={key}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => openAttachment(key)}
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
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
