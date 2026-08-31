import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  assignTeacherToClass,
  fetchClassesByInstitution,
  unassignTeacherFromClass,
  type ClassWithDetails,
} from '@/services/strkClassService';
import type { User as StrkUser } from '@/types/strk';

type AssignTeacherClassDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: StrkUser | null;
  institutionId: string | null | undefined;
  onChanged?: () => void;
};

/**
 * Attribue une classe à un enseignant en tant que professeur principal
 * (`StrkClass.teacherId` → profil).
 */
export function AssignTeacherClassDialog({
  open,
  onOpenChange,
  teacher,
  institutionId,
  onChanged,
}: AssignTeacherClassDialogProps) {
  const { t } = useTranslation('teachers');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('__none__');

  const assigned = teacher
    ? classes.filter((c) => c.teacher_id === teacher.id && c.is_active !== false)
    : [];
  const available = teacher
    ? classes.filter((c) => c.teacher_id !== teacher.id && c.is_active !== false)
    : [];

  useEffect(() => {
    if (!open || !institutionId) return;
    let cancelled = false;
    setLoading(true);
    setSelectedClassId('__none__');
    void fetchClassesByInstitution(institutionId)
      .then((data) => {
        if (!cancelled) setClasses(data);
      })
      .catch((err) => {
        if (cancelled) return;
        toast({
          title: tc('status.error'),
          description: err instanceof ApiError ? err.message : t('assign.loadError'),
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionnel : ne pas dépendre de t/toast (identité instable → boucle de chargement).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, institutionId]);

  const handleAssign = async () => {
    if (!teacher || selectedClassId === '__none__') return;
    setSaving(true);
    try {
      const ok = await assignTeacherToClass(selectedClassId, teacher.id);
      if (!ok) throw new Error(t('assign.error'));
      toast({
        title: t('assign.successTitle'),
        description: t('assign.successBody', { name: teacher.name || teacher.email }),
      });
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: tc('status.error'),
        description: err instanceof ApiError || err instanceof Error ? err.message : t('assign.error'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (classId: string) => {
    if (!teacher) return;
    setSaving(true);
    try {
      const ok = await unassignTeacherFromClass(classId);
      if (!ok) throw new Error(t('assign.unassignError'));
      setClasses((prev) =>
        prev.map((c) => (c.id === classId ? { ...c, teacher_id: undefined, teacher_name: undefined } : c))
      );
      toast({
        title: t('assign.unassignTitle'),
        description: t('assign.unassignBody'),
      });
      onChanged?.();
    } catch (err) {
      toast({
        title: tc('status.error'),
        description:
          err instanceof ApiError || err instanceof Error ? err.message : t('assign.unassignError'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('assign.title')}</DialogTitle>
          <DialogDescription>
            {t('assign.description', { name: teacher?.name || teacher?.email || '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('assign.currentLabel')}</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('assign.loading')}</p>
            ) : assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('assign.none')}</p>
            ) : (
              <ul className="space-y-2">
                {assigned.map((klass) => (
                  <li
                    key={klass.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{klass.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => void handleUnassign(klass.id)}
                    >
                      {t('assign.unassign')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-class-select">{t('assign.selectLabel')}</Label>
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={loading || available.length === 0}
            >
              <SelectTrigger id="assign-class-select">
                <SelectValue placeholder={t('assign.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('assign.selectNone')}</SelectItem>
                {available.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.teacher_name
                      ? `${klass.name} — ${t('assign.currentlyHeldBy', { name: klass.teacher_name })}`
                      : klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {available.length === 0 && !loading ? (
              <p className="text-xs text-muted-foreground">{t('assign.noAvailable')}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('assign.hint')}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={saving || selectedClassId === '__none__' || loading}
            onClick={() => void handleAssign()}
          >
            {saving ? t('assign.saving') : t('assign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Affiche les classes où l’enseignant est titulaire. */
export function TeacherHomeroomBadges({
  teacherId,
  classes,
}: {
  teacherId: string;
  classes: ClassWithDetails[];
}) {
  const { t } = useTranslation('teachers');
  const assigned = classes.filter((c) => c.teacher_id === teacherId && c.is_active !== false);
  if (assigned.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('assign.noneShort')}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {assigned.map((klass) => (
        <Badge key={klass.id} variant="secondary" className="font-normal">
          {klass.name}
        </Badge>
      ))}
    </div>
  );
}
