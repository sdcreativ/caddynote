import { Link, Navigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { FadeIn } from '@/components/public/FadeIn';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FEATURES, getFeatureBySlug } from '@/data/features';
import { localizeFeature } from '@/i18n/localizeCatalog';
import { useTranslation } from 'react-i18next';

export default function FeatureDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('home');
  const raw = getFeatureBySlug(slug);
  const feature = raw ? localizeFeature(raw) : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!feature) {
    return <Navigate to="/" replace />;
  }

  const related = FEATURES.filter((f) => f.slug !== feature.slug).slice(0, 3).map(localizeFeature);
  const Icon = feature.icon;

  return (
    <PublicShell>
      <main className="flex-1">
        <section className="relative isolate overflow-hidden border-b border-slate-100 bg-white px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-[#1D70D8]/10 blur-3xl" />
            <div className="absolute right-0 top-24 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-4xl">
            <Link
              to="/#features"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-[#1D70D8]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('featurePage.back')}
            </Link>

            <FadeIn className="mt-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1D70D8]">
                {feature.eyebrow}
              </p>
              <div className="mt-4 flex flex-wrap items-start gap-4">
                <span
                  className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl',
                    feature.tone
                  )}
                >
                  <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl">
                    {feature.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-500">{feature.hero}</p>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <FadeIn>
              <p className="text-base leading-relaxed text-slate-600 sm:text-lg">{feature.body}</p>
              <ul className="mt-8 space-y-3">
                {feature.bullets.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  asChild
                  className="h-11 rounded-full bg-[#1D70D8] px-6 font-semibold text-white hover:bg-[#185CB4]"
                >
                  <Link to="/contact?subject=Demande%20de%20d%C3%A9monstration">
                    {t('featurePage.demo')}
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <Link
                  to="/signup"
                  className="text-sm font-semibold text-[#1D70D8] transition-colors hover:text-[#185CB4]"
                >
                  {t('featurePage.signup')}
                </Link>
              </div>
            </FadeIn>

            <FadeIn>
              <div className="space-y-4">
                {feature.highlights.map((h) => (
                  <article
                    key={h.title}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.25)]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          feature.tone
                        )}
                      >
                        <h.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-[#0B1F3A]">{h.title}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{h.text}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-[#F7F8FA] px-4 py-14 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-xl font-bold text-[#0B1F3A] sm:text-2xl">
              {t('featurePage.more')}
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {related.map((f) => (
                <Link
                  key={f.slug}
                  to={`/fonctionnalites/${f.slug}`}
                  className="group rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:border-[#1D70D8]/35 hover:shadow-[0_16px_40px_-28px_rgba(29,112,216,0.45)]"
                >
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 items-center justify-center rounded-xl',
                      f.tone
                    )}
                  >
                    <f.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-bold text-[#0B1F3A] group-hover:text-[#1D70D8]">
                    {f.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{f.short}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
