import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError } from '@/lib/apiClient';

type ForceChangePasswordDialogProps = {
  open: boolean;
  onCompleted: () => void;
};

/** Première connexion : mot de passe provisoire → nouveau mot de passe (non dismissible). */
export function ForceChangePasswordDialog({ open, onCompleted }: ForceChangePasswordDialogProps) {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: tc('status.error'),
        description: t('forcePassword.fieldsRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: tc('status.error'),
        description: t('forcePassword.tooShort'),
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: tc('status.error'),
        description: t('forcePassword.mismatch'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      toast({
        title: tc('status.success'),
        description: t('forcePassword.success'),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onCompleted();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('forcePassword.error'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#1D70D8]" aria-hidden />
            {t('forcePassword.title')}
          </DialogTitle>
          <DialogDescription>{t('forcePassword.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="force-current">{t('forcePassword.current')}</Label>
            <Input
              id="force-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="force-new">{t('forcePassword.new')}</Label>
            <Input
              id="force-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="force-confirm">{t('forcePassword.confirm')}</Label>
            <Input
              id="force-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('forcePassword.saving')}
              </>
            ) : (
              t('forcePassword.submit')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
