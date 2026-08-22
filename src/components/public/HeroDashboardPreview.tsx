import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CircleDollarSign } from 'lucide-react';
import { CaddyNoteMark } from '@/components/brand/CaddyNoteLogo';

/** Aperçu dashboard hero — toasts flottants animés (maquette). */
export function HeroDashboardPreview() {
  const reduce = useReducedMotion();
  const { t } = useTranslation('home');

  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      <div
        className="absolute -inset-8 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_20%,rgba(29,112,216,0.22),transparent_50%),radial-gradient(circle_at_90%_70%,rgba(244,114,182,0.12),transparent_45%)] blur-2xl"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_40px_80px_-24px_rgba(11,31,58,0.45)]">
        <div className="flex min-h-[320px]">
          <aside className="flex w-14 shrink-0 flex-col items-center gap-3 bg-[#0B1F3A] py-4 sm:w-16">
            <CaddyNoteMark size={32} inverted />
            {[1, 0, 0, 0, 0].map((on, i) => (
              <div
                key={i}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${on ? 'bg-white/15' : ''}`}
              >
                <div className={`h-3 w-3 rounded-[3px] ${on ? 'bg-white' : 'bg-white/35'}`} />
              </div>
            ))}
          </aside>

          <div className="flex-1 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-900">{t('heroGreeting')}</p>
              <div className="hidden h-8 max-w-[140px] flex-1 rounded-full bg-slate-100 sm:block" />
              <div className="h-8 w-8 rounded-full bg-[#1D70D8]" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { k: t('heroPreview.kpiStudents'), v: '642', d: '+18' },
                { k: t('heroPreview.kpiAttendance'), v: '94,8%', d: '+3,1%' },
                { k: t('heroPreview.kpiPayments'), v: '8,42 M', d: 'FCFA' },
              ].map((c) => (
                <div key={c.k} className="rounded-xl border border-slate-100 bg-slate-50/90 p-2.5">
                  <p className="text-[9px] font-medium text-slate-600">{c.k}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{c.v}</p>
                  <p className="text-[9px] font-semibold text-emerald-800">{c.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[1.35fr_1fr] gap-2">
              <div className="rounded-xl border border-slate-100 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                    {t('heroPreview.weekAttendance')}
                </p>
                <div className="mt-3 flex h-20 items-end gap-1">
                  {[45, 62, 55, 78, 70, 88, 82].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-[3px] bg-gradient-to-t from-[#1D70D8] to-[#5B9CF0]"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">{t('heroPreview.recentAlerts')}</p>
                <ul className="mt-2 space-y-2">
                  {['Awa T.', 'Nolan K.', 'Fatou B.'].map((n, i) => (
                    <li key={n} className="flex items-center gap-1.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ${
                          i === 0 ? 'bg-rose-400' : i === 1 ? 'bg-orange-400' : 'bg-amber-400'
                        }`}
                      >
                        {n[0]}
                      </span>
                      <span className="truncate text-[10px] font-medium text-slate-700">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast paiement — flottement */}
      <motion.div
        className="absolute -right-2 top-10 z-10 w-[12.5rem] rounded-2xl border border-violet-100 bg-white p-3 shadow-[0_18px_40px_-12px_rgba(91,33,182,0.35)] sm:-right-4 sm:top-14 sm:w-52"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
        animate={
          reduce
            ? { opacity: 1, y: 0 }
            : {
                opacity: 1,
                y: [0, -8, 0],
                scale: 1,
              }
        }
        transition={
          reduce
            ? { duration: 0.2 }
            : {
                opacity: { duration: 0.45, delay: 0.35 },
                scale: { duration: 0.45, delay: 0.35 },
                y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
              }
        }
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <CircleDollarSign className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-slate-900">{t('roles.toastPayTitle')}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{t('roles.toastPayBody')}</p>
          </div>
        </div>
      </motion.div>

      {/* Toast parent — flottement déphasé */}
      <motion.div
        className="absolute -left-1 bottom-8 z-10 w-[13rem] rounded-2xl border border-emerald-100 bg-white p-3 shadow-[0_18px_40px_-12px_rgba(5,150,105,0.3)] sm:-left-3 sm:bottom-10 sm:w-56"
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
        animate={
          reduce
            ? { opacity: 1, y: 0 }
            : {
                opacity: 1,
                y: [0, -6, 0],
                scale: 1,
              }
        }
        transition={
          reduce
            ? { duration: 0.2 }
            : {
                opacity: { duration: 0.45, delay: 0.55 },
                scale: { duration: 0.45, delay: 0.55 },
                y: { duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 1.1 },
              }
        }
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-slate-900">{t('roles.toastParentTitle')}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{t('roles.toastParentBody')}</p>
          </div>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          </span>
        </div>
      </motion.div>
    </div>
  );
}
