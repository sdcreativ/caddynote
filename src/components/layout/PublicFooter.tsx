import { Link } from 'react-router-dom';
import { CaddyNoteLogo } from '@/components/brand/CaddyNoteLogo';
import { handleAnchorClick } from '@/lib/smoothScroll';
import { useTranslation } from 'react-i18next';
import { telHref, usePublicVitrine, waHref } from '@/lib/publicVitrine';

export function PublicFooter() {
  const { t } = useTranslation('publicFooter');
  const year = new Date().getFullYear();
  const { contact } = usePublicVitrine();
  const phoneLink = contact.phone ? telHref(contact.phone) : null;
  const whatsappLink = contact.whatsapp ? waHref(contact.whatsapp) : null;

  return (
    <footer className="relative z-10 mt-auto w-full bg-[#001A3D] pb-24 text-white lg:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        <div className="grid gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <CaddyNoteLogo to="/" inverted size={32} className="[&_.font-display]:text-lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/80">
              {t('tagline')}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{t('product')}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/80">
              <li>
                <a href="/#features" onClick={(e) => handleAnchorClick(e, '/#features')} className="hover:text-white">
                  {t('links.solution')}
                </a>
              </li>
              <li>
                <a href="/#pricing" onClick={(e) => handleAnchorClick(e, '/#pricing')} className="hover:text-white">
                  {t('links.pricing')}
                </a>
              </li>
              <li><Link to="/signup" className="hover:text-white">{t('links.signup')}</Link></li>
              <li><Link to="/sign" className="hover:text-white">{t('links.login')}</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{t('resources')}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/80">
              <li><Link to="/aide" className="hover:text-white">{t('links.help')}</Link></li>
              <li><Link to="/aide/guide-ecoles" className="hover:text-white">{t('links.guides')}</Link></li>
              <li><Link to="/admissions" className="hover:text-white">{t('links.admissions')}</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{t('company')}</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/80">
              <li><Link to="/about" className="hover:text-white">{t('links.about')}</Link></li>
              <li><Link to="/contact" className="hover:text-white">{t('links.contact')}</Link></li>
              {contact.email ? (
                <li>
                  <a href={`mailto:${contact.email}`} className="hover:text-white">
                    {contact.email}
                  </a>
                </li>
              ) : null}
              {phoneLink ? (
                <li>
                  <a href={phoneLink} className="hover:text-white">
                    {contact.phone}
                  </a>
                </li>
              ) : null}
              {whatsappLink ? (
                <li>
                  <a href={whatsappLink} className="hover:text-white" rel="noopener noreferrer">
                    WhatsApp {contact.whatsapp}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-white/80 sm:flex-row sm:px-8 lg:px-10">
          <p>{t('copyright', { year })}</p>
          <p>{t('legal')}</p>
        </div>
      </div>
    </footer>
  );
}
