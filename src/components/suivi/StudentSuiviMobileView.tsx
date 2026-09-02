import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Calendar,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { useMobileShell } from '@/hooks/useMobileShell';
import { StudentPresenceProfile } from '@/components/suivi/StudentPresenceProfile';
import type { StrkAbsence } from '@/services/strkAbsenceService';
import { cn } from '@/lib/utils';

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
  /** `student` = grille scolaire ; `message` = CTA message (vue parent). */
  actionsMode?: 'student' | 'message';
  backHref?: string;
  classNameOuter?: string;
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
 * Écran Suivi : identité + présence du jour + raccourcis scolaires.
 * Les priorités « À traiter » restent sur l’Accueil (`/dashboard`).
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
  backHref = '/dashboard',
  classNameOuter,
}: StudentSuiviMobileViewProps) => {
  const navigate = useNavigate();
  const { openMoreMenu } = useMobileShell();

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

      <StudentPresenceProfile
        firstName={firstName}
        lastName={lastName}
        className={className}
        profileImage={profileImage}
        absences={absences}
        absencesLoading={absencesLoading}
      />

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
