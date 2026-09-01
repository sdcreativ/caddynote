import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useResolvedStoredUrl } from '@/hooks/useResolvedStoredUrl';
import { useMobileShell } from '@/hooks/useMobileShell';
import { presenceTodayFromAbsences, type PresenceToday } from '@/lib/presenceToday';
import type { StrkAbsence } from '@/services/strkAbsenceService';
import { cn } from '@/lib/utils';

type StudentSuiviMobileViewProps = {
  /** Titre bandeau (ex. « Suivi de Koffi »). */
  headerTitle: string;
  firstName: string;
  lastName: string;
  className?: string | null;
  profileImage?: string | null;
  absences: StrkAbsence[];
  absencesLoading?: boolean;
  messageHref?: string;
  messageLabel?: string;
  /** Retour (défaut : /dashboard). */
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

/**
 * Écran Suivi mobile (maquette) : header bleu ← / titre / ⋮,
 * avatar, carte présence, CTA message.
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
          {/* Équilibre visuelle desktop (pas de ⋮) */}
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

      <Link
        to={messageHref}
        className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm transition-colors hover:bg-slate-50"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
          <MessageSquare className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex-1 text-left text-sm font-semibold text-slate-900">{messageLabel}</span>
        <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
      </Link>
    </div>
  );
};
