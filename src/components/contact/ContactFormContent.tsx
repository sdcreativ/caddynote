import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  Phone,
  Send,
  User,
  MessageSquare,
  MapPin,
  Clock,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { FadeIn } from '@/components/public/FadeIn';
import { cn } from '@/lib/utils';

const BLUE = '#1D70D8';
const NAVY = '#0B1F3A';

export function ContactFormContent() {
  const { t } = useTranslation('contact');
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const subjects = t('subjects', { returnObjects: true }) as string[];
  const supportItems = t('supportItems', { returnObjects: true }) as string[];

  const messageForSubject = (subject: string): string => {
    const s = subject.toLowerCase();
    if (s.includes('démo') || s.includes('demo') || s.includes('présentation')) {
      return t('draftDemo');
    }
    if (s.includes('essentiel') || s.includes('performance') || s.includes('réseau') || s.includes('reseau')) {
      return t('draftOffer', { offer: subject.replace(/^Offre\s+/i, '') });
    }
    return '';
  };

  useEffect(() => {
    const email = searchParams.get('email') || '';
    const subject = searchParams.get('subject') || '';
    if (!email && !subject) return;

    setFormData((prev) => {
      const nextSubject = subject || prev.subject;
      const autoMessage = messageForSubject(nextSubject);
      return {
        ...prev,
        email: email || prev.email,
        subject: nextSubject,
        message: prev.message || autoMessage,
      };
    });
    // Intentionnel : uniquement à l'arrivée des query params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const selectSubject = (subject: string) => {
    setFormData((prev) => ({
      ...prev,
      subject,
      message: prev.message.trim() ? prev.message : messageForSubject(subject),
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { apiClient } = await import('@/lib/apiClient');
      await apiClient.post('/contact', formData, { skipAuth: true });
      toast({
        title: t('successTitle'),
        description: t('successBody'),
      });
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast({
        title: t('errorTitle'),
        description: t('errorBody'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    'h-12 rounded-xl border-slate-200/90 bg-slate-50/80 px-4 text-[15px] text-slate-900 shadow-none transition placeholder:text-slate-400 focus-visible:border-[#1D70D8]/50 focus-visible:bg-white focus-visible:ring-[#1D70D8]/25';

  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-[#1D70D8]/12 blur-3xl" />
        <div className="absolute right-[-5%] top-16 h-72 w-72 rounded-full bg-pink-200/25 blur-3xl" />
        <div className="absolute bottom-20 left-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <FadeIn className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-3xl lg:text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#05335C]">{t('eyebrow')}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B1F3A] sm:text-5xl sm:leading-[1.1]">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 lg:mx-0">
            {t('subtitle')}
          </p>
        </FadeIn>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <FadeIn className="space-y-4">
            {[
              {
                icon: Mail,
                title: t('emailTitle'),
                body: 'contact@caddynote.com',
                hint: t('emailHint'),
              },
              {
                icon: Phone,
                title: t('phoneTitle'),
                body: '+33 1 23 45 67 89',
                hint: t('phoneHint'),
              },
              {
                icon: MapPin,
                title: t('presenceTitle'),
                body: t('presenceBody'),
                hint: t('presenceHint'),
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur-sm"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: BLUE }}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3A]">{item.title}</h2>
                  <p className="mt-0.5 text-[15px] font-medium text-slate-700">{item.body}</p>
                  <p className="mt-1 text-xs text-slate-600">{item.hint}</p>
                </div>
              </div>
            ))}

            <div
              className="rounded-2xl p-5 text-white"
              style={{ background: `linear-gradient(145deg, ${NAVY} 0%, #134078 100%)` }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#7EB6FF]">
                <Clock className="h-4 w-4" aria-hidden />
                {t('supportEyebrow')}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{t('supportBody')}</p>
              <ul className="mt-4 space-y-2">
                {supportItems.map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm text-white/90">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>

          <FadeIn delay={0.06}>
            <section
              id="contact"
              className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-8 lg:p-10"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#1D70D8]">
                  <Building2 className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                    {t('formTitle')}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{t('formSubtitle')}</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div>
                  <p className="mb-2.5 text-sm font-semibold text-[#0B1F3A]">{t('subjectLabel')}</p>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((opt) => {
                      const active = formData.subject === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => selectSubject(opt)}
                          disabled={isSubmitting}
                          className={cn(
                            'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                            active
                              ? 'border-transparent bg-[#1D70D8] text-white shadow-[0_8px_20px_-8px_rgba(29,112,216,0.7)]'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-[#1D70D8]/35 hover:bg-[#E8F1FF] hover:text-[#1D70D8]'
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
                      <User className="h-3.5 w-3.5 text-[#1D70D8]" aria-hidden />
                      {t('name')}
                    </Label>
                    <Input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder={t('namePlaceholder')}
                      required
                      disabled={isSubmitting}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
                      <Mail className="h-3.5 w-3.5 text-[#1D70D8]" aria-hidden />
                      {t('email')}
                    </Label>
                    <Input
                      type="email"
                      id="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder={t('emailPlaceholder')}
                      required
                      disabled={isSubmitting}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject" className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
                    <MessageSquare className="h-3.5 w-3.5 text-[#1D70D8]" aria-hidden />
                    {t('subject')}
                  </Label>
                  <Input
                    type="text"
                    id="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder={t('subjectPlaceholder')}
                    required
                    disabled={isSubmitting}
                    className={fieldClass}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
                    <MessageSquare className="h-3.5 w-3.5 text-[#1D70D8]" aria-hidden />
                    {t('message')}
                  </Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={6}
                    placeholder={t('messagePlaceholder')}
                    required
                    disabled={isSubmitting}
                    className="min-h-[160px] rounded-xl border-slate-200/90 bg-slate-50/80 px-4 py-3 text-[15px] shadow-none transition placeholder:text-slate-400 focus-visible:border-[#1D70D8]/50 focus-visible:bg-white focus-visible:ring-[#1D70D8]/25"
                  />
                </div>

                <div className="flex flex-col gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-relaxed text-slate-600">{t('consent')}</p>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-12 shrink-0 rounded-full px-7 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(29,112,216,0.75)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_16px_32px_-10px_rgba(29,112,216,0.85)]"
                    style={{ backgroundColor: BLUE }}
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    {isSubmitting ? t('submitting') : t('submit')}
                  </Button>
                </div>
              </form>
            </section>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
