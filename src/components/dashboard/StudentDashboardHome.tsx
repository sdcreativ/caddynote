import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  AlertCircle,
  BookOpen,
  MessageSquare,
  Calendar,
  ClipboardCheck,
} from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil élève — mobile P0 (CTA notes + KPI + grille) ;
 * desktop conserve la grille KPI + actions rapides.
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
    <div className="space-y-6 py-4 animate-fade-in md:space-y-6 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-base md:text-slate-500">
          {roleLabel('student')} • {dateLabel}
        </p>
        <p className="hidden text-sm text-slate-500 md:block">{t('roleHints.student')}</p>
      </header>

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
      </div>

      <div className="md:hidden">
        <MobilePrimaryCta
          label={t('studentMobile.primaryCta')}
          icon={<GraduationCap aria-hidden />}
          onClick={() => navigate('/my-grades')}
        />
        <p className="sr-only">{t('studentMobile.primaryCtaHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileQuickTile
          label={t('quickActions.homework')}
          icon={<BookOpen aria-hidden />}
          onClick={() => navigate('/assignments')}
        />
        <MobileQuickTile
          label={t('quickActions.absences')}
          icon={<ClipboardCheck aria-hidden />}
          onClick={() => navigate('/my-absences')}
        />
        <MobileQuickTile
          label={t('quickActions.calendar')}
          icon={<Calendar aria-hidden />}
          onClick={() => navigate('/calendar')}
        />
        <MobileQuickTile
          label={t('quickActions.messages')}
          icon={<MessageSquare aria-hidden />}
          onClick={() => navigate('/messages')}
        />
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('quickActions.title')}</CardTitle>
            <CardDescription>{t('quickActions.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <MobileQuickTile
                label={t('quickActions.myGrades')}
                icon={<GraduationCap aria-hidden />}
                onClick={() => navigate('/my-grades')}
              />
              <MobileQuickTile
                label={t('quickActions.homework')}
                icon={<BookOpen aria-hidden />}
                onClick={() => navigate('/assignments')}
              />
              <MobileQuickTile
                label={t('quickActions.absences')}
                icon={<ClipboardCheck aria-hidden />}
                onClick={() => navigate('/my-absences')}
              />
              <MobileQuickTile
                label={t('quickActions.messages')}
                icon={<MessageSquare aria-hidden />}
                onClick={() => navigate('/messages')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StudentDashboardHome;
