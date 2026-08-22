import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HelpCircle,
  BookOpen,
  Mail,
  UserCheck,
  FileSignature,
  Users,
  Building2,
  GraduationCap,
  ArrowUpRight,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { FadeIn, Stagger, StaggerItem } from '@/components/public/FadeIn';

const guideIcons = {
  '/aide/guide-ecoles': Building2,
  '/aide/guide-admin': FileSignature,
  '/aide/guide-enseignants': UserCheck,
  '/aide/guide-etudiants': GraduationCap,
  '/aide/guide-parents': Users,
} as const;

export function HelpContent() {
  const { t } = useTranslation('help');
  const faq = t('faq', { returnObjects: true }) as { q: string; a: string }[];
  const guides = t('guides', { returnObjects: true }) as { to: string; title: string; description: string }[];

  return (
    <div className="space-y-14">
      <FadeIn>
        <section aria-labelledby="help-intro-heading">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#05335C]/8 text-[#05335C]">
            <HelpCircle className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm font-medium text-[#05335C]">{t('eyebrow')}</p>
          <h2 id="help-intro-heading" className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('intro')}</p>
        </section>
      </FadeIn>

      <FadeIn>
      <section aria-labelledby="help-faq-heading" className="border-t border-slate-200 pt-10">
        <div className="mb-6 flex items-center">
          <HelpCircle className="mr-3 h-6 w-6 shrink-0 text-[#05335C]" aria-hidden="true" />
          <h3 id="help-faq-heading" className="text-2xl font-semibold text-[#0B1F33]">
            {t('faqTitle')}
          </h3>
        </div>
        <Accordion type="single" collapsible className="w-full space-y-2">
          {faq.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i + 1}`} className="border-slate-200 px-0">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">{item.q}</AccordionTrigger>
              <AccordionContent className="pt-2 text-sm text-slate-600">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      </FadeIn>

      <FadeIn>
      <section aria-labelledby="help-guides-heading" className="border-t border-slate-200 pt-10">
        <div className="mb-6 flex items-center">
          <BookOpen className="mr-3 h-6 w-6 shrink-0 text-[#05335C]" aria-hidden="true" />
          <h3 id="help-guides-heading" className="text-2xl font-semibold text-[#0B1F33]">
            {t('guidesTitle')}
          </h3>
        </div>
        <p className="mb-6 text-slate-600">{t('guidesIntro')}</p>
        <Stagger className="divide-y divide-slate-200 border-t border-slate-200">
          {guides.map((guide) => {
            const Icon = guideIcons[guide.to as keyof typeof guideIcons] ?? BookOpen;
            return (
              <StaggerItem key={guide.to}>
                <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#05335C]" aria-hidden="true" />
                    <div>
                      <h4 className="font-semibold text-slate-900">{guide.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{guide.description}</p>
                    </div>
                  </div>
                  <Link
                    to={guide.to}
                    className="group inline-flex w-fit items-center text-sm font-medium text-[#05335C] hover:underline"
                  >
                    {t('consult')} <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                  </Link>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>
      </FadeIn>

      <FadeIn>
      <section aria-labelledby="help-contact-heading" className="border-t border-slate-200 pt-10">
        <div className="mb-4 flex items-center">
          <Mail className="mr-3 h-6 w-6 shrink-0 text-amber-500" aria-hidden="true" />
          <h3 id="help-contact-heading" className="text-2xl font-semibold text-[#0B1F33]">
            {t('moreTitle')}
          </h3>
        </div>
        <p className="text-slate-600">{t('moreBody')}</p>
        <div className="mt-6">
          <Link
            to="/contact"
            className="inline-flex items-center rounded-md bg-[#05335C] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#031d33] focus:outline-none focus:ring-2 focus:ring-[#05335C] focus:ring-offset-2"
          >
            {t('contactCta')}
          </Link>
        </div>
      </section>
      </FadeIn>
    </div>
  );
}
