import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { apiClient } from '@/lib/apiClient';
import { fetchCoursesByInstitution } from '@/services/strkCourseService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SetupCounts = {
  teachers: number;
  classes: number;
  students: number;
  courses: number;
};

/**
 * Checklist de démarrage Direction : enseignants → classes → élèves → cours → appel.
 * Affichée tant que la chaîne de liaison n’est pas complète.
 */
export function SetupChecklist() {
  const { t } = useTranslation('dashboard');
  const { user } = useStrkAuth();
  const [counts, setCounts] = useState<SetupCounts | null>(null);

  useEffect(() => {
    const institutionId = user?.institutionId;
    if (!institutionId) return;
    let cancelled = false;

    (async () => {
      try {
        const [{ users }, { classes }, courses] = await Promise.all([
          apiClient.get<{ users: Array<{ role: string }> }>(
            `/users?institutionId=${encodeURIComponent(institutionId)}`
          ),
          apiClient.get<{ classes: unknown[] }>(
            `/classes?institutionId=${encodeURIComponent(institutionId)}`
          ),
          fetchCoursesByInstitution(institutionId),
        ]);
        if (cancelled) return;
        setCounts({
          teachers: (users || []).filter((u) => u.role === 'teacher' || u.role === 'head_teacher')
            .length,
          classes: (classes || []).length,
          students: (users || []).filter((u) => u.role === 'student').length,
          courses: (courses || []).length,
        });
      } catch {
        if (!cancelled) setCounts(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.institutionId]);

  if (!counts) return null;

  const steps = [
    {
      id: 'teachers',
      done: counts.teachers > 0,
      href: '/teachers',
      label: t('setup.stepTeachers'),
    },
    {
      id: 'classes',
      done: counts.classes > 0,
      href: '/classes',
      label: t('setup.stepClasses'),
    },
    {
      id: 'students',
      done: counts.students > 0,
      href: '/students',
      label: t('setup.stepStudents'),
    },
    {
      id: 'courses',
      done: counts.courses > 0,
      href: '/classes',
      label: t('setup.stepCourses'),
    },
    {
      id: 'call',
      done: false,
      href: '/attendance',
      label: t('setup.stepCall'),
    },
  ];

  const linkingDone =
    counts.teachers > 0 && counts.classes > 0 && counts.students > 0 && counts.courses > 0;
  // Masquer seulement quand la chaîne est complète (l’appel reste une action quotidienne).
  if (linkingDone) return null;

  const next = steps.find((s) => !s.done) || steps[steps.length - 1];

  return (
    <Card className="border-blue-100 bg-blue-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-900">
          {t('setup.title')}
        </CardTitle>
        <p className="text-sm text-slate-600">{t('setup.body')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {steps
            .filter((s) => s.id !== 'call')
            .map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm">
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                )}
                <Link
                  to={step.href}
                  className={
                    step.done
                      ? 'text-slate-500 line-through'
                      : 'font-medium text-blue-700 hover:underline'
                  }
                >
                  {step.label}
                </Link>
              </li>
            ))}
        </ul>
        <Button asChild size="sm">
          <Link to={next.href}>{t('setup.nextAction', { step: next.label })}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
