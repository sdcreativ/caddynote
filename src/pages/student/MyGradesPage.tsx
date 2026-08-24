import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BookOpen, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  fetchStudentGradeSummary,
  type StudentGradeSummary,
} from '@/services/strkGradeService';

export default function MyGradesPage() {
  const { t } = useTranslation('grades');
  const { user } = useStrkAuth();
  const [summary, setSummary] = useState<StudentGradeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchStudentGradeSummary(user.id)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('toast.loadImpossible'));
        setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, t]);

  const getGradeColor = (grade: number, maxGrade: number) => {
    const percentage = (grade / maxGrade) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTypeLabel = (type: string) => {
    const known: Record<string, string> = {
      exam: t('types.evaluation'),
      evaluation: t('types.evaluation'),
      homework: t('types.devoir'),
      devoir: t('types.devoir'),
      project: t('types.expose'),
      expose: t('types.expose'),
      quiz: t('types.participation'),
      participation: t('types.participation'),
    };
    return known[type] || type;
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, 'destructive' | 'secondary' | 'default' | 'outline'> = {
      exam: 'destructive',
      evaluation: 'destructive',
      homework: 'secondary',
      devoir: 'secondary',
      project: 'default',
      expose: 'default',
      quiz: 'outline',
      participation: 'outline',
    };
    return colors[type] || 'default';
  };

  const gradeCount = useMemo(
    () => summary?.subjects.reduce((n, s) => n + s.grades.length, 0) ?? 0,
    [summary]
  );

  const bestGrade = useMemo(() => {
    if (!summary?.subjects.length) return null;
    const values = summary.subjects.flatMap((s) => s.grades.map((g) => g.normalizedOutOf20));
    if (values.length === 0) return null;
    return Math.max(...values);
  }, [summary]);

  if (loading) {
    return (
      <div className="py-6">
        <LoadingState label={t('my.load')} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-6">
        <EmptyState title={t('toast.loadImpossible')} description={loadError} />
      </div>
    );
  }

  const average = summary?.overallAverageOutOf20 ?? null;
  const subjects = summary?.subjects ?? [];

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">{t('my.title')}</h1>
        <p className="mt-1 text-gray-500">{t('subtitleStudent')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3">
                <Award className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('stats.average')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {average == null
                    ? '—'
                    : `${average.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}/20`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3">
                <BookOpen className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('stats.count')}</p>
                <p className="text-2xl font-bold text-gray-900">{gradeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('my.subjects')}</p>
                <p className="text-2xl font-bold text-gray-900">{subjects.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-yellow-100 p-3">
                <Award className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('stats.best')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {bestGrade == null
                    ? '—'
                    : `${bestGrade.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}/20`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {subjects.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.none')} />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('my.bySubject')}</CardTitle>
              <CardDescription>{t('my.bySubjectHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {subjects.map((subject) => {
                  const subjectAvg = subject.averageOutOf20 ?? 0;
                  const percentage = (subjectAvg / 20) * 100;
                  return (
                    <div key={subject.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{subject.subjectName}</span>
                        <span className={`font-bold ${getGradeColor(subjectAvg, 20)}`}>
                          {subject.averageOutOf20 == null
                            ? '—'
                            : `${subject.averageOutOf20.toLocaleString('fr-FR', {
                                maximumFractionDigits: 2,
                              })}/20`}
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {subjects.map((subject) => (
            <Card key={`detail-${subject.key}`}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{subject.subjectName}</CardTitle>
                    {subject.courseName && subject.courseName !== subject.subjectName && (
                      <CardDescription>{subject.courseName}</CardDescription>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t('my.subjectAverage')}
                    </p>
                    <p className={`text-xl font-bold ${getGradeColor(subject.averageOutOf20 ?? 0, 20)}`}>
                      {subject.averageOutOf20 == null
                        ? '—'
                        : `${subject.averageOutOf20.toLocaleString('fr-FR', {
                            maximumFractionDigits: 2,
                          })} / 20`}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {subject.grades.map((grade) => (
                  <div key={grade.id} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold">{grade.title}</h3>
                        <p className="text-sm text-gray-500">
                          {new Date(grade.date).toLocaleDateString('fr-FR')}
                          {grade.coefficient !== 1 ? ` · coeff. ${grade.coefficient}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`text-2xl font-bold ${getGradeColor(grade.gradeValue, grade.maxGrade)}`}
                        >
                          {grade.gradeValue}/{grade.maxGrade}
                        </div>
                        <Badge variant={getTypeColor(grade.gradeType)}>
                          {getTypeLabel(grade.gradeType)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
