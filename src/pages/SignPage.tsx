import { Link } from 'react-router-dom';
import { ShieldCheck, Building2, Lock, Smartphone } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { StrkLoginForm } from '@/components/auth/StrkLoginForm';
import { FadeIn } from '@/components/public/FadeIn';
import { CaddyNoteMark } from '@/components/brand/CaddyNoteLogo';
import { useTranslation } from 'react-i18next';

const BLUE = '#1D70D8';

const SignPage = () => {
  const { t } = useTranslation('auth');

  const benefits = [
    {
      icon: Building2,
      title: t('sign.benefits.tenant.title'),
      text: t('sign.benefits.tenant.text'),
    },
    {
      icon: Lock,
      title: t('sign.benefits.mfa.title'),
      text: t('sign.benefits.mfa.text'),
    },
    {
      icon: Smartphone,
      title: t('sign.benefits.mobile.title'),
      text: t('sign.benefits.mobile.text'),
    },
  ];

  return (
    <PublicShell>
      <main className="relative isolate flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
          <div className="absolute right-[-8%] top-24 h-72 w-72 rounded-full bg-pink-200/25 blur-3xl" />
          <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:gap-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <FadeIn className="order-2 lg:order-1 lg:pt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">
              {t('sign.eyebrow')}
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-[2.75rem] sm:leading-[1.12]">
              {t('sign.title')}
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600 sm:text-lg">
              {t('sign.subtitle')}
            </p>

            <ul className="mt-8 hidden space-y-4 sm:block">
              {benefits.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: BLUE }}
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[#0B1F3A]">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 hidden items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-sm sm:mt-10 sm:flex">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1D70D8]" aria-hidden />
              <p className="text-sm leading-relaxed text-slate-600">
                {t('sign.trust')}
              </p>
            </div>

            <p className="mt-8 hidden text-sm text-slate-500 sm:block">
              {t('sign.noAccount')}{' '}
              <Link to="/signup" className="font-semibold text-[#1D70D8] hover:underline">
                {t('sign.startTrial')}
              </Link>
            </p>
          </FadeIn>

          <FadeIn delay={0.06} className="order-1 lg:order-2">
            <section
              aria-labelledby="login-form-title"
              className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-8 lg:p-9"
            >
              <div className="mb-5 flex justify-center sm:justify-start">
                <CaddyNoteMark size={40} />
              </div>
              <h2 id="login-form-title" className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                {t('sign.formTitle')}
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                {t('sign.formSubtitle')}
              </p>
              <div className="mt-7">
                <StrkLoginForm embedded />
              </div>
              <p className="mt-6 text-center text-sm text-slate-500 sm:hidden">
                {t('sign.noAccount')}{' '}
                <Link to="/signup" className="font-semibold text-[#1D70D8] hover:underline">
                  {t('sign.startTrial')}
                </Link>
              </p>
            </section>
          </FadeIn>
        </div>
      </main>
    </PublicShell>
  );
};

export default SignPage;
