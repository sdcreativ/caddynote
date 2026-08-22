
import { useTranslation } from 'react-i18next';
import { Absence } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, X } from 'lucide-react';

interface AbsencesDialogProps {
  studentName: string;
  absences: Absence[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AbsencesDialog = ({ studentName, absences, open, onOpenChange }: AbsencesDialogProps) => {
  const { t } = useTranslation('students');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('absences.title', { name: studentName })}</DialogTitle>
          <DialogDescription>
            {t('absences.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {absences.length > 0 ? (
            <div className="space-y-4">
              {absences.map(absence => (
                <div key={absence.id} className={`p-4 border rounded-md ${
                  absence.type === 'absence' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
                }`}>
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">
                        {t('absences.typeLine', {
                          type: absence.type === 'absence' ? t('absences.absence') : t('absences.late'),
                          date: absence.date,
                        })}
                      </p>
                      <p className="text-sm text-gray-600">
                        {absence.type === 'absence' 
                          ? (absence.duration >= 360 ? t('absences.fullDay') : t('absences.hours', { hours: Math.floor(absence.duration / 60), minutes: absence.duration % 60 }))
                          : t('absences.minutes', { count: absence.duration })
                        }
                      </p>
                    </div>
                    <div>
                      {absence.justified ? (
                        <div className="flex items-center text-green-600">
                          <Check className="h-5 w-5 mr-1" />
                          <span>{t('absences.justified')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <X className="h-5 w-5 mr-1" />
                          <span>{t('absences.unjustified')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {absence.justified && absence.justification && (
                    <p className="text-sm text-gray-500 mt-2">
                      {t('absences.reason', { reason: absence.justification })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-gray-500">
              {t('absences.empty')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
