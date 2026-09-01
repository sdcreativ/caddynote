import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  AlertCircle,
  BookOpen,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import { MobileCompactStat } from '@/components/dashboard/MobileActionPrimitives';
import { StudentPresenceProfile } from '@/components/suivi/StudentPresenceProfile';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { roleLabel } from '@/lib/navConfig';
import { dayGreetingKey } from '@/lib/dayGreeting';
import type { StrkAbsence } from '@/services/strkAbsenceService';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type StudentDashboardHomeProps = {
  userName: string;
  firstName?: string;
  lastName?: string;
  className?: string | null;
  profileImage?: string | null;
  /** Absences brutes (carte présence du jour). */
  absencesToday?: StrkAbsence[];
  absencesLoading?: boolean;
  grades: number | null;
  /** Compteur KPI absences 30 j. */
  absences: number | null;
  homework: number | null;
  unreadMessages?: number | null;
  state: LoadState;
};

type ToHandleItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  tone: 'amber' | 'rose' | 'blue';
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil élève : Bonjour + photo/présence + À traiter + KPI.
 */
const StudentDashboardHome = ({
  userName,
  firstName,
  lastName = '',
  className,
  profileImage,
  absencesToday = [],
  absencesLoading = false,
  grades,
  absences,
  homework,
  unreadMessages = null,
  state,
}: StudentDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const displayFirst = firstName?.trim() || userName;

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const homeworkCount = state === 'ready' || state === 'empty' ? Number(homework ?? 0) : 0;
  const absenceCount = state === 'ready' || state === 'empty' ? Number(absences ?? 0) : 0;
  const gradesCount = state === 'ready' || state === 'empty' ? Number(grades ?? 0) : 0;
  const unreadCount =
    state === 'ready' || state === 'empty' ? Number(unreadMessages ?? 0) : 0;
  const hasHomework = state === 'ready' && homeworkCount > 0;
  const hasAbsences = state === 'ready' && absenceCount > 0;
  const hasUnread = state === 'ready' && unreadCount > 0;

  const toHandle: ToHandleItem[] = [];
  if (hasHomework) {
    toHandle.push({
      id: 'homework',
      title: t('studentMobile.homeworkToHandle', { count: homeworkCount }),
      subtitle: t('stats.homework'),
      href: '/assignments',
      tone: 'amber',
    });
  }
  if (hasAbsences) {
    toHandle.push({
      id: 'absences',
      title: t('studentMobile.absencesToHandle', { count: absenceCount }),
      subtitle: t('stats.absences30d'),
      href: '/my-absences',
      tone: 'rose',
    });
  }
  if (hasUnread) {
    toHandle.push({
      id: 'messages',
      title: t('studentMobile.messagesToHandle', { count: unreadCount }),
      subtitle: t('studentMobile.messagesToHandleHint'),
      href: '/messages',
      tone: 'blue',
    });
  }

  const gradesHint =
    state === 'ready' || state === 'empty'
      ? gradesCount === 0
        ? t('empty.studentNoGrades')
        : undefined
      : undefined;
  const homeworkHint =
    state === 'ready' || state === 'empty'
      ? homeworkCount === 0
        ? t('empty.studentNoHomework')
        : undefined
      : undefined;

  if (state === 'error') {
    return (
      <div className="space-y-6 py-4 animate-fade-in md:py-6">
        <header className="space-y-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
            {t(dayGreetingKey(), { name: userName })}
          </h1>
        </header>
        <EmptyState title={t('empty.loadErrorTitle')} description={t('empty.loadErrorBody')} />
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-900 md:text-3xl">
          {t(dayGreetingKey(), { name: userName })}
        </h1>
        <p className="text-sm text-slate-500 md:text-base">
          {roleLabel('student')} • {dateLabel}
        </p>
      </header>

      <StudentPresenceProfile
        firstName={displayFirst}
        lastName={lastName}
        className={className}
        profileImage={profileImage}
        absences={absencesToday}
        absencesLoading={absencesLoading || state === 'loading' || state === 'idle'}
      />

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.section')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('alerts.recent')}{' '}
              <span className="text-slate-400">({toHandle.length})</span>
            </h2>
          </div>
          {toHandle.length > 0 ? (
            <Button asChild size="sm">
              <Link to={toHandle[0].href}>{t('alerts.primaryCta')}</Link>
            </Button>
          ) : null}
        </div>

        {toHandle.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {toHandle.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      item.tone === 'amber'
                        ? 'bg-amber-100 text-amber-800'
                        : item.tone === 'rose'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {item.tone === 'amber' ? (
                      <BookOpen className="h-5 w-5" aria-hidden />
                    ) : item.tone === 'rose' ? (
                      <AlertCircle className="h-5 w-5" aria-hidden />
                    ) : (
                      <MessageSquare className="h-5 w-5" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="truncate text-sm text-slate-500">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('alerts.emptyTitle')}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:hidden" data-testid="student-accueil-kpis">
        <MobileCompactStat
          title={t('stats.grades')}
          value={String(kpiValue(state, grades))}
          tone="blue"
          hint={gradesHint}
          onClick={() => navigate('/my-grades')}
        />
        <MobileCompactStat
          title={t('stats.homework')}
          value={String(kpiValue(state, homework))}
          tone="amber"
          hint={homeworkHint}
          onClick={() => navigate('/assignments')}
        />
        <MobileCompactStat
          title={t('stats.absences30d')}
          value={String(kpiValue(state, absences))}
          tone="rose"
          onClick={() => navigate('/my-absences')}
        />
      </div>

      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        <StatCard
          title={t('stats.grades')}
          value={kpiValue(state, grades)}
          description={gradesHint}
          icon={<GraduationCap className="h-5 w-5" />}
          onClick={() => navigate('/my-grades')}
        />
        <StatCard
          title={t('stats.homework')}
          value={kpiValue(state, homework)}
          description={homeworkHint}
          icon={<BookOpen className="h-5 w-5" />}
          onClick={() => navigate('/assignments')}
        />
        <StatCard
          title={t('stats.absences30d')}
          value={kpiValue(state, absences)}
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
          onClick={() => navigate('/my-absences')}
        />
      </div>
    </div>
  );
};

export default StudentDashboardHome;
