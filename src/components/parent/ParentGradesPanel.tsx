import { Award } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StudentGradeSummary } from '@/services/strkGradeService';

type ParentGradesPanelProps = {
  canView: boolean;
  loading: boolean;
  gradeSummary: StudentGradeSummary | null;
};

/** Notes publiées — extrait de Mes enfants. */
export function ParentGradesPanel({ canView, loading, gradeSummary }: ParentGradesPanelProps) {
  if (!canView) {
    return <p className="text-sm text-gray-500">Vous n'avez pas accès aux notes de cet enfant.</p>;
  }
  if (loading) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }
  if (!gradeSummary || gradeSummary.subjects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Award className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">Aucune note publiée</h3>
          <p className="text-gray-500">Les notes apparaîtront ici dès qu'elles seront publiées.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {gradeSummary.overallAverageOutOf20 != null ? (
        <Card className="border-blue-100 bg-blue-50/40">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Moyenne générale</p>
              <p className="text-xs text-slate-500">Pondérée par le coefficient de chaque matière</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">
              {gradeSummary.overallAverageOutOf20.toLocaleString('fr-FR', {
                maximumFractionDigits: 2,
              })}
              <span className="text-base font-semibold text-slate-500"> / 20</span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      {gradeSummary.subjects.map((subject) => (
        <Card key={subject.key}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{subject.subjectName}</CardTitle>
                {subject.courseName && subject.courseName !== subject.subjectName ? (
                  <CardDescription>{subject.courseName}</CardDescription>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Moyenne</p>
                <p className="text-xl font-bold text-slate-900">
                  {subject.averageOutOf20 == null
                    ? '—'
                    : `${subject.averageOutOf20.toLocaleString('fr-FR', {
                        maximumFractionDigits: 2,
                      })} / 20`}
                </p>
                <p className="text-[11px] text-slate-400">Coeff. matière {subject.courseCoefficient}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {subject.grades.map((grade) => (
              <div
                key={grade.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{grade.title}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(grade.date).toLocaleDateString('fr-FR')}
                    {grade.coefficient !== 1 ? ` · coeff. ${grade.coefficient}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold">
                    {grade.gradeValue}/{grade.maxGrade}
                  </p>
                  {grade.maxGrade !== 20 ? (
                    <p className="text-[11px] text-slate-400">≈ {grade.normalizedOutOf20}/20</p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
