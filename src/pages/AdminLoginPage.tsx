import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import { Shield, Lock, AlertTriangle, Eye } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, useReducedMotion, MotionConfig } from 'framer-motion';
import { PublicAmbient } from '@/components/public/PublicAmbient';
import { CaddyNoteLogo, CaddyNoteMark } from '@/components/brand/CaddyNoteLogo';
import { BRAND } from '@/lib/brand';
import { useTranslation } from 'react-i18next';

const AdminLoginPage = () => {
  const reduce = useReducedMotion();
  const { t } = useTranslation('auth');
  const year = new Date().getFullYear();

  return (
    <MotionConfig reducedMotion="user">
    <div className="public-site relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <PublicAmbient />
      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 lg:grid-cols-2">
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6 text-[#0B1F33]"
        >
          <div className="space-y-4">
            <CaddyNoteLogo tagline={BRAND.taglineTeam} size={44} />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{t('admin.pageTitle')}</h1>
              <p className="text-slate-500">{t('admin.pageSubtitle')}</p>
            </div>
          </div>

          <Alert className="border-amber-300 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900">
              <strong>{t('admin.zoneAlert')}</strong>
            </AlertDescription>
          </Alert>

          <ul className="space-y-3 text-slate-600">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 text-[#05335C]" aria-hidden="true" />
              {t('admin.bulletReserved')}
            </li>
            <li className="flex items-start gap-2">
              <Eye className="mt-0.5 h-4 w-4 text-[#05335C]" aria-hidden="true" />
              {t('admin.bulletLogged')}
            </li>
            <li className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 text-[#05335C]" aria-hidden="true" />
              {t('admin.bulletSupport')}
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-6"
        >
          <Card className="border-slate-200 bg-white/90 shadow-none">
            <CardHeader className="space-y-1 text-center">
              <div className="mb-3 flex justify-center">
                <CaddyNoteMark size={48} />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">{t('admin.cardTitle')}</CardTitle>
              <CardDescription>{t('admin.cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminLoginForm />
            </CardContent>
          </Card>
          <p className="text-center text-sm text-slate-500">
            © {year} CaddyNote — {t('admin.footer')}
            <span className="mt-1 block">
              <Lock className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {t('admin.ssl')}
            </span>
          </p>
        </motion.div>
      </div>
    </div>
    </MotionConfig>
  );
};

export default AdminLoginPage;
