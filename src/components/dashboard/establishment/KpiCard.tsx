import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

type KpiCardProps = {
  title: string;
  value: string;
  hint: string;
  hintTone?: 'up' | 'down' | 'neutral' | 'alert';
  icon: ReactNode;
  iconClassName?: string;
};

export function KpiCard({ title, value, hint, hintTone = 'neutral', icon, iconClassName }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p
            className={cn(
              'mt-2 inline-flex items-center gap-1 text-xs font-medium',
              hintTone === 'up' && 'text-emerald-600',
              hintTone === 'down' && 'text-rose-600',
              hintTone === 'alert' && 'text-rose-600',
              hintTone === 'neutral' && 'text-slate-500'
            )}
          >
            {hintTone === 'up' && <TrendingUp className="h-3.5 w-3.5" aria-hidden />}
            {hintTone === 'down' && <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
            {hint}
          </p>
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            iconClassName ?? 'bg-blue-50 text-blue-600'
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
