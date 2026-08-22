import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { FadeIn } from '@/components/public/FadeIn';
import { cn } from '@/lib/utils';
import { EXPERIENCES, getExperienceBySlug } from '@/data/experiences';
import { localizeExperience } from '@/i18n/localizeCatalog';
import { useTranslation } from 'react-i18next';

const NAVY = '#0B1F3A';
const BLUE = '#1D70D8';

export default function ExperienceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('home');
  const raw = getExperienceBySlug(slug);
  const experience = raw ? localizeExperience(raw) : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!experience) {
    return <Navigate to="/" replace />;
  }

  const Icon = experience.icon;
  const others = EXPERIENCES.filter((e) => e.slug !== experience.slug).map(localizeExperience);

  return (
    <PublicShell>
      <main className="flex-1" style={{ backgroundColor: NAVY }}>
        {/* Hero */}
        <section className="relative isolate overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(29,112,216,0.35) 0%, transparent 55%)',
            }}
          />

          <div className="relative mx-auto max-w-5xl">
            <Link
              to="/#roles"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('experiencePage.back')}
            </Link>

            <FadeIn className="mt-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7EB6FF]">
                {t('experiencePage.eyebrow', { label: experience.label })}
              </p>

              <div className="mt-6 grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
                <div>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm font-semibold text-white">
                    <Icon className="h-4 w-4 text-[#7EB6FF]" aria-hidden />
                    {experience.label}
                  </div>
                  <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-[2.65rem] sm:leading-[1.15]">
                    {experience.title}
                  </h1>
                  <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                    {experience.hero}
                  </p>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      to="/contact?subject=Demande%20de%20d%C3%A9monstration"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-[0_12px_32px_-8px_rgba(29,112,216,0.65)] transition hover:brightness-110"
                      style={{ backgroundColor: BLUE }}
                    >
                      {t('experiencePage.demo')}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                    <Link
                      to="/signup"
                      className="text-sm font-semibold text-[#7EB6FF] transition hover:text-white"
                    >
                      {t('experiencePage.signup')}
                    </Link>
                  </div>
                </div>

                <div className="relative flex min-h-[220px] items-center justify-center">
                  <div className="relative flex h-52 w-52 items-center justify-center sm:h-60 sm:w-60">
                    <div className="absolute inset-0 rounded-full border border-white/10" aria-hidden />
                    <div className="absolute inset-5 rounded-full border border-white/15" aria-hidden />
                    <div className="absolute inset-10 rounded-full border border-white/20" aria-hidden />
                    <div className="relative text-center">
                      <p className="font-display text-5xl font-bold tracking-tight text-white sm:text-6xl">
                        {experience.stat}
                      </p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#7EB6FF]">
                        {experience.statLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Pillars */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="mx-auto max-w-5xl">
            <FadeIn>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7EB6FF]">
                {t('experiencePage.gains')}
              </p>
              <h2 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">
                {t('experiencePage.designedFor', { label: experience.label.toLowerCase() })}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
                {experience.body}
              </p>
            </FadeIn>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {experience.pillars.map((p) => (
                <article
                  key={p.title}
                  className="rounded-[1.25rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1D70D8]/20 text-[#7EB6FF]">
                    <p.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">{p.text}</p>
                </article>
              ))}
            </div>

            <ul className="mt-10 grid gap-3 sm:grid-cols-2">
              {experience.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm font-medium text-white/85">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Other experiences */}
        <section className="border-t border-white/10 px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
              {t('experiencePage.others')}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {others.map((e) => (
                <Link
                  key={e.slug}
                  to={`/experiences/${e.slug}`}
                  className={cn(
                    'group rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-6 transition',
                    'hover:border-[#1D70D8]/50 hover:bg-white/[0.07]'
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#7EB6FF]">
                    <e.icon className="h-4 w-4" aria-hidden />
                    {e.label}
                  </span>
                  <p className="mt-3 font-display text-lg font-bold text-white group-hover:text-[#7EB6FF]">
                    {e.title}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-white/55">{e.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white/80 group-hover:text-white">
                    {t('experiencePage.discover')}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
