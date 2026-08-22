
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ContactDialogProps {
  studentName: string;
  studentEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendMessage: () => void;
}

export const ContactDialog = ({ 
  studentName, 
  studentEmail, 
  open, 
  onOpenChange, 
  onSendMessage 
}: ContactDialogProps) => {
  const { t } = useTranslation('students');
  const { t: tc } = useTranslation('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('contactDialog.title', { name: studentName })}</DialogTitle>
          <DialogDescription>
            {t('contactDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">{t('contactDialog.email')}</p>
              <p>{studentEmail}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('contactDialog.message')}</p>
              <textarea 
                className="w-full min-h-[120px] p-3 border rounded-md" 
                placeholder={t('contactDialog.messagePlaceholder')}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={onSendMessage} className="bg-edusign-600">
              {tc('actions.send')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
