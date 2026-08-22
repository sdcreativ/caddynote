import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { WeekAttendancePoint } from '@/hooks/useEstablishmentDashboard';

type Props = {
  average: number;
  delta?: number | null;
  data: WeekAttendancePoint[];
  empty?: boolean;
};

export function AttendanceWeekChart({ average, delta = null, data, empty = false }: Props) {
  const { t } = useTranslation('dashboard');
  const [range, setRange] = useState<'week' | 'month'>('week');

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t('attendanceChart.section')}</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-slate-900">{t('attendanceChart.title')}</h2>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-slate-900">
              {empty ? '—' : `${average.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}%`}
            </span>
            {delta != null && !empty ? (
              <span className="text-sm font-medium text-emerald-600">
                {t('attendanceChart.vsPrevious', { delta: delta.toFixed(1) })}
              </span>
            ) : (
              <span className="text-sm text-slate-500">
                {empty ? t('attendanceChart.emptyHint') : t('attendanceChart.weekAvg')}
              </span>
            )}
          </div>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setRange('week')}
            className={cn(
              'rounded-full px-3 py-1.5 font-medium transition-colors',
              range === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t('attendanceChart.thisWeek')}
          </button>
          <button
            type="button"
            onClick={() => setRange('month')}
            className={cn(
              'rounded-full px-3 py-1.5 font-medium transition-colors',
              range === 'month' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t('attendanceChart.thisMonth')}
          </button>
        </div>
      </div>

      <div className="mt-6 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} />
            <YAxis
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 12 }}
              width={32}
            />
            <Tooltip
              cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
              }}
              formatter={(value: number) => [`${value}%`, t('attendanceChart.presence')]}
            />
            <Bar dataKey="rate" fill="#2563EB" radius={[8, 8, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {range === 'month' && (
        <p className="mt-2 text-xs text-slate-500">{t('attendanceChart.monthHint')}</p>
      )}
    </section>
  );
}
