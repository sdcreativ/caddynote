import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, BookOpen, ChevronRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { roleLabel } from '@/lib/navConfig';
import { dayGreetingKey } from '@/lib/dayGreeting';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type StudentDashboardHomeProps = {
  userName: string;
  /** Conservé pour compat Dashboard ; l’identité visuelle vit sur Suivi. */
  firstName?: string;
  lastName?: string;
  className?: string | null;
  profileImage?: string | null;
  absencesToday?: unknown[];
  absencesLoading?: boolean;
  /** Conservé pour compat ; les compteurs notes ne s’affichent plus ici. */
  grades?: number | null;
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

/**
 * Accueil élève : salut + priorités du jour (À traiter).
 * La présence et les raccourcis scolaires sont sur /my-suivi.
 */
const StudentDashboardHome = ({
  userName,
  absences,
  homework,
  unreadMessages = null,
  state,
}: StudentDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const homeworkCount = state === 'ready' || state === 'empty' ? Number(homework ?? 0) : 0;
  const absenceCount = state === 'ready' || state === 'empty' ? Number(absences ?? 0) : 0;
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
        <p className="text-sm text-slate-500">
          <Link to="/my-suivi" className="font-medium text-blue-700 underline-offset-2 hover:underline">
            {t('studentMobile.openSuivi', { defaultValue: 'Ouvrir mon suivi' })}
          </Link>
          <span className="text-slate-400"> — </span>
          {t('studentMobile.openSuiviHint', {
            defaultValue: 'présence, emploi du temps, notes et devoirs',
          })}
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.recent')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('studentMobile.toHandleTitle')}{' '}
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
    </div>
  );
};

export default StudentDashboardHome;
