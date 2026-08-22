import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, BookOpen, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { fetchGradesByStudent, type StrkGradeWithRelations } from '@/services/strkGradeService';

type DisplayGrade = {
  id: string;
  subject: string;
  title: string;
  grade: number;
  maxGrade: number;
  date: string;
  type: string;
  comment?: string;
};

const mapToDisplay = (g: StrkGradeWithRelations): DisplayGrade => ({
  id: g.id,
  subject: g.course?.name || g.title,
  title: g.title,
  grade: g.grade_value,
  maxGrade: g.max_grade || 20,
  date: g.date,
  type: g.grade_type || 'exam',
  comment: g.description,
});

export default function MyGradesPage() {
  const { t } = useTranslation('grades');
  const { user } = useStrkAuth();
  const [grades, setGrades] = useState<DisplayGrade[]>([]);
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
    void fetchGradesByStudent(user.id)
      .then((rows) => {
        if (cancelled) return;
        setGrades(rows.map(mapToDisplay));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('toast.loadImpossible'));
        setGrades([]);
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

  const average = useMemo(() => {
    if (grades.length === 0) return null;
    const total = grades.reduce((sum, grade) => sum + (grade.grade / grade.maxGrade) * 20, 0);
    return Math.round((total / grades.length) * 100) / 100;
  }, [grades]);

  const subjectAverages = useMemo(() => {
    return grades.reduce(
      (acc, grade) => {
        if (!acc[grade.subject]) {
          acc[grade.subject] = { total: 0, count: 0 };
        }
        acc[grade.subject].total += (grade.grade / grade.maxGrade) * 20;
        acc[grade.subject].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>
    );
  }, [grades]);

  const bestGrade = useMemo(() => {
    if (grades.length === 0) return null;
    return Math.max(...grades.map((g) => (g.grade / g.maxGrade) * 20));
  }, [grades]);

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
                  {average == null ? '—' : `${average}/20`}
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
                <p className="text-2xl font-bold text-gray-900">{grades.length}</p>
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
                <p className="text-2xl font-bold text-gray-900">{Object.keys(subjectAverages).length}</p>
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
                  {bestGrade == null ? '—' : `${Math.round(bestGrade * 100) / 100}/20`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {grades.length === 0 ? (
        <EmptyState title={t('empty.title')} description={t('empty.none')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('my.bySubject')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(subjectAverages).map(([subject, data]) => {
                  const subjectAvg = Math.round((data.total / data.count) * 100) / 100;
                  const percentage = (subjectAvg / 20) * 100;
                  return (
                    <div key={subject} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{subject}</span>
                        <span className={`font-bold ${getGradeColor(subjectAvg, 20)}`}>
                          {subjectAvg}/20
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('my.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {grades.map((grade) => (
                  <div key={grade.id} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{grade.subject}</h3>
                        <p className="text-sm text-gray-600">{grade.title}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(grade.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-2xl font-bold ${getGradeColor(grade.grade, grade.maxGrade)}`}
                        >
                          {grade.grade}/{grade.maxGrade}
                        </div>
                        <Badge variant={getTypeColor(grade.type)}>{getTypeLabel(grade.type)}</Badge>
                      </div>
                    </div>
                    {grade.comment && (
                      <p className="mt-2 text-sm text-gray-600">{grade.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
