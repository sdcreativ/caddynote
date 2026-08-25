import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Award, MessageSquare, Receipt, ChevronRight } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import {
  MobileCompactStat,
  MobilePrimaryCta,
  MobileQuickTile,
} from '@/components/dashboard/MobileActionPrimitives';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { roleLabel } from '@/lib/navConfig';
import { formatCentsFr } from '@/lib/dashboardKpis';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type AccountantDashboardHomeProps = {
  userName: string;
  invoicesOpen: number | null;
  unpaidCents: number | null;
  state: LoadState;
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil comptable — cockpit deux clics finance.
 */
const AccountantDashboardHome = ({
  userName,
  invoicesOpen,
  unpaidCents,
  state,
}: AccountantDashboardHomeProps) => {
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

  const hasUnpaid = state === 'ready' && (unpaidCents ?? 0) > 0;
  const openCount = state === 'ready' ? Number(invoicesOpen ?? 0) : 0;

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
          {roleLabel('accountant')} • {dateLabel}
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.section')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('alerts.recent')} <span className="text-slate-400">({hasUnpaid ? 1 : 0})</span>
            </h2>
          </div>
          {hasUnpaid ? (
            <Button asChild size="sm">
              <Link to="/finance">{t('alerts.primaryCta')}</Link>
            </Button>
          ) : null}
        </div>
        {hasUnpaid ? (
          <ul className="mt-4 divide-y divide-slate-100">
            <li>
              <Link
                to="/finance"
                className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <Receipt className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {t('accountantMobile.unpaidToHandle', {
                      count: openCount || 1,
                      amount: unpaidDisplay,
                    })}
                  </p>
                  <p className="truncate text-sm text-slate-500">{t('stats.remainingToCollect')}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
              </Link>
            </li>
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            {state === 'empty' ? t('empty.accountantNoInvoices') : t('alerts.emptyTitle')}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileCompactStat
          title={t('stats.openInvoices')}
          value={String(kpiValue(state, invoicesOpen))}
          tone="amber"
        />
        <MobileCompactStat title={t('stats.remainingToCollect')} value={unpaidDisplay} tone="violet" />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <StatCard
          title={t('stats.openInvoices')}
          value={kpiValue(state, invoicesOpen)}
          description={state === 'empty' ? t('empty.accountantNoInvoices') : undefined}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title={t('stats.remainingToCollect')}
          value={unpaidDisplay}
          icon={<Award className="h-5 w-5" />}
          color="purple"
        />
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('accountantMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={t('accountantMobile.primaryCta')}
          icon={<Receipt aria-hidden />}
          onClick={() => navigate('/finance')}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
          <MobileQuickTile
            label={t('quickActions.finance')}
            icon={<Receipt aria-hidden />}
            onClick={() => navigate('/finance')}
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

export default AccountantDashboardHome;
