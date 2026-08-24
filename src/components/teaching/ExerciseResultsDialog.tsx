import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { StrkExercise, StrkExerciseAttempt } from '@/types/exercises';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useTranslation } from 'react-i18next';

type AttemptWithStudent = StrkExerciseAttempt & {
  student?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
};

interface ExerciseResultsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: StrkExercise | null;
  loadAttempts: (exerciseId: string) => Promise<AttemptWithStudent[]>;
}

const studentLabel = (attempt: AttemptWithStudent) => {
  const first = attempt.student?.firstName?.trim() || '';
  const last = attempt.student?.lastName?.trim() || '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (attempt.student?.email) return attempt.student.email;
  return attempt.student_id.slice(0, 8);
};

const statusVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
  if (status === 'submitted' || status === 'graded') return 'default';
  if (status === 'abandoned') return 'destructive';
  return 'secondary';
};

export const ExerciseResultsDialog = ({
  isOpen,
  onClose,
  exercise,
  loadAttempts,
}: ExerciseResultsDialogProps) => {
  const { t } = useTranslation('exercises');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState<AttemptWithStudent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !exercise) return;
    let cancelled = false;
    const exerciseId = exercise.id;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await loadAttempts(exerciseId);
        if (!cancelled) setAttempts(data);
      } catch (err) {
        console.error('Erreur chargement résultats exercice:', err);
        if (!cancelled) {
          setAttempts([]);
          setError(t('teacher.resultsLoadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // loadAttempts est stable via le parent (useCallback) ; on se cale sur l'exercice ouvert.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- éviter rechargements en boucle
  }, [isOpen, exercise?.id, t]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('teacher.resultsTitle')}</DialogTitle>
          <DialogDescription>
            {exercise
              ? t('teacher.resultsSubtitle', { title: exercise.title })
              : t('teacher.results')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6 text-center">{error}</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t('teacher.resultsEmpty')}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('teacher.resultsCount', { count: attempts.length })}
            </p>
            <div className="space-y-2">
              {attempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div>
                    <div className="font-medium">{studentLabel(attempt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('teacher.resultsAttemptMeta', {
                        n: attempt.attempt_number,
                        date: new Date(attempt.submitted_at || attempt.started_at).toLocaleString('fr-FR'),
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(attempt.status)}>{attempt.status}</Badge>
                    <span className="text-sm font-medium tabular-nums">
                      {t('teacher.resultsScore', {
                        score: attempt.score,
                        max: attempt.max_score || exercise?.points || '—',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseResultsDialog;
