import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Calendar,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
  FileText,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useResolvedStoredUrl } from '@/hooks/useResolvedStoredUrl';
import { useMobileShell } from '@/hooks/useMobileShell';
import { presenceTodayFromAbsences, type PresenceToday } from '@/lib/presenceToday';
import type { StrkAbsence } from '@/services/strkAbsenceService';
import { cn } from '@/lib/utils';

export type SuiviToHandleItem = {
  id: string;
  title: string;
  href: string;
  tone: 'amber' | 'rose' | 'blue';
};

type SuiviAction = {
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
};

/** Raccourcis élève (sans Message — déjà en bottom nav). */
const STUDENT_ACTIONS: SuiviAction[] = [
  { label: 'Emploi du temps', hint: 'Horaires & salles', href: '/calendar', icon: Calendar },
  { label: 'Matières', hint: 'Cours & contenus', href: '/my-courses', icon: BookOpen },
  { label: 'Notes', href: '/my-grades', icon: GraduationCap },
  { label: 'Absences', href: '/my-absences', icon: ClipboardCheck },
  { label: 'Devoirs', href: '/assignments', icon: FileText },
];

type StudentSuiviMobileViewProps = {
  headerTitle: string;
  firstName: string;
  lastName: string;
  className?: string | null;
  profileImage?: string | null;
  absences: StrkAbsence[];
  absencesLoading?: boolean;
  messageHref?: string;
  messageLabel?: string;
  /**
   * `student` : grille raccourcis (EDT, matières, notes…).
   * `message` : CTA unique « Envoyer un message » (parent).
   */
  actionsMode?: 'student' | 'message';
  /** Mini « À traiter » sous la présence (élève). */
  toHandle?: SuiviToHandleItem[];
  backHref?: string;
  classNameOuter?: string;
};

const initials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';

const presenceCopy = (
  firstName: string,
  status: PresenceToday
): { title: string; body: string; badge: string; tone: 'ok' | 'warn' | 'bad' } => {
  if (status.kind === 'absent') {
    return {
      title: 'Absence enregistrée',
      body: status.timeLabel
        ? `${firstName} est absent(e) aujourd’hui depuis ${status.timeLabel}`
        : `${firstName} est absent(e) aujourd’hui`,
      badge: status.timeLabel ? `Aujourd’hui à ${status.timeLabel}` : 'Aujourd’hui',
      tone: 'bad',
    };
  }
  if (status.kind === 'late') {
    return {
      title: 'Retard enregistré',
      body: status.timeLabel
        ? `${firstName} est en retard aujourd’hui (${status.timeLabel})`
        : `${firstName} est en retard aujourd’hui`,
      badge: status.timeLabel ? `Aujourd’hui à ${status.timeLabel}` : 'Aujourd’hui',
      tone: 'warn',
    };
  }
  return {
    title: 'Présence confirmée',
    body: status.timeLabel
      ? `${firstName} est présent(e) aujourd’hui à ${status.timeLabel}`
      : `${firstName} est présent(e) aujourd’hui`,
    badge: status.timeLabel ? `Aujourd’hui à ${status.timeLabel}` : 'Aujourd’hui',
    tone: 'ok',
  };
};

const ActionTile = ({ label, hint, href, icon: Icon }: SuiviAction) => (
  <Link
    to={href}
    className="flex min-h-[5.5rem] flex-col items-start justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-colors hover:bg-slate-50"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
      <Icon className="h-5 w-5" aria-hidden />
    </span>
    <span className="text-left">
      <span className="block text-sm font-semibold leading-tight text-slate-900">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
    </span>
  </Link>
);

/**
 * Écran Suivi mobile : header bleu, avatar, présence, À traiter, raccourcis.
 */
