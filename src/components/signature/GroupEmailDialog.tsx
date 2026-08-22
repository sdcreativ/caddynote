import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Users, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { notifySignatureRequest } from '@/services/strkSignatureService';
import { ApiError } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import type { StrkSignature } from '@/types/strk';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

type SignatureWithStudent = StrkSignature & {
  student?: { first_name?: string | null; last_name?: string | null };
};

interface GroupEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signatures: SignatureWithStudent[];
  onSent?: () => void;
}

const studentLabel = (signature: SignatureWithStudent, fallback: string) => {
  const name = [signature.student?.first_name, signature.student?.last_name].filter(Boolean).join(' ');
  return name || fallback;
};

export const GroupEmailDialog = ({
  open,
  onOpenChange,
  signatures,
  onSent,
}: GroupEmailDialogProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('signatures');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(() => t('group.defaultMessage'));

  const handleSend = async () => {
    setIsLoading(true);
    let sent = 0;
    let notConfigured = 0;
    let failed = 0;
    try {
      for (const signature of signatures) {
        try {
          const result = await notifySignatureRequest(signature.student_id, signature.title, message);
          if (result === 'sent') sent += 1;
          else notConfigured += 1;
        } catch (error) {
          failed += 1;
          if (error instanceof ApiError && error.status === 501) {
            notConfigured += 1;
            failed -= 1;
          }
        }
      }

      if (notConfigured > 0 && sent === 0) {
        toast({
          title: t('group.emailNotConfiguredTitle'),
          description: t('group.emailNotConfiguredBody'),
          variant: 'destructive',
        });
      } else if (failed > 0) {
        toast({
          title: t('group.partialTitle'),
          description: t('group.partialBody', { sent, failed }),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('group.sentTitle'),
          description: t('group.sentBody', { sent, count: signatures.length }),
        });
      }
      onSent?.();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('group.title')}
          </DialogTitle>
          <DialogDescription>
            {t('group.description', { count: signatures.length, plural: signatures.length > 1 ? 's' : '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('group.recipients', { count: signatures.length })}</div>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 bg-muted/40 space-y-2">
              {signatures.map((signature) => (
                <div key={signature.id} className="flex items-center justify-between text-sm">
                  <span>
                    {studentLabel(signature, t('group.studentFallback'))}
                    <span className="text-muted-foreground ml-2">({signature.title})</span>
                  </span>
                  <Badge variant="outline">{t('group.pending')}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="group-email-message" className="text-sm font-medium">
              {t('group.message')}
            </label>
            <Textarea
              id="group-email-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t('group.hint')}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            {tCommon('actions.cancel')}
          </Button>
          <Button onClick={handleSend} disabled={isLoading || signatures.length === 0}>
            {isLoading ? (
              t('group.sending')
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {tCommon('actions.send')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
