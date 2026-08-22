import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { ApiError } from '@/lib/apiClient';
import { createStrkInstitution } from '@/services/strkInstitutionService';
import { StrkActivityService } from '@/services/strkActivityService';
import { StrkInstitutionType } from '@/types/strk';

interface CreateInstitutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstitutionCreated?: () => void;
}

export default function CreateInstitutionDialog({ 
  open, 
  onOpenChange, 
  onInstitutionCreated 
}: CreateInstitutionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '' as StrkInstitutionType | '',
    address: '',
    phone: '',
    email: ''
  });
  const { toast } = useToast();
  const { t } = useTranslation('institutions');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.type) {
      toast({
        title: tc('status.error'),
        description: t('createDialog.required'),
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const institution = await createStrkInstitution({
        name: formData.name,
        type: formData.type as StrkInstitutionType,
        address: formData.address || '',
        phone: formData.phone || '',
        email: formData.email || '',
        adminId: user?.id || ''
      });

      // Télémétrie best-effort : ne doit pas faire échouer une création réussie.
      if (user?.id) {
        try {
          await StrkActivityService.logInstitutionCreated(
            institution.id,
            institution.name,
            user.id
          );
        } catch (activityError) {
          console.warn('Journal activité institution_created ignoré:', activityError);
        }
      }

      toast({
        title: tc('status.success'),
        description: t('createDialog.successBody')
      });

      setFormData({
        name: '',
        type: '',
        address: '',
        phone: '',
        email: ''
      });

      onOpenChange(false);
      onInstitutionCreated?.();
    } catch (error) {
      console.error('Error creating institution:', error);
      const description =
        error instanceof ApiError
          ? error.message
          : t('createDialog.errorBody');
      toast({
        title: tc('status.error'),
        description,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('createDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('createDialog.name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder={t('createDialog.namePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">{t('createDialog.type')}</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger id="type">
                  <SelectValue placeholder={t('typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elementary_school">{t('types.elementary_school')}</SelectItem>
                  <SelectItem value="middle_school">{t('types.middle_school')}</SelectItem>
                  <SelectItem value="high_school">{t('types.high_school')}</SelectItem>
                  <SelectItem value="university">{t('types.university')}</SelectItem>
                  <SelectItem value="training_center">{t('manager.trainingCenter')}</SelectItem>
                  <SelectItem value="private_school">{t('types.private_school')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">{t('fields.address')}</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder={t('createDialog.addressPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">{t('fields.phone')}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder={t('createDialog.phonePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('fields.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder={t('createDialog.emailPlaceholder')}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('createDialog.submitting') : t('createDialog.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}