import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { AgendaItem } from '@/hooks/useEstablishmentDashboard';
import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  items: AgendaItem[];
};

export function TodayAgenda({ items }: Props) {
  const { t } = useTranslation('dashboard');
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t('agenda.today')}</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">{t('agenda.title')}</h2>
      </div>

      <div className="mt-5 flex-1 space-y-4">
        {items.length === 0 ? (
          <EmptyState
            title={t('agenda.emptyTitle')}
            description={t('agenda.emptyBody')}
          />
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <div className="w-12 shrink-0 pt-0.5 text-sm font-semibold text-slate-900">{item.time}</div>
              <div className="min-w-0 flex-1 border-l-2 border-blue-500 pl-3">
                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                {item.place && <p className="mt-0.5 truncate text-xs text-slate-500">{item.place}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      <Link
        to="/calendar"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t('agenda.addEvent')}
      </Link>
    </section>
  );
}
