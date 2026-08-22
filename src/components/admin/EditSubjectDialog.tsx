import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStrkSubjects } from '@/hooks/useStrkSubjects';
import { StrkSubject } from '@/services/strkSubjectService';
import { useTranslation } from 'react-i18next';

interface EditSubjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: StrkSubject | null;
  onSubjectUpdated?: () => void;
}

const EditSubjectDialog = ({ open, onOpenChange, subject, onSubjectUpdated }: EditSubjectDialogProps) => {
  const { t } = useTranslation('subjects');
  const { t: tc } = useTranslation('common');
  const [formData, setFormData] = useState({ name: '', code: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateSubject } = useStrkSubjects();

  useEffect(() => {
    if (subject && open) {
      setFormData({
        name: subject.name || '',
        code: subject.code || '',
        description: subject.description || '',
      });
    }
  }, [subject, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      const updated = await updateSubject(subject.id, {
        name: formData.name.trim(),
        code: formData.code.trim() || undefined,
        description: formData.description.trim() || undefined,
      });
      if (updated) {
        onOpenChange(false);
        onSubjectUpdated?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
          <DialogDescription>{t('editSubtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-subject-name">{t('fieldName')}</Label>
              <Input
                id="edit-subject-name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-code">{t('fieldCode')}</Label>
              <Input
                id="edit-subject-code"
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-description">{t('fieldDescription')}</Label>
              <Textarea
                id="edit-subject-description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={!formData.name.trim() || isSubmitting}>
              {isSubmitting ? t('saving') : tc('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditSubjectDialog;
