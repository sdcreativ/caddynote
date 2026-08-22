import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail } from 'lucide-react';
import { FadeIn } from '@/components/public/FadeIn';
import { PublicShell } from '@/components/public/PublicShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import { recoverAdmissionByEmail } from '@/services/strkAdmissionService';

/**
 * Récupération du dossier par e-mail — alternative UX à « conserver le lien ».
 */
export default function AdmissionRecoverPage() {
  const { t } = useTranslation('admissions');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await recoverAdmissionByEmail(email.trim());
      setDone(true);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('recover.error'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicShell>
      <main className="relative isolate flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-[#1D70D8]/10 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-lg px-4 py-12 sm:px-6 sm:py-16">
          <FadeIn>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">{t('recover.eyebrow')}</p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B1F3A] sm:text-4xl">
              {t('recover.title')}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{t('recover.subtitle')}</p>
          </FadeIn>

          <FadeIn delay={0.06} className="mt-8">
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_1px_0_rgba(11,31,58,0.04)] sm:p-7">
              {done ? (
                <div className="space-y-4" role="status">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#1D70D8]">
                    <Mail className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{t('recover.doneTitle')}</h2>
                  <p className="text-sm leading-relaxed text-slate-600">{t('recover.doneBody')}</p>
                  <Button asChild className="bg-[#1D70D8] text-white hover:bg-[#1660bc]">
                    <Link to="/admissions">{t('recover.backApply')}</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recover-email">{t('recover.emailLabel')}</Label>
                    <Input
                      id="recover-email"
                      type="email"
                      required
                      autoComplete="email"
                      className="h-11"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('recover.emailPlaceholder')}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy || !email.trim()}
                    className="w-full bg-[#1D70D8] text-white hover:bg-[#1660bc] sm:w-auto"
                  >
                    {busy ? t('recover.sending') : t('recover.submit')}
                  </Button>
                </form>
              )}
            </section>
          </FadeIn>

          <p className="mt-8 text-sm">
            <Link
              to="/admissions"
              className="inline-flex items-center gap-1.5 font-medium text-[#05335C] hover:text-[#1D70D8]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {t('recover.backApply')}
            </Link>
          </p>
        </div>
      </main>
    </PublicShell>
  );
}
