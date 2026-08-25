import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users,
  FileText,
  Award,
  MessageSquare,
  Calendar,
  CreditCard,
  School,
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
import { formatCentsFr } from '@/lib/dashboardKpis';
import {
  fetchMyAdmissionApplications,
  type AdmissionApplication,
} from '@/services/strkAdmissionService';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

type ParentDashboardHomeProps = {
  userName: string;
  childrenCount: number;
  invoicesOpen: number | null;
  unpaidCents: number | null;
  state: LoadState;
  loadError?: string | null;
};

type ToHandleItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  tone: 'rose' | 'sky' | 'amber';
};

const kpiValue = (state: LoadState, value: string | number | null | undefined, emptyLabel = '0') => {
  if (state === 'loading' || state === 'idle') return '…';
  if (state === 'error') return '—';
  if (value == null) return emptyLabel;
  return value;
};

/**
 * Accueil parent — cockpit deux clics :
 * À traiter → Pulsation (KPI) → CTA + raccourcis.
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
  const [admissions, setAdmissions] = useState<AdmissionApplication[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchMyAdmissionApplications()
      .then(({ applications }) => {
        if (!cancelled) setAdmissions(applications);
      })
      .catch(() => {
        if (!cancelled) setAdmissions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const openInvoices = state === 'ready' ? Number(invoicesOpen ?? 0) : 0;
  const activeAdmissions = admissions.filter((a) => a.status !== 'cancelled');

  const toHandle: ToHandleItem[] = [];
  if (hasUnpaid) {
    toHandle.push({
      id: 'unpaid',
      title: t('parentMobile.unpaidToHandle', {
        count: openInvoices || 1,
        amount: unpaidDisplay,
      }),
      subtitle: t('stats.remainingToPay'),
      href: '/my-children?tab=finance',
      tone: 'amber',
    });
  }
  for (const app of activeAdmissions.slice(0, 3)) {
    toHandle.push({
      id: `adm-${app.id}`,
      title: `${app.studentFirstName} ${app.studentLastName}`.trim(),
      subtitle: t('parentMobile.admissionStatus', { status: app.status }),
      href: `/admissions/suivi/${app.publicToken}`,
      tone: 'sky',
    });
  }

  const primaryCta = hasUnpaid
    ? {
        label: t('parentMobile.primaryCtaFinance'),
        href: '/my-children?tab=finance',
        icon: <CreditCard aria-hidden />,
      }
    : {
        label: t('parentMobile.primaryCta'),
        href: '/my-children',
        icon: <Users aria-hidden />,
      };

  const toneClass = (tone: ToHandleItem['tone']) => {
    if (tone === 'sky') return 'bg-sky-100 text-sky-800';
    if (tone === 'amber') return 'bg-amber-100 text-amber-800';
    return 'bg-rose-100 text-rose-700';
  };

  if (state === 'empty') {
    return (
      <div className="space-y-6 py-4 animate-fade-in md:py-6">
        <header className="space-y-1.5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
            {t('hello', { name: userName })}
          </h1>
          <p className="text-base text-slate-600 md:text-slate-500">
            {roleLabel('parent')} • {dateLabel}
          </p>
        </header>
        {activeAdmissions.length > 0 ? (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t('alerts.section')}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
              {t('alerts.recent')} <span className="text-slate-400">({activeAdmissions.length})</span>
            </h2>
            <ul className="mt-4 divide-y divide-slate-100">
              {activeAdmissions.slice(0, 5).map((app) => (
                <li key={app.id}>
                  <Link
                    to={`/admissions/suivi/${app.publicToken}`}
                    className="group flex items-center gap-3 py-3.5 hover:bg-slate-50/80"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-800">
                      <School className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {app.studentFirstName} {app.studentLastName}
                      </p>
                      <p className="truncate text-sm text-slate-500">{app.status}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
    <div className="space-y-6 py-4 animate-fade-in md:space-y-8 md:py-6">
      <header className="space-y-1.5">
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight md:text-3xl">
          {t('hello', { name: userName })}
        </h1>
        <p className="text-base text-slate-600 md:text-slate-500">
          {roleLabel('parent')} • {dateLabel}
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
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClass(item.tone)}`}
                  >
                    {item.tone === 'sky' ? (
                      <School className="h-5 w-5" aria-hidden />
                    ) : (
                      <CreditCard className="h-5 w-5" aria-hidden />
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
          title={t('stats.children')}
          value={String(kpiValue(state, childrenCount))}
          tone="blue"
        />
        <MobileCompactStat title={t('stats.remainingToPay')} value={unpaidDisplay} tone="violet" />
        <MobileCompactStat
          title={t('stats.openInvoices')}
          value={String(kpiValue(state, invoicesOpen))}
          tone="amber"
        />
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-3">
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

      {/* Q3 — Deux clics */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {t('parentMobile.shortcutsTitle')}
        </p>
        <MobilePrimaryCta
          label={primaryCta.label}
          icon={primaryCta.icon}
          onClick={() => navigate(primaryCta.href)}
        />
        <p className="sr-only">{t('parentMobile.primaryCtaHint')}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MobileQuickTile
            label={t('quickActions.myChildren')}
            icon={<Users aria-hidden />}
            onClick={() => navigate('/my-children')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.finance')}
            icon={<CreditCard aria-hidden />}
            onClick={() => navigate('/my-children?tab=finance')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.messages')}
            icon={<MessageSquare aria-hidden />}
            onClick={() => navigate('/messages')}
            className="md:min-h-[5.5rem]"
          />
          <MobileQuickTile
            label={t('quickActions.calendar')}
            icon={<Calendar aria-hidden />}
            onClick={() => navigate('/calendar')}
            className="md:min-h-[5.5rem]"
          />
        </div>
      </div>
    </div>
  );
};

export default ParentDashboardHome;
