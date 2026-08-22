import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, FileText, AlertCircle, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { useStrkAbsences } from "@/hooks/useStrkAbsences";
import { JustificationDialog } from "@/components/absences/JustificationDialog";

const MyAbsencesPage = () => {
  const { t } = useTranslation('absences');
  const { user } = useStrkAuth();
  const { absences, loadAbsencesByStudent, isLoading } = useStrkAbsences();
  const [selectedAbsenceId, setSelectedAbsenceId] = useState<string | undefined>();
  const [justificationDialogOpen, setJustificationDialogOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadAbsencesByStudent(user.id);
    }
  }, [user?.id, loadAbsencesByStudent]);

  const handleJustifyAbsence = (absenceId: string) => {
    setSelectedAbsenceId(absenceId);
    setJustificationDialogOpen(true);
  };

  const handleJustificationSubmitted = () => {
    if (user?.id) {
      loadAbsencesByStudent(user.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">{t('mine.loading')}</div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('mine.title')}</h1>
        <p className="text-muted-foreground">
          {t('mine.subtitle')}
        </p>
      </div>

      {absences.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('mine.emptyTitle')}</h3>
            <p className="text-gray-500">
              {t('mine.emptyBody')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {absences.map((absence) => {
            const isJustified = absence.justified;
            const hasJustificationPending = absence.justification_reason && !isJustified;
            
            const cardClass = !isJustified && !hasJustificationPending 
              ? "border-red-200 bg-red-50"
              : hasJustificationPending 
              ? "border-orange-200 bg-orange-50"
              : "border-green-200 bg-green-50";
            
            const titleClass = !isJustified && !hasJustificationPending
              ? "text-red-900"
              : hasJustificationPending
              ? "text-orange-900" 
              : "text-green-900";
            
            const contentClass = !isJustified && !hasJustificationPending
              ? "text-red-700"
              : hasJustificationPending
              ? "text-orange-700"
              : "text-green-700";

            const suffix = !isJustified && !hasJustificationPending
              ? t('mine.suffixUnjustified')
              : hasJustificationPending
              ? t('mine.suffixPending')
              : t('mine.suffixJustified');

            return (
              <Card key={absence.id} className={cardClass}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className={`flex items-center gap-2 ${titleClass}`}>
                        {!isJustified && !hasJustificationPending && <AlertCircle className="h-5 w-5" />}
                        {hasJustificationPending && <Clock className="h-5 w-5" />}
                        {isJustified && <FileText className="h-5 w-5" />}
                        {t('mine.cardTitle', {
                          type: absence.type === 'absence' ? t('types.absence') : t('types.lateness'),
                          suffix,
                        })}
                      </CardTitle>
                      <CardDescription className={contentClass}>
                        {absence.class_name && t('mine.courseLabel', { name: absence.class_name })}
                        {absence.student?.first_name && t('mine.studentNameSuffix', {
                          firstName: absence.student.first_name,
                          lastName: absence.student.last_name,
                        })}
                      </CardDescription>
                    </div>
                    <Badge 
                      variant={
                        isJustified 
                          ? "default" 
                          : hasJustificationPending 
                          ? "secondary" 
                          : "destructive"
                      }
                      className={
                        isJustified 
                          ? "bg-green-100 text-green-800" 
                          : undefined
                      }
                    >
                      {isJustified ? t('status.justified') : hasJustificationPending ? t('status.pending') : t('status.unjustified')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={`flex items-center gap-4 text-sm ${contentClass}`}>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(absence.date)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {absence.start_time && absence.end_time 
                        ? t('mine.timeRange', { start: absence.start_time, end: absence.end_time })
                        : t('mine.durationMinutes', { count: absence.duration_minutes })
                      }
                    </div>
                  </div>
                  
                  {absence.justification_reason && (
                    <p className="text-sm text-muted-foreground">
                      <strong>{t('mine.reasonLabel')}</strong> {absence.justification_reason}
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    {!isJustified && !hasJustificationPending && (
                      <Button 
                        size="sm" 
                        onClick={() => handleJustifyAbsence(absence.id)}
                      >
                        {t('mine.justify')}
                      </Button>
                    )}
                    
                    {hasJustificationPending && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleJustifyAbsence(absence.id)}
                      >
                        {t('mine.editJustification')}
                      </Button>
                    )}
                    
                    {(isJustified || hasJustificationPending) && absence.justification_file && (
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        {t('mine.viewDocument')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <JustificationDialog
        open={justificationDialogOpen}
        onOpenChange={setJustificationDialogOpen}
        absenceId={selectedAbsenceId}
        onJustificationSubmitted={handleJustificationSubmitted}
      />
    </div>
  );
};

export default MyAbsencesPage;
