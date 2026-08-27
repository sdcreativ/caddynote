import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Headphones, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { fetchUnreadNotifications, markNotificationAsRead } from '@/services/strkNotificationService';
import { fetchContactOpsMessages, type ContactOpsMessage } from '@/services/strkSupportService';
import { cn } from '@/lib/utils';

const DEMO_SUBJECT_RE = /d[eé]mo|d[eé]monstration|pr[eé]sentation|essai/i;
const POLL_MS = 20_000;

type NormalizedNotif = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  createdAt: string;
  kind?: string;
};

const normalizeNotif = (raw: Record<string, unknown>): NormalizedNotif => {
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, unknown>;
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    read: Boolean(raw.read ?? raw.read_at),
    actionUrl: (raw.actionUrl as string | undefined) || (raw.action_url as string | undefined),
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    kind: typeof data.kind === 'string' ? data.kind : undefined,
  };
};

const isDemoContact = (m: ContactOpsMessage) => DEMO_SUBJECT_RE.test(m.subject);

export type SuperAdminNotificationsBellProps = {
  onOpenSupportOps?: () => void;
  onDemoCountChange?: (count: number) => void;
  className?: string;
  /** `icon` = cloche compacte (navbar dashboard) ; `button` = libellé + badge (Super Admin). */
  variant?: 'button' | 'icon';
};

/**
 * Cloche Notifications Super Admin — badge visible + résumé « N demande(s) de démo ».
 */
export const SuperAdminNotificationsBell = ({
  onOpenSupportOps,
  onDemoCountChange,
  className,
  variant = 'button',
}: SuperAdminNotificationsBellProps) => {
  const { t } = useTranslation('superAdmin');
  const { user } = useStrkAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<ContactOpsMessage[]>([]);
  const [unread, setUnread] = useState<NormalizedNotif[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const [contactsSettled, notifsSettled] = await Promise.allSettled([
      fetchContactOpsMessages('new'),
      fetchUnreadNotifications(user.id),
    ]);
    if (contactsSettled.status === 'fulfilled') {
      setContacts(contactsSettled.value);
    }
    if (notifsSettled.status === 'fulfilled') {
      setUnread(
        (notifsSettled.value as unknown as Record<string, unknown>[]).map(normalizeNotif).filter((n) => !n.read)
      );
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const demoContacts = useMemo(() => contacts.filter(isDemoContact), [contacts]);
  const otherContacts = useMemo(() => contacts.filter((m) => !isDemoContact(m)), [contacts]);
  const demoCount = demoContacts.length;

  useEffect(() => {
    onDemoCountChange?.(demoCount);
  }, [demoCount, onDemoCountChange]);

  const badgeCount = demoCount > 0 ? demoCount : contacts.length > 0 ? contacts.length : unread.length;

  const goSupportOps = () => {
    setOpen(false);
    if (onOpenSupportOps) onOpenSupportOps();
    else navigate('/super-admin/support-ops');
  };

  const openNotif = async (n: NormalizedNotif) => {
    try {
      await markNotificationAsRead(n.id);
    } catch {
      /* best-effort */
    }
    setUnread((prev) => prev.filter((x) => x.id !== n.id));
    setOpen(false);
    if (n.actionUrl?.includes('support-ops') || n.kind === 'demo_request') {
      goSupportOps();
      return;
    }
    if (n.actionUrl) navigate(n.actionUrl);
  };

  const ariaLabel =
    demoCount > 0
      ? t('notificationsBell.demoAria', { count: demoCount })
      : badgeCount > 0
        ? t('notificationsBell.ariaCount', { count: badgeCount })
        : t('notificationsBell.aria');

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('relative rounded-full text-slate-600', className)}
            aria-label={ariaLabel}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {badgeCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-white">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ) : null}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'relative gap-2 rounded-full border-slate-200 bg-white px-3 font-medium text-slate-700 shadow-sm',
              className
            )}
            aria-label={ariaLabel}
          >
            <Bell className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t('notificationsBell.label')}</span>
            {badgeCount > 0 ? (
              <Badge
                variant="destructive"
                className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px] tabular-nums"
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </Badge>
            ) : null}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] rounded-2xl p-2">
        <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5">
          <span className="text-base font-semibold">{t('notificationsBell.label')}</span>
          {badgeCount > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {badgeCount}
            </Badge>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {demoCount > 0 ? (
          <DropdownMenuItem
            className="cursor-pointer rounded-xl px-2 py-3"
            onClick={goSupportOps}
          >
            <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {t('notificationsBell.demoSummary', { count: demoCount })}
              </p>
              <p className="truncate text-xs text-slate-500">
                {demoContacts[0]?.name} — {demoContacts[0]?.subject}
              </p>
            </div>
          </DropdownMenuItem>
        ) : null}

        {otherContacts.length > 0 ? (
          <DropdownMenuItem className="cursor-pointer rounded-xl px-2 py-2.5" onClick={goSupportOps}>
            <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <Headphones className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {t('notificationsBell.contactSummary', { count: otherContacts.length })}
              </p>
              <p className="truncate text-xs text-slate-500">{otherContacts[0]?.subject}</p>
            </div>
          </DropdownMenuItem>
        ) : null}

        {demoCount > 0 || otherContacts.length > 0 ? <DropdownMenuSeparator /> : null}

        {unread.length === 0 && contacts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">{t('notificationsBell.empty')}</p>
        ) : (
          unread.slice(0, 6).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="cursor-pointer rounded-xl px-2 py-2.5"
              onClick={() => void openNotif(n)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="truncate text-xs text-slate-500">{n.message}</p>
              </div>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer rounded-xl px-2 py-2.5 font-medium" onClick={goSupportOps}>
          {t('notificationsBell.openSupportOps')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SuperAdminNotificationsBell;
