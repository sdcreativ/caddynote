import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Institution, StrkInstitutionType } from '@/types/strk';

type EditInstitutionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institution: Institution | null;
  onSave: (id: string, data: Partial<Institution>) => Promise<unknown>;
};

const TYPES: StrkInstitutionType[] = [
  'school',
  'middle_school',
  'high_school',
  'university',
  'training_center',
  'elementary_school',
  'private_school',
];

export default function EditInstitutionDialog({
  open,
  onOpenChange,
  institution,
  onSave,
}: EditInstitutionDialogProps) {
  const { t } = useTranslation('institutions');
  const { t: tc } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: '' as StrkInstitutionType | '',
    address: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (institution && open) {
      setFormData({
        name: institution.name || '',
        type: (institution.type as StrkInstitutionType) || '',
        address: institution.address || '',
        phone: institution.phone || '',
        email: institution.email || '',
      });
    }
  }, [institution, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institution || !formData.name || !formData.type) return;
    setLoading(true);
    try {
      await onSave(institution.id, {
        name: formData.name,
        type: formData.type as StrkInstitutionType,
        address: formData.address,
        phone: formData.phone,
        email: formData.email,
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Modifier l’établissement</DialogTitle>
          <DialogDescription>Met à jour les informations du tenant.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-inst-name">{t('createDialog.name')}</Label>
            <Input
              id="edit-inst-name"
              value={formData.name}
              onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t('createDialog.type')}</Label>
            <Select
              value={formData.type}
              onValueChange={(v) => setFormData((f) => ({ ...f, type: v as StrkInstitutionType }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`types.${type}`, { defaultValue: type })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-inst-email">E-mail</Label>
            <Input
              id="edit-inst-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-inst-phone">Téléphone</Label>
            <Input
              id="edit-inst-phone"
              value={formData.phone}
              onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-inst-address">Adresse</Label>
            <Input
              id="edit-inst-address"
              value={formData.address}
              onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={loading || !formData.name || !formData.type}>
              {loading ? 'Enregistrement…' : tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
