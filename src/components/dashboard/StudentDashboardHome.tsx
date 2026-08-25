import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  AlertCircle,
  BookOpen,
  MessageSquare,
  ClipboardCheck,
  ChevronRight,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { roleLabel } from '@/lib/navConfig';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type StudentDashboardHomeProps = {
  userName: string;
  grades: number | null;
  absences: number | null;
  homework: number | null;
  state: LoadState;
};

type ToHandleItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  tone: 'amber' | 'rose';
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil élève — cockpit deux clics :
 * À traiter → Pulsation (KPI) → CTA + raccourcis.
 */
const StudentDashboardHome = ({
  userName,
  grades,
  absences,
  homework,
  state,
}: StudentDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const homeworkCount = state === 'ready' || state === 'empty' ? Number(homework ?? 0) : 0;
  const absenceCount = state === 'ready' || state === 'empty' ? Number(absences ?? 0) : 0;
  const hasHomework = state === 'ready' && homeworkCount > 0;
  const hasAbsences = state === 'ready' && absenceCount > 0;

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

  const primaryCta = hasHomework
    ? {
        label: t('studentMobile.primaryCtaHomework'),
        href: '/assignments',
        icon: <BookOpen aria-hidden />,
      }
    : {
        label: t('studentMobile.primaryCta'),
        href: '/my-grades',
        icon: <GraduationCap aria-hidden />,
      };

  if (state === 'error') {
    return (
      <div className="space-y-6 py-4 animate-fade-in md:py-6">
        <header className="space-y-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
            {t('hello', { name: userName })}
          </h1>
        </header>
        <EmptyState title={t('empty.loadErrorTitle')} description={t('empty.loadErrorBody')} />
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-slate-500">
          {roleLabel('student')} • {dateLabel}
        </p>
      </header>

      {/* Q1 — À traiter */}
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
                      item.tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {item.tone === 'amber' ? (
                      <BookOpen className="h-5 w-5" aria-hidden />
                    ) : (
                      <AlertCircle className="h-5 w-5" aria-hidden />
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

      {/* Q2 — Pulsation */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.grades')}
          value={String(kpiValue(state, grades))}
          tone="blue"
          hint={state === 'empty' ? t('empty.studentNoGrades') : undefined}
        />
        <MobileCompactStat
          title={t('stats.homework')}
          value={String(kpiValue(state, homework))}
          tone="amber"
          hint={state === 'empty' ? t('empty.studentNoHomework') : undefined}
        />
        <MobileCompactStat
          title={t('stats.absences30d')}
          value={String(kpiValue(state, absences))}
          tone="rose"
        />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-3">
        <StatCard
          title={t('stats.grades')}
          value={kpiValue(state, grades)}
          description={state === 'empty' ? t('empty.studentNoGrades') : undefined}
          icon={<GraduationCap className="h-5 w-5" />}
        />
        <StatCard
          title={t('stats.absences30d')}
          value={kpiValue(state, absences)}
          icon={<AlertCircle className="h-5 w-5" />}
          color="red"
        />
        <StatCard
          title={t('stats.homework')}
          value={kpiValue(state, homework)}
          description={state === 'empty' ? t('empty.studentNoHomework') : undefined}
          icon={<BookOpen className="h-5 w-5" />}
        />
      </div>

      {/* Q3 — Deux clics */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('studentMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={primaryCta.label}
          icon={primaryCta.icon}
          onClick={() => navigate(primaryCta.href)}
        />
        <p className="sr-only">{t('studentMobile.primaryCtaHint')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MobileQuickTile
            label={t('quickActions.myGrades')}
            icon={<GraduationCap aria-hidden />}
            onClick={() => navigate('/my-grades')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.homework')}
            icon={<BookOpen aria-hidden />}
            onClick={() => navigate('/assignments')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.absences')}
            icon={<ClipboardCheck aria-hidden />}
            onClick={() => navigate('/my-absences')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.messages')}
            icon={<MessageSquare aria-hidden />}
            onClick={() => navigate('/messages')}
            className="md:min-h-[5.5rem]"
          />
        </div>
      </div>
    </div>
  );
};

export default StudentDashboardHome;
