import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/EmptyState';
import { Award, Filter, Search, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StrkGrade } from '@/types/strk';

const gradeColor = (grade: number, maxGrade: number) => {
  const percentage = (grade / maxGrade) * 100;
  if (percentage >= 75) return 'text-green-600 bg-green-50';
  if (percentage >= 50) return 'text-orange-600 bg-orange-50';
  return 'text-red-600 bg-red-50';
};

type GradesEntryPanelProps = {
  filteredGrades: StrkGrade[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  coursesCount: number;
  canCreateGrades: boolean;
};

/** Onglet Saisie — stats, filtres et liste des notes. */
export function GradesEntryPanel({
  filteredGrades,
  searchTerm,
  onSearchTermChange,
  filterType,
  onFilterTypeChange,
  coursesCount,
  canCreateGrades,
}: GradesEntryPanelProps) {
  const { t } = useTranslation('grades');

  const average =
    filteredGrades.length === 0
      ? 0
      : (
          filteredGrades.reduce(
            (sum, grade) => sum + (grade.grade_value / grade.max_grade) * 20,
            0
          ) / filteredGrades.length
        ).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.average')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{t('outOf20', { value: average })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.count')}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredGrades.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('stats.best')}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {t('outOf20', {
                value:
                  filteredGrades.length > 0
                    ? Math.max(
                        ...filteredGrades.map((g) => (g.grade_value / g.max_grade) * 20)
                      ).toFixed(1)
                    : 0,
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={filterType} onValueChange={onFilterTypeChange}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter.all')}</SelectItem>
            <SelectItem value="evaluation">{t('filter.evaluation')}</SelectItem>
            <SelectItem value="devoir">{t('filter.devoir')}</SelectItem>
            <SelectItem value="exposé">{t('filter.expose')}</SelectItem>
            <SelectItem value="participation">{t('filter.participation')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredGrades.map((grade) => (
          <Card key={grade.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{grade.title}</CardTitle>
                  <CardDescription>
                    {new Date(grade.date).toLocaleDateString('fr-FR')} • {grade.grade_type}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${gradeColor(grade.grade_value, grade.max_grade)}`}
                  >
                    {grade.grade_value}/{grade.max_grade}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {t('outOf20', {
                      value: ((grade.grade_value / grade.max_grade) * 20).toFixed(1),
                    })}
                  </div>
                </div>
              </div>
            </CardHeader>
            {grade.description ? (
              <CardContent>
                <p className="text-sm text-muted-foreground">{grade.description}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}

        {filteredGrades.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            description={
              searchTerm || filterType !== 'all'
                ? t('empty.noMatch')
                : coursesCount === 0 && canCreateGrades
                  ? t('empty.noCourses')
                  : t('empty.none')
            }
          />
        ) : null}
      </div>
    </div>
  );
}
