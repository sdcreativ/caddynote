import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserPlus, ExternalLink } from 'lucide-react';
import { SELECT_NONE, classIdFromSelect } from '@/lib/selectNone';
import { tCommon } from '@/i18n/config';

interface CreateStudentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateStudent: (studentData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phoneNumber?: string;
    classId?: string;
  }) => Promise<void>;
  classes: { id: string; name: string }[];
  isLoading?: boolean;
}

/**
 * Création manuelle d’exception (import / cas urgents).
 * Parcours nominal : préinscription publique `/admissions` puis validation
 * direction sur `/admissions/admin`.
 */
export const CreateStudentDialog: React.FC<CreateStudentDialogProps> = ({
  isOpen,
  onClose,
  onCreateStudent,
  classes,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
    classId: SELECT_NONE,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation('students');

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phoneNumber: '',
      classId: SELECT_NONE,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      toast({
        title: tCommon('status.error'),
        description: t('create.required'),
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: tCommon('status.error'),
        description: t('create.invalidEmail'),
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: tCommon('status.error'),
        description: t('create.passwordMin'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateStudent({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phoneNumber || undefined,
        classId: classIdFromSelect(formData.classId),
      });
      toast({
        title: t('create.successTitle'),
        description: t('create.successBody'),
      });
      handleOpenChange(false);
    } catch {
      toast({
        title: tCommon('status.error'),
        description: t('create.errorBody'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('create.title')}
          </DialogTitle>
          <DialogDescription>
            {t('create.descriptionBefore')}{' '}
            <Link to="/admissions" className="text-[#1D70D8] underline" target="_blank" rel="noreferrer">
              {t('create.preenroll')}
            </Link>{' '}
            {t('create.descriptionAfter')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p className="font-medium text-slate-800">{t('create.recommended')}</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>
              {t('create.stepFamily')} <code className="text-xs">/admissions</code>
            </li>
            <li>
              {t('create.stepAdmin')}{' '}
              <Link to="/admissions/admin" className="text-[#1D70D8] underline">
                {t('create.admissions')}
              </Link>
            </li>
          </ol>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to="/admissions" target="_blank" rel="noreferrer">
              {t('create.openPreenroll')}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t('create.firstName')}</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder={t('create.firstNamePlaceholder')}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">{t('create.lastName')}</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder={t('create.lastNamePlaceholder')}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('create.email')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              placeholder={t('create.emailPlaceholder')}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('create.password')}</Label>
              <Button type="button" variant="outline" size="sm" onClick={generatePassword} disabled={isSubmitting}>
                {t('create.generate')}
              </Button>
            </div>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              placeholder={t('create.passwordPlaceholder')}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneNumber">{t('create.phone')}</Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))}
              placeholder={t('create.phonePlaceholder')}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="class">{t('create.class')}</Label>
            <Select
              value={formData.classId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, classId: value }))}
              disabled={isSubmitting || isLoading}
            >
              <SelectTrigger id="class">
                <SelectValue placeholder={t('create.classPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>{t('create.noClass')}</SelectItem>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {tCommon('actions.cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
