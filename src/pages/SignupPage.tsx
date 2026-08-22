import { Link } from 'react-router-dom';
import { CheckCircle2, Shield, Sparkles, Clock } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import StrkSignupForm from '@/components/auth/StrkSignupForm';
import { FadeIn } from '@/components/public/FadeIn';
import { CaddyNoteMark } from '@/components/brand/CaddyNoteLogo';
import { useTranslation } from 'react-i18next';

const BLUE = '#1D70D8';

export default function SignupPage() {
  const { t } = useTranslation('auth');

  const benefits = [
    {
      title: t('signupPage.benefits.nocard.title'),
      text: t('signupPage.benefits.nocard.text'),
    },
    {
      title: t('signupPage.benefits.community.title'),
      text: t('signupPage.benefits.community.text'),
    },
    {
      title: t('signupPage.benefits.support.title'),
      text: t('signupPage.benefits.support.text'),
    },
  ];

  const highlights = [
    { icon: Shield, label: t('signupPage.highlights.secure') },
    { icon: Sparkles, label: t('signupPage.highlights.simple') },
    { icon: Clock, label: t('signupPage.highlights.fast') },
  ];

  return (
    <PublicShell>
      <main className="relative isolate flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
          <div className="absolute right-[-8%] top-24 h-72 w-72 rounded-full bg-pink-200/25 blur-3xl" />
          <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <FadeIn className="lg:pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
              {t('signupPage.eyebrow')}
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.75rem] sm:leading-[1.12]">
              {t('signupPage.title')}
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-slate-600">
              {t('signupPage.subtitle')}
            </p>

            <ul className="mt-8 space-y-4">
              {benefits.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: BLUE }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[#0B1F3A]">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 text-xs font-semibold text-slate-600 backdrop-blur-sm"
                >
                  <item.icon className="h-3.5 w-3.5 text-[#1D70D8]" aria-hidden />
                  {item.label}
                </div>
              ))}
            </div>

            <p className="mt-10 text-sm text-slate-500">
              {t('signupPage.hasAccount')}{' '}
              <Link to="/sign" className="font-semibold text-[#1D70D8] hover:underline">
                {t('signupPage.login')}
              </Link>
            </p>
          </FadeIn>

          <FadeIn delay={0.06}>
            <section
              aria-labelledby="signup-form-title"
              className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-8 lg:p-9"
            >
              <div className="mb-5 flex justify-center sm:justify-start">
                <CaddyNoteMark size={40} />
              </div>
              <h2 id="signup-form-title" className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                {t('signupPage.formTitle')}
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                {t('signupPage.formSubtitle')}
              </p>
              <div className="mt-7">
                <StrkSignupForm embedded />
              </div>
            </section>
          </FadeIn>
        </div>
      </main>
    </PublicShell>
  );
}
