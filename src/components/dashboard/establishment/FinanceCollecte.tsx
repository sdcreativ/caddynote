import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { FinanceSnapshot } from '@/hooks/useEstablishmentDashboard';

type Props = {
  finance: FinanceSnapshot;
};

const formatMoney = (cents: number, currency: string) => {
  const amount = cents / 100;
  if (currency === 'XOF' || currency === 'XAF') {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M ${currency}`;
    if (amount >= 1_000) return `${Math.round(amount / 1000).toLocaleString('fr-FR')} k ${currency}`;
    return `${Math.round(amount).toLocaleString('fr-FR')} ${currency}`;
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function FinanceCollecte({ finance }: Props) {
  const { t } = useTranslation('dashboard');
  const chartData = [
    { name: t('finance.paid'), value: Math.max(finance.paidCents, 0), color: '#2563EB' },
    { name: t('finance.pending'), value: Math.max(finance.pendingCents, 0), color: '#F59E0B' },
    { name: t('finance.overdue'), value: Math.max(finance.overdueCents, 0), color: '#EF4444' },
  ].filter((d) => d.value > 0);

  const pct = Math.round(finance.collectedRatio * 100);
  const hasData = chartData.length > 0;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t('finance.section')}</p>
        <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">{t('finance.title')}</h2>
      </div>

      <div className="relative mx-auto mt-4 h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={hasData ? chartData : [{ name: t('finance.empty'), value: 1, color: '#E2E8F0' }]}
              dataKey="value"
              innerRadius={58}
              outerRadius={78}
              paddingAngle={hasData ? 3 : 0}
              stroke="none"
            >
              {(hasData ? chartData : [{ color: '#E2E8F0' }]).map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-semibold text-slate-900">{hasData ? `${pct}%` : '—'}</span>
          <span className="text-xs text-slate-500">{t('finance.collected')}</span>
        </div>
      </div>

      <ul className="mt-2 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> {t('finance.paid')}
          </span>
          <span className="font-medium text-slate-900">{formatMoney(finance.paidCents, finance.currency)}</span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('finance.pending')}
          </span>
          <span className="font-medium text-slate-900">{formatMoney(finance.pendingCents, finance.currency)}</span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> {t('finance.overdue')}
          </span>
          <span className="font-medium text-slate-900">{formatMoney(finance.overdueCents, finance.currency)}</span>
        </li>
      </ul>

      <div className="mt-auto space-y-2 border-t border-slate-100 pt-4 text-sm">
        <div className="flex items-center justify-between gap-2 text-slate-600">
          <span>{t('finance.unpaidInvoices', { count: finance.unpaidInvoiceCount })}</span>
          <span className="font-medium text-slate-900">{finance.unpaidInvoiceCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-slate-600">
          <span>{t('finance.fromSchedule')}</span>
          <span className="font-medium text-slate-900">{finance.scheduleInvoiceCount}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">{t('finance.familiesUpToDate', { count: finance.familiesUpToDate })}</span>
          <Link to="/finance" className="font-medium text-blue-600 hover:text-blue-700">
            {t('finance.seeFinance')}
          </Link>
        </div>
      </div>
    </section>
  );
}
