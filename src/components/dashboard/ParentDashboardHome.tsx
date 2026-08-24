import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, FileText, Award, MessageSquare, Calendar, CreditCard, Bus } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { roleLabel } from '@/lib/navConfig';
import { formatCentsFr } from '@/lib/dashboardKpis';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type ParentDashboardHomeProps = {
  userName: string;
  childrenCount: number;
  invoicesOpen: number | null;
  unpaidCents: number | null;
  state: LoadState;
  loadError?: string | null;
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil parent — mobile P0 (CTA enfants + KPI finance) ;
 * desktop conserve la grille KPI + actions rapides.
 */
const ParentDashboardHome = ({
  userName,
  childrenCount,
  invoicesOpen,
  unpaidCents,
  state,
  loadError,
}: ParentDashboardHomeProps) => {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const unpaidDisplay =
    state === 'loading' || state === 'idle'
      ? '…'
      : unpaidCents == null
        ? '—'
        : formatCentsFr(unpaidCents);

  if (state === 'empty') {
    return (
      <div className="space-y-6 py-4 animate-fade-in md:py-6">
        <header className="space-y-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
            {t('hello', { name: userName })}
          </h1>
          <p className="text-base text-slate-600 md:text-base md:text-slate-500">
            {roleLabel('parent')} • {dateLabel}
          </p>
        </header>
        <EmptyState
          title={t('empty.parentNoChildrenTitle')}
          description={t('empty.parentNoChildrenBody')}
          actionLabel={t('quickActions.myChildren')}
          onAction={() => navigate('/my-children')}
        />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="space-y-6 py-4 animate-fade-in md:py-6">
        <header className="space-y-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
            {t('hello', { name: userName })}
          </h1>
        </header>
        <EmptyState title={t('empty.loadErrorTitle')} description={loadError || t('empty.loadErrorBody')} />
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
          {roleLabel('parent')} • {dateLabel}
        </p>
        <p className="hidden text-sm text-slate-500 md:block">{t('roleHints.parent')}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.children')}
          value={String(kpiValue(state, childrenCount))}
          tone="blue"
        />
        <MobileCompactStat title={t('stats.remainingToPay')} value={unpaidDisplay} tone="violet" />
      </div>

      <div className="md:hidden">
        <MobilePrimaryCta
          label={t('parentMobile.primaryCta')}
          icon={<Users aria-hidden />}
          onClick={() => navigate('/my-children')}
        />
        <p className="sr-only">{t('parentMobile.primaryCtaHint')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileQuickTile
          label={t('quickActions.finance')}
          icon={<CreditCard aria-hidden />}
          onClick={() => navigate('/my-children?tab=finance')}
        />
        <MobileQuickTile
          label={t('quickActions.messages')}
          icon={<MessageSquare aria-hidden />}
          onClick={() => navigate('/messages')}
        />
        <MobileQuickTile
          label={t('quickActions.calendar')}
          icon={<Calendar aria-hidden />}
          onClick={() => navigate('/calendar')}
        />
        <MobileQuickTile
          label={t('quickActions.services')}
          icon={<Bus aria-hidden />}
          onClick={() => navigate('/my-children?tab=services')}
        />
      </div>

      <div className="hidden md:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            title={t('stats.children')}
            value={kpiValue(state, childrenCount)}
            icon={<Users className="h-5 w-5" />}
          />
          <StatCard
            title={t('stats.openInvoices')}
            value={kpiValue(state, invoicesOpen)}
            icon={<FileText className="h-5 w-5" />}
          />
          <StatCard
            title={t('stats.remainingToPay')}
            value={unpaidDisplay}
            icon={<Award className="h-5 w-5" />}
            color="purple"
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
                label={t('quickActions.myChildren')}
                icon={<Users aria-hidden />}
                onClick={() => navigate('/my-children')}
              />
              <MobileQuickTile
                label={t('quickActions.finance')}
                icon={<CreditCard aria-hidden />}
                onClick={() => navigate('/my-children?tab=finance')}
              />
              <MobileQuickTile
                label={t('quickActions.messages')}
                icon={<MessageSquare aria-hidden />}
                onClick={() => navigate('/messages')}
              />
              <MobileQuickTile
                label={t('quickActions.calendar')}
                icon={<Calendar aria-hidden />}
                onClick={() => navigate('/calendar')}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ParentDashboardHome;
