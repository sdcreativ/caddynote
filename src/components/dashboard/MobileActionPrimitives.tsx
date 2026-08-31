import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Tuile d’action mobile — zone tactile et typo lisibles (≥ ~44px). */
export function MobileQuickTile({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[7rem] touch-manipulation rounded-2xl border border-slate-200 bg-white p-5 text-center',
        'transition-colors hover:bg-slate-50 active:bg-slate-100',
        className
      )}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 [&_svg]:h-6 [&_svg]:w-6">
        {icon}
      </div>
      <span className="text-base font-semibold leading-snug text-slate-800">{label}</span>
    </button>
  );
}

type CompactTone = 'blue' | 'green' | 'violet' | 'rose' | 'amber' | 'emerald' | 'red';

const TONE_BOX: Record<CompactTone, string> = {
  blue: 'border-blue-200 bg-blue-50/80 text-blue-900',
  green: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
  emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
  violet: 'border-violet-200 bg-violet-50/80 text-violet-900',
  rose: 'border-rose-200 bg-rose-50/80 text-rose-900',
  red: 'border-red-200 bg-red-50/80 text-red-900',
  amber: 'border-amber-200 bg-amber-50/80 text-amber-900',
};

const TONE_TITLE: Record<CompactTone, string> = {
  blue: 'text-blue-800/90',
  green: 'text-emerald-800/90',
  emerald: 'text-emerald-800/90',
  violet: 'text-violet-800/90',
  rose: 'text-rose-800/90',
  red: 'text-red-800/90',
  amber: 'text-amber-800/90',
};

/** KPI compact mobile — libellé et valeur plus lisibles. */
export function MobileCompactStat({
  title,
  value,
  tone,
  hint,
  onClick,
}: {
  title: string;
  value: string;
  tone: CompactTone;
  hint?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className={cn('text-sm font-semibold', TONE_TITLE[tone])}>{title}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{value}</p>
      {hint ? <p className={cn('mt-1.5 text-xs font-medium', TONE_TITLE[tone])}>{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-2xl border px-4 py-4 text-left touch-manipulation transition hover:brightness-[0.98]',
          TONE_BOX[tone]
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn('rounded-2xl border px-4 py-4', TONE_BOX[tone])}>{body}</div>;
}

/** Bouton CTA principal plein largeur (mobile). */
export function MobilePrimaryCta({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 touch-manipulation items-center justify-center gap-3 rounded-2xl bg-blue-600',
        'px-4 py-4 text-base font-semibold leading-snug text-white sm:px-5 sm:py-5 sm:text-lg',
        'whitespace-normal break-words text-center',
        'shadow-[0_12px_28px_-12px_rgba(37,99,235,0.7)] transition hover:bg-blue-700 active:bg-blue-800',
        '[&_svg]:h-6 [&_svg]:w-6 sm:[&_svg]:h-7 sm:[&_svg]:w-7'
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}
