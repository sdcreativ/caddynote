import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SendSignatureRequest from '@/components/signature/SendSignatureRequest';
import { useTranslation } from 'react-i18next';

interface CreateSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSignatureDialog({ open, onOpenChange }: CreateSignatureDialogProps) {
  const { t } = useTranslation('signatures');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
        </DialogHeader>
        <SendSignatureRequest onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