export const StudentSuiviMobileView = ({
  headerTitle,
  firstName,
  lastName,
  className,
  profileImage,
  absences,
  absencesLoading,
  messageHref = '/messages',
  messageLabel = 'Envoyer un message',
  actionsMode = 'message',
  toHandle = [],
  backHref = '/dashboard',
  classNameOuter,
}: StudentSuiviMobileViewProps) => {
  const navigate = useNavigate();
  const { openMoreMenu } = useMobileShell();
  const avatarUrl = useResolvedStoredUrl(profileImage);
  const status = presenceTodayFromAbsences(absences);
  const copy = presenceCopy(firstName || 'L’élève', status);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(backHref);
  };

  return (
    <div className={cn('space-y-4', classNameOuter)}>
      <header className="-mx-4 -mt-6 bg-blue-600 text-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-2xl">
        <div className="flex items-center gap-2 px-2 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-4 md:pt-3">
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Retour"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-lg font-semibold tracking-tight">
            {headerTitle}
          </h1>
          <button
            type="button"
            onClick={openMoreMenu}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:hidden"
            aria-label="Menu"
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </button>
          <span className="hidden h-11 w-11 shrink-0 md:block" aria-hidden />
        </div>
      </header>

      <div className="flex flex-col items-center pt-1 text-center">
        <Avatar className="h-24 w-24 border-4 border-white shadow-md ring-1 ring-slate-200/80">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
          <AvatarFallback className="bg-blue-100 text-xl font-semibold text-blue-700">
            {initials(firstName, lastName)}
          </AvatarFallback>
        </Avatar>
        <p className="mt-3 text-xl font-bold text-slate-900">{fullName}</p>
        <p className="mt-0.5 text-sm font-medium text-blue-600">
          {className?.trim() || 'Classe non assignée'}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-6 text-center shadow-sm">
        {absencesLoading ? (
          <p className="text-sm text-slate-500">Chargement de la présence…</p>
        ) : (
          <>
            <div
              className={cn(
                'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
                copy.tone === 'ok' && 'bg-emerald-500 text-white',
                copy.tone === 'warn' && 'bg-amber-100 text-amber-600',
                copy.tone === 'bad' && 'bg-rose-100 text-rose-600'
              )}
            >
              {copy.tone === 'ok' && <CheckCircle2 className="h-8 w-8" strokeWidth={2.5} aria-hidden />}
              {copy.tone === 'warn' && <Clock className="h-8 w-8" aria-hidden />}
              {copy.tone === 'bad' && <AlertTriangle className="h-8 w-8" aria-hidden />}
            </div>
            <p
              className={cn(
                'mt-3 text-lg font-bold',
                copy.tone === 'ok' && 'text-emerald-600',
                copy.tone === 'warn' && 'text-amber-700',
                copy.tone === 'bad' && 'text-rose-700'
              )}
            >
              {copy.title}
            </p>
            <p className="mt-1 text-sm text-slate-600">{copy.body}</p>
            <span
              className={cn(
                'mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                copy.tone === 'ok' && 'bg-emerald-50 text-emerald-700',
                copy.tone === 'warn' && 'bg-amber-50 text-amber-800',
                copy.tone === 'bad' && 'bg-rose-50 text-rose-700'
              )}
            >
              {copy.badge}
            </span>
          </>
        )}
      </div>

      {actionsMode === 'student' && toHandle.length > 0 ? (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
          aria-label="À traiter"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            À traiter
          </p>
          <ul className="mt-1 divide-y divide-slate-100">
            {toHandle.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:bg-slate-50/80"
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      item.tone === 'amber' && 'bg-amber-100 text-amber-800',
                      item.tone === 'rose' && 'bg-rose-100 text-rose-700',
                      item.tone === 'blue' && 'bg-blue-100 text-blue-700'
                    )}
                  >
                    {item.tone === 'amber' ? (
                      <FileText className="h-4 w-4" aria-hidden />
                    ) : item.tone === 'rose' ? (
                      <AlertCircle className="h-4 w-4" aria-hidden />
                    ) : (
                      <MessageSquare className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                    {item.title}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actionsMode === 'student' ? (
        <nav className="grid grid-cols-2 gap-2.5" aria-label="Raccourcis">
          {STUDENT_ACTIONS.map((action) => (
            <ActionTile key={action.href} {...action} />
          ))}
        </nav>
      ) : (
        <nav className="space-y-2" aria-label="Raccourcis">
          <Link
            to={messageHref}
            className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <MessageSquare className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex-1 text-left text-sm font-semibold text-slate-900">
              {messageLabel}
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
          </Link>
        </nav>
      )}
    </div>
  );
};
