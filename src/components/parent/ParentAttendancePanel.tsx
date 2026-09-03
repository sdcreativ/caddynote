import { AlertCircle, Calendar, Clock, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type ParentAbsenceItem = {
  id: string;
  type: string;
  date: string;
  duration_minutes: number;
  justified: boolean;
  justification_reason?: string | null;
  justification_file?: string | null;
  course_name?: string | null;
  class_name?: string | null;
};

type ParentAttendancePanelProps = {
  canView: boolean;
  loading: boolean;
  absences: ParentAbsenceItem[];
  onJustify: (absenceId: string) => void;
  onOpenFile: (absenceId: string) => void;
};

/** Absences / retards — extrait de Mes enfants. */
export function ParentAttendancePanel({
  canView,
  loading,
  absences,
  onJustify,
  onOpenFile,
}: ParentAttendancePanelProps) {
  if (!canView) {
    return <p className="text-sm text-gray-500">Vous n'avez pas accès à la présence de cet enfant.</p>;
  }
  if (loading) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }
  if (absences.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">Aucune absence</h3>
          <p className="text-gray-500">Aucune absence enregistrée pour le moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {absences.map((absence) => {
        const isJustified = absence.justified;
        const hasJustificationPending = Boolean(absence.justification_reason && !isJustified);
        const cardClass =
          !isJustified && !hasJustificationPending
            ? 'border-red-200 bg-red-50'
            : hasJustificationPending
              ? 'border-orange-200 bg-orange-50'
              : 'border-green-200 bg-green-50';

        return (
          <Card key={absence.id} className={cardClass}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {!isJustified && !hasJustificationPending ? <AlertCircle className="h-4 w-4" /> : null}
                    {hasJustificationPending ? <Clock className="h-4 w-4" /> : null}
                    {isJustified ? <FileText className="h-4 w-4" /> : null}
                    {absence.type === 'absence' ? 'Absence' : 'Retard'}
                  </CardTitle>
                  <CardDescription>
                    {absence.course_name
                      ? `Cours : ${absence.course_name}`
                      : absence.class_name
                        ? `Classe : ${absence.class_name}`
                        : null}
                  </CardDescription>
                </div>
                <Badge
                  variant={isJustified ? 'default' : hasJustificationPending ? 'secondary' : 'destructive'}
                >
                  {isJustified ? 'Justifiée' : hasJustificationPending ? 'En attente' : 'Non justifiée'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(absence.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {absence.duration_minutes} minutes
                </div>
              </div>
              {absence.justification_reason ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Motif :</strong> {absence.justification_reason}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!isJustified ? (
                  <Button size="sm" onClick={() => onJustify(absence.id)}>
                    {hasJustificationPending ? 'Modifier le justificatif' : "Justifier l'absence"}
                  </Button>
                ) : null}
                {absence.justification_file ? (
                  <Button size="sm" variant="outline" onClick={() => onOpenFile(absence.id)}>
                    Voir le document
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
