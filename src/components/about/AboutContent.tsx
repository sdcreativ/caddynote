import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  BarChart3,
  Smartphone,
  ArrowRight,
  Compass,
  Cpu,
  Mail,
  ShieldCheck,
  Bell,
  LayoutDashboard,
  FileCheck2,
  Globe2,
  MapPin,
} from 'lucide-react';
import { FadeIn, Stagger, StaggerItem } from '@/components/public/FadeIn';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

const BLUE = BRAND.blue;
const NAVY = BRAND.navy;

const featureIcons = [CheckCircle2, BarChart3, Smartphone];
const extraIcons = [FileCheck2, CheckCircle2, Bell, LayoutDashboard, ShieldCheck];

export function AboutContent() {
  const { t } = useTranslation('about');
  const features = t('features', { returnObjects: true }) as { title: string; description: string }[];
  const extras = t('extras', { returnObjects: true }) as string[];

  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
        <div className="absolute right-[-6%] top-24 h-72 w-72 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute bottom-32 left-1/3 h-56 w-56 rounded-full bg-sky-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        {/* Hero */}
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <FadeIn>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">{t('eyebrow')}</p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-5xl sm:leading-[1.08]">
              {t('title')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              {t('introBefore')}{' '}
              <strong className="font-semibold text-[#0B1F3A]">{t('introStrong1')}</strong>
              {t('introMid')}{' '}
              <strong className="font-semibold text-[#0B1F3A]">{t('introStrong2')}</strong>
              {t('introAfter')}
            </p>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-500">{t('subtitle')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild className="h-11 rounded-full bg-[#1D70D8] px-6 text-white hover:bg-[#1660bc]">
                <Link to="/contact">
                  {t('contactCta')}
                  <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-11 rounded-full text-[#05335C] hover:bg-slate-100">
                <Link to="/admissions">{t('admissionsCta')}</Link>
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.08} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_28px_60px_-36px_rgba(15,23,42,0.4)]">
              <img
                src="/caddynote-phone-mockup.png"
                alt={t('mockupAlt')}
                className="h-auto w-full object-cover object-top"
                loading="lazy"
                width={640}
                height={800}
              />
            </div>
            <div
              className="absolute -bottom-4 left-4 right-4 rounded-2xl px-4 py-3 text-sm text-white shadow-lg sm:left-8 sm:right-auto sm:max-w-xs"
              style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #134078 100%)` }}
            >
              <p className="font-semibold tracking-tight">{t('pillTitle')}</p>
              <p className="mt-0.5 text-xs text-white/75">{t('pillBody')}</p>
            </div>
          </FadeIn>
        </div>

        {/* Scope */}
        <FadeIn className="mt-16 grid gap-4 sm:grid-cols-2">
          {[
            { icon: MapPin, title: t('scopeEuropeTitle'), body: t('scopeEuropeBody') },
            { icon: Globe2, title: t('scopeAfricaTitle'), body: t('scopeAfricaBody') },
          ].map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white/85 p-5 backdrop-blur-sm"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: BLUE }}
              >
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#0B1F3A]">{item.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </FadeIn>

        {/* Mission */}
        <FadeIn className="mt-10">
          <section
            className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_1px_0_rgba(11,31,58,0.04)] sm:p-8"
            aria-labelledby="about-mission"
          >
            <div className="flex items-start gap-4">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: NAVY }}
              >
                <Compass className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h2 id="about-mission" className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                  {t('missionTitle')}
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                  {t('missionBefore')}{' '}
                  <strong className="font-semibold text-[#0B1F3A]">{t('missionStrong')}</strong>{' '}
                  {t('missionAfter')}
                </p>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* Features */}
        <section className="mt-16" aria-labelledby="about-features">
          <FadeIn>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">{t('featuresEyebrow')}</p>
            <h2
              id="about-features"
              className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl"
            >
              {t('featuresTitle')}
            </h2>
          </FadeIn>

          <Stagger className="mt-8 grid gap-4 sm:grid-cols-3">
            {features.map((feature, i) => {
              const Icon = featureIcons[i] ?? CheckCircle2;
              return (
                <StaggerItem key={feature.title}>
                  <article className="h-full rounded-2xl border border-slate-200/80 bg-white/90 p-5 transition-shadow hover:shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: BLUE }}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight text-[#0B1F3A]">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>

          <FadeIn className="mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 sm:p-6">
            <h3 className="text-lg font-semibold tracking-tight text-[#0B1F3A]">{t('extrasTitle')}</h3>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {extras.map((text, i) => {
                const Icon = extraIcons[i] ?? CheckCircle2;
                return (
                  <li key={text} className="flex items-start gap-3 text-sm text-slate-700">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#1D70D8]" aria-hidden />
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          </FadeIn>
        </section>

        {/* Tech + contact */}
        <div className="mt-16 grid gap-4 lg:grid-cols-2">
          <FadeIn>
            <section
              className="h-full rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-6 sm:p-7"
              aria-labelledby="about-tech"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: BLUE }}
              >
                <Cpu className="h-5 w-5" aria-hidden />
              </span>
              <h2 id="about-tech" className="mt-4 font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                {t('techTitle')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                {t('techBefore')}{' '}
                <strong className="font-semibold text-[#0B1F3A]">{t('techStrong')}</strong>
                {t('techAfter')}
              </p>
            </section>
          </FadeIn>

          <FadeIn delay={0.06}>
            <section
              className={cn('h-full rounded-[1.5rem] p-6 text-white sm:p-7')}
              style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #134078 100%)` }}
              aria-labelledby="about-contact"
            >
              <Mail className="h-6 w-6 text-[#7EB6FF]" aria-hidden />
              <h2 id="about-contact" className="mt-4 font-display text-2xl font-bold tracking-tight">
                {t('contactTitle')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{t('contactBody')}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button asChild className="rounded-full bg-white text-[#0B1F3A] hover:bg-slate-100">
                  <Link to="/contact">
                    {t('contactCta')}
                    <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
                <a
                  href="mailto:contact@caddynote.com"
                  className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
                >
                  contact@caddynote.com
                </a>
              </div>
            </section>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
