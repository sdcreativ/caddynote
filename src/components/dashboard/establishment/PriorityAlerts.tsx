import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardAlert } from '@/hooks/useEstablishmentDashboard';
import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  alerts: DashboardAlert[];
  total: number;
};

const avatarTone = (kind: DashboardAlert['kind']) => {
  if (kind === 'lateness') return 'bg-orange-100 text-orange-700';
  if (kind === 'payment') return 'bg-amber-100 text-amber-800';
  if (kind === 'admission') return 'bg-sky-100 text-sky-800';
  return 'bg-rose-100 text-rose-700';
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export function PriorityAlerts({ alerts, total }: Props) {
  const { t } = useTranslation('dashboard');
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t('alerts.section')}</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">
            {t('alerts.recent')} <span className="text-slate-400">({total})</span>
          </h2>
        </div>
        <Link
          to={alerts.some((a) => a.kind === 'admission') ? '/admissions/admin' : '/absences'}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {t('alerts.seeAll')}
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-slate-100">
        {alerts.length === 0 ? (
          <li className="py-2">
            <EmptyState title={t('alerts.emptyTitle')} description={t('alerts.emptyBody')} />
          </li>
        ) : (
          alerts.slice(0, 5).map((alert) => (
            <li key={alert.id}>
              <Link
                to={alert.href}
                className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/80"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    avatarTone(alert.kind)
                  )}
                >
                  {initials(alert.studentName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {alert.studentName}
                    {alert.classLabel ? (
                      <span className="font-normal text-slate-500"> · {alert.classLabel}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-slate-500">{alert.label}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
