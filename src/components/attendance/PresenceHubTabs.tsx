import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { hasAnyRole, SECRETARIAT_ROLES, DIRECTION_ROLES } from '@/lib/roles';
import { useStrkAuth } from '@/hooks/useStrkAuth';

/** Onglets Appel | Justificatifs | Émargement — hub Présences (Direction / secrétariat / enseignant). */
export function PresenceHubTabs() {
  const { t } = useTranslation('nav');
  const { t: ta } = useTranslation('attendance');
  const location = useLocation();
  const { user } = useStrkAuth();

  const isTeacher = user?.role === 'teacher' || user?.role === 'head_teacher';
  const showStaff =
    hasAnyRole(user?.role, DIRECTION_ROLES) || hasAnyRole(user?.role, SECRETARIAT_ROLES);
  if (!showStaff && !isTeacher) return null;

  const callHref = isTeacher ? '/teacher-attendance' : '/attendance';
  const onCall =
    location.pathname === callHref || location.pathname.startsWith(`${callHref}/`);
  const onAbsences =
    location.pathname === '/absences' || location.pathname.startsWith('/absences/');
  const onSignatures =
    location.pathname === '/signatures' || location.pathname.startsWith('/signatures/');

  const tabClass = (active: boolean) =>
    cn(
      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
    );

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
      <p className="mr-2 text-sm font-semibold text-slate-700">{t('items.attendance')}</p>
      <Link to={callHref} className={tabClass(onCall)} aria-current={onCall ? 'page' : undefined}>
        {t('items.call')}
      </Link>
      <Link
        to="/absences"
        className={tabClass(onAbsences)}
        aria-current={onAbsences ? 'page' : undefined}
      >
        {ta('page.justificationsTab')}
      </Link>
      {!isTeacher ? (
        <Link
          to="/signatures"
          className={tabClass(onSignatures)}
          aria-current={onSignatures ? 'page' : undefined}
        >
          {t('items.signatures')}
        </Link>
      ) : null}
    </div>
  );
}
