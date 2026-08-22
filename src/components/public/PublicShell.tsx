import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionConfig } from 'framer-motion';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicAmbient } from '@/components/public/PublicAmbient';
import { cn } from '@/lib/utils';

type PublicShellProps = {
  children: ReactNode;
  className?: string;
  footer?: boolean;
};

export function PublicShell({ children, className, footer = true }: PublicShellProps) {
  const { t } = useTranslation('common');
  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('public-site relative flex min-h-screen flex-col overflow-x-hidden', className)}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-[#1D70D8] focus:px-4 focus:py-2 focus:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          {t('skipToContent')}
        </a>
        <PublicAmbient />
        <PublicHeader />
        <div id="main-content" tabIndex={-1} className="relative z-10 flex flex-1 flex-col outline-none">
          {children}
        </div>
        {footer ? <PublicFooter /> : null}
      </div>
    </MotionConfig>
  );
}
