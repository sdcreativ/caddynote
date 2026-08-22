import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const testimonialMeta = [
  { initials: 'GN', tone: 'from-[#1D70D8] to-[#0B4FA8]' },
  { initials: 'KM', tone: 'from-[#0EA5E9] to-[#0369A1]' },
  { initials: 'AD', tone: 'from-[#7C3AED] to-[#4C1D95]' },
] as const;

/** Section témoignages — carrousel premium. */
export function TestimonialsSection() {
  const { t } = useTranslation('home');
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const items = t('testimonials.items', { returnObjects: true }) as {
    quote: string;
    name: string;
    role: string;
    place: string;
  }[];
  const testimonials = items.map((item, i) => ({
    ...item,
    ...testimonialMeta[i],
  }));
  const active = testimonials[index] ?? testimonials[0];

  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % testimonials.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [reduce, paused, index]);

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + testimonials.length) % testimonials.length);
  };

  return (
    <section
      className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28"
      style={{ background: 'linear-gradient(180deg, #EEF4FB 0%, #F7F9FC 55%, #EEF4FB 100%)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={t('testimonials.aria')}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#1D70D8]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
            {t('testimonials.eyebrow')}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.35rem]">
            {t('testimonials.title')}
          </h2>
        </div>

        <div className="relative mt-12">
          <div className="absolute -inset-px rounded-[1.75rem] bg-gradient-to-br from-[#1D70D8]/25 via-transparent to-sky-300/20 opacity-80" aria-hidden />

          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/80 p-8 shadow-[0_30px_80px_-40px_rgba(11,31,58,0.45)] backdrop-blur-xl sm:p-12 lg:p-14">
            <Quote className="h-10 w-10 text-[#1D70D8]/35 sm:h-12 sm:w-12" strokeWidth={1.25} aria-hidden />

            <div className="relative mt-6 min-h-[9.5rem] sm:min-h-[8.5rem]">
              <AnimatePresence mode="wait">
                <motion.blockquote
                  key={active.name}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="font-display text-xl font-medium leading-relaxed tracking-tight text-[#0B1F3A] sm:text-[1.65rem] sm:leading-[1.45]"
                >
                  « {active.quote} »
                </motion.blockquote>
              </AnimatePresence>
            </div>

            <div className="mt-10 flex flex-col gap-6 border-t border-slate-100 pt-8 sm:flex-row sm:items-center sm:justify-between">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.name + '-meta'}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-4"
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white shadow-lg',
                        active.tone
                      )}
                    >
                      {active.initials}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500" aria-hidden>
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-bold text-[#0B1F3A]">{active.name}</p>
                    <p className="text-sm text-slate-500">
                      {active.role} — {active.place}
                    </p>
                    <div className="mt-1.5 flex items-center gap-0.5" aria-label={t('testimonials.stars')}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  aria-label={t('testimonials.prev')}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex items-center gap-1.5" role="tablist" aria-label={t('testimonials.pick')}>
                  {testimonials.map((item, i) => (
                    <button
                      key={item.name}
                      type="button"
                      role="tab"
                      aria-selected={i === index}
                      aria-label={t('testimonials.item', { n: i + 1 })}
                      onClick={() => setIndex(i)}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        i === index ? 'w-7 bg-[#1D70D8]' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  aria-label={t('testimonials.next')}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mini cards — autres voix */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {testimonials.map((item, i) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-2xl border px-4 py-3.5 text-left transition',
                i === index
                  ? 'border-[#1D70D8]/40 bg-white shadow-[0_12px_30px_-18px_rgba(29,112,216,0.45)]'
                  : 'border-transparent bg-white/50 hover:border-slate-200 hover:bg-white'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white',
                    item.tone
                  )}
                >
                  {item.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0B1F3A]">{item.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{item.place}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
