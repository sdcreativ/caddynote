import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createCourseMaterial, type CourseMaterial } from '@/services/strkCourseMaterialService';
import { ApiError } from '@/lib/apiClient';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

export interface AddMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  onMaterialAdded: (material: CourseMaterial) => void;
}

export const AddMaterialDialog = ({ open, onClose, courseId, onMaterialAdded }: AddMaterialDialogProps) => {
  const { toast } = useToast();
  const { t } = useTranslation('teaching');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('pdf');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle('');
    setType('pdf');
    setContent('');
    setDescription('');
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: tCommon('status.error'), description: t('addMaterial.titleRequired'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const material = await createCourseMaterial(courseId, {
        title: title.trim(),
        type,
        content: content.trim() || undefined,
        description: description.trim() || undefined,
        file: file ?? undefined,
      });
      onMaterialAdded(material);
      toast({ title: t('addMaterial.addedTitle'), description: material.title });
      reset();
      onClose();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : t('addMaterial.saveError');
      toast({ title: tCommon('status.error'), description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addMaterial.title')}</DialogTitle>
          <DialogDescription>
            {t('addMaterial.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="material-title">{t('addMaterial.titleLabel')}</Label>
            <Input id="material-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="material-type">{t('addMaterial.type')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="material-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">{t('addMaterial.typePdf')}</SelectItem>
                <SelectItem value="video">{t('addMaterial.typeVideo')}</SelectItem>
                <SelectItem value="article">{t('addMaterial.typeArticle')}</SelectItem>
                <SelectItem value="other">{t('addMaterial.typeOther')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="material-content">{t('addMaterial.content')}</Label>
            <Input id="material-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('addMaterial.contentPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="material-description">{t('addMaterial.desc')}</Label>
            <Input id="material-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="material-file">{t('addMaterial.file')}</Label>
            <Input id="material-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>{tCommon('actions.cancel')}</Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('addMaterial.submitting') : tCommon('actions.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddMaterialDialog;
