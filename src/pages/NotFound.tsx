import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Home, ArrowLeft, Compass } from 'lucide-react';
import { PublicShell } from '@/components/public/PublicShell';
import { FadeIn } from '@/components/public/FadeIn';
import { useTranslation } from 'react-i18next';

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation('app');

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <FadeIn className="max-w-lg text-center">
          <Compass className="mx-auto h-12 w-12 text-amber-500" aria-hidden="true" />
          <p className="mt-4 text-7xl font-semibold tracking-tight text-[#05335C]">404</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#0B1F33]">{t('notFound.title')}</h1>
          <p className="mt-3 text-slate-600">
            {t('notFound.description')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-md bg-[#05335C] hover:bg-[#031d33]">
              <Link to="/dashboard">
                <Home className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('notFound.backDashboard')}
              </Link>
            </Button>
            <Button variant="outline" asChild className="rounded-md">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('notFound.backHome')}
              </Link>
            </Button>
          </div>
        </FadeIn>
      </main>
    </PublicShell>
  );
};

export default NotFound;
