import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Clock, MessageSquare, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useResolvedStoredUrl } from '@/hooks/useResolvedStoredUrl';
import { presenceTodayFromAbsences, type PresenceToday } from '@/lib/presenceToday';
import type { StrkAbsence } from '@/services/strkAbsenceService';
import { cn } from '@/lib/utils';

type StudentSuiviMobileViewProps = {
  /** Titre bandeau (ex. « Suivi de Koffi » / « Mon suivi »). */
  headerTitle: string;
  firstName: string;
  lastName: string;
  className?: string | null;
  profileImage?: string | null;
  absences: StrkAbsence[];
  absencesLoading?: boolean;
  messageHref?: string;
  messageLabel?: string;
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
    body: `${firstName} est présent(e) aujourd’hui`,
    badge: 'Aujourd’hui',
    tone: 'ok',
  };
};

/**
 * Bloc mobile « Suivi » (maquette parent/élève) :
 * bandeau titre + avatar + carte présence + CTA message.
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
  classNameOuter,
}: StudentSuiviMobileViewProps) => {
  const avatarUrl = useResolvedStoredUrl(profileImage);
  const status = presenceTodayFromAbsences(absences);
  const copy = presenceCopy(firstName || 'L’élève', status);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  return (
    <div className={cn('space-y-4', classNameOuter)}>
      <div className="-mx-4 -mt-2 bg-blue-600 px-4 pb-5 pt-3 text-white sm:-mx-6">
        <h1 className="text-center text-lg font-semibold tracking-tight">{headerTitle}</h1>
      </div>

      <div className="flex flex-col items-center pt-1 text-center">
        <Avatar className="h-20 w-20 border-4 border-white shadow-md ring-1 ring-slate-200/80">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={fullName} /> : null}
          <AvatarFallback className="bg-blue-100 text-lg font-semibold text-blue-700">
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
                copy.tone === 'ok' && 'bg-emerald-100 text-emerald-600',
                copy.tone === 'warn' && 'bg-amber-100 text-amber-600',
                copy.tone === 'bad' && 'bg-rose-100 text-rose-600'
              )}
            >
              {copy.tone === 'ok' && <CheckCircle2 className="h-8 w-8" aria-hidden />}
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
