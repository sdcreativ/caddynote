
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

interface SignatureDetailsDialogProps {
  signature: any; // Accepter tout type de signature (StrkSignature ou Signature)
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SignatureDetailsDialog = ({ signature, open, onOpenChange }: SignatureDetailsDialogProps) => {
  const { t } = useTranslation('signatures');
  if (!signature) return null;

  // Helper functions pour extraire les données selon le format
  const getStudentName = () => {
    if (signature.student) {
      return `${signature.student.first_name || ''} ${signature.student.last_name || ''}`.trim() || t('details.unknownStudent');
    }
    return signature.studentName || t('details.unknownStudent');
  };

  const getTypeLabel = () => {
    switch (signature.type) {
      case 'entry': return t('type.entry');
      case 'exit': return t('type.exit');
      case 'document': return t('type.document');
      default: return signature.type || t('details.unspecified');
    }
  };

  const getStatusInfo = () => {
    switch (signature.status) {
      case 'pending':
        return { icon: Clock, color: 'text-yellow-500', label: t('status.pending') };
      case 'completed':
        return { icon: CheckCircle, color: 'text-green-500', label: t('status.completed') };
      case 'expired':
        return { icon: AlertTriangle, color: 'text-red-500', label: t('status.expired') };
      default:
        return { icon: Clock, color: 'text-gray-500', label: signature.status || t('details.unknown') };
    }
  };

  const formatDate = () => {
    try {
      return new Date(signature.date).toLocaleDateString('fr-FR');
    } catch {
      return t('details.invalidDate');
    }
  };

  const formatTime = () => {
    try {
      if (signature.completed_at) {
        return new Date(signature.completed_at).toLocaleTimeString('fr-FR');
      }
      if (signature.completedAt) {
        return new Date(signature.completedAt).toLocaleTimeString('fr-FR');
      }
      // Extraire l'heure de la date si pas d'heure spécifique
      return new Date(signature.date).toLocaleTimeString('fr-FR');
    } catch {
      return t('details.timeUnavailable');
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('details.title')}</DialogTitle>
          <DialogDescription>
            {t('details.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.student')}</p>
              <p className="font-medium">{getStudentName()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.type')}</p>
              <Badge variant="outline">{getTypeLabel()}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.date')}</p>
              <p className="font-medium">{formatDate()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.time')}</p>
              <p className="font-medium">{formatTime()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.status')}</p>
              <div className="flex items-center mt-1">
                <StatusIcon className={`h-5 w-5 ${statusInfo.color} mr-2`} />
                <p className="font-medium">{statusInfo.label}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.method')}</p>
              <p className="font-medium">{t('details.methodValue')}</p>
            </div>
          </div>

          {signature.title && (
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.titleLabel')}</p>
              <p className="font-medium">{signature.title}</p>
            </div>
          )}

          {signature.description && (
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.descLabel')}</p>
              <p className="text-sm text-gray-700">{signature.description}</p>
            </div>
          )}

          {signature.expires_at && (
            <div>
              <p className="text-sm font-medium text-gray-500">{t('details.expires')}</p>
              <p className="font-medium">
                {new Date(signature.expires_at).toLocaleDateString('fr-FR')}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-500">{t('details.signature')}</p>
            <div className="mt-2 border rounded-md p-4 bg-gray-50">
              {signature.signature_data ? (
                <div className="flex flex-col items-center space-y-2">
                  <p className="text-sm text-gray-600 mb-2">{t('details.captured')}</p>
                  <img 
                    src={signature.signature_data} 
                    alt={t('details.alt')}
                    className="max-w-full max-h-32 border border-gray-200 rounded bg-white"
                  />
                </div>
              ) : (
                <p className="text-center text-gray-400">{t('details.previewUnavailable')}</p>
              )}
            </div>
          </div>

          <div className="pt-4">
            <Button onClick={() => onOpenChange(false)} className="w-full">
              {tCommon('actions.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
