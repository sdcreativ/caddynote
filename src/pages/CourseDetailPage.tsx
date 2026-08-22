import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { apiClient } from '@/lib/apiClient';
import AddMaterialDialog from '@/components/teaching/AddMaterialDialog';
import {
  deleteCourseMaterial,
  downloadCourseMaterial,
  fetchCourseMaterials,
  type CourseMaterial,
} from '@/services/strkCourseMaterialService';
import { createLesson, deleteLesson, fetchLessons, type LessonEntry } from '@/services/strkLessonService';
import { ArrowLeft, Download, Plus, Trash2, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tCommon } from '@/i18n/config';

const CourseDetailPage = () => {
  const { t } = useTranslation('teaching');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const [courseName, setCourseName] = useState(t('detail.fallbackName'));
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [lessons, setLessons] = useState<LessonEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().slice(0, 10));
  const [lessonTitle, setLessonTitle] = useState('');
  const [contentCovered, setContentCovered] = useState('');
  const [homeworkGiven, setHomeworkGiven] = useState('');
  const canEdit = user?.role === 'teacher' || user?.role === 'head_teacher' || user?.role === 'school_admin' || user?.role === 'admin';

  const load = async () => {
    if (!id) return;
    try {
      const { course } = await apiClient.get<{ course: { name: string } }>(`/courses/${id}`);
      setCourseName(course.name);
      setMaterials(await fetchCourseMaterials(id));
      setLessons(await fetchLessons(id));
    } catch {
      toast({ title: tCommon('status.error'), description: t('detail.notFound'), variant: 'destructive' });
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleDownload = async (material: CourseMaterial) => {
    if (!material.fileKey) {
      if (material.content) {
        window.open(material.content, '_blank', 'noopener,noreferrer');
        return;
      }
      toast({ title: t('detail.noFileTitle'), description: t('detail.noFileBody') });
      return;
    }
    try {
      const url = await downloadCourseMaterial(material.fileKey);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast({ title: tCommon('status.error'), description: t('detail.downloadError'), variant: 'destructive' });
    }
  };

  const handleDelete = async (material: CourseMaterial) => {
    if (!id) return;
    const ok = await confirm({
      description: t('detail.deleteConfirm', { title: material.title }),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteCourseMaterial(id, material.id);
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch {
      toast({ title: tCommon('status.error'), description: t('detail.deleteError'), variant: 'destructive' });
    }
  };

  const handleAddLesson = async () => {
    if (!id || !contentCovered.trim()) {
      toast({ title: t('detail.contentRequiredTitle'), description: t('detail.contentRequiredBody'), variant: 'destructive' });
      return;
    }
    try {
      const lesson = await createLesson(id, {
        lessonDate,
        title: lessonTitle || undefined,
        contentCovered: contentCovered.trim(),
        homeworkGiven: homeworkGiven.trim() || undefined,
      });
      setLessons((prev) => [lesson, ...prev]);
      setLessonTitle('');
      setContentCovered('');
      setHomeworkGiven('');
      toast({ title: t('detail.lessonSaved') });
    } catch {
      toast({ title: tCommon('status.error'), description: t('detail.lessonSaveError'), variant: 'destructive' });
    }
  };

  const handleDeleteLesson = async (lesson: LessonEntry) => {
    if (!id) return;
    const ok = await confirm({
      description: t('detail.deleteLessonConfirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteLesson(id, lesson.id);
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
    } catch {
      toast({ title: tCommon('status.error'), description: t('detail.deleteError'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/teaching')} aria-label={t('detail.backToCourses')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{courseName}</h1>
            <p className="text-muted-foreground">{t('detail.subtitle')}</p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> {t('detail.addResource')}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5" /> {t('detail.lessonsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <div className="grid gap-3 rounded-md border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('detail.date')}</Label>
                  <Input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t('detail.titleOptional')}</Label>
                  <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder={t('detail.titlePlaceholder')} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t('detail.contentCovered')}</Label>
                <Textarea value={contentCovered} onChange={(e) => setContentCovered(e.target.value)} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>{t('detail.homework')}</Label>
                <Textarea value={homeworkGiven} onChange={(e) => setHomeworkGiven(e.target.value)} rows={2} />
              </div>
              <Button onClick={handleAddLesson} className="w-fit">{t('detail.saveLesson')}</Button>
            </div>
          )}
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('detail.noLessons')}</p>
          ) : (
            <ul className="space-y-3">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {new Date(lesson.lessonDate).toLocaleDateString('fr-FR')}
                        {lesson.title ? ` — ${lesson.title}` : ''}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{lesson.contentCovered}</p>
                      {lesson.homeworkGiven && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium">{t('detail.todo')}</span> {lesson.homeworkGiven}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteLesson(lesson)} aria-label={t('detail.deleteLessonAria')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-xl font-semibold">{t('detail.resourcesTitle')}</h2>
        {materials.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {t('detail.noResources')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {materials.map((material) => (
              <Card key={material.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-lg">{material.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleDownload(material)}>
                      <Download className="mr-1 h-4 w-4" /> {t('detail.open')}
                    </Button>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => handleDelete(material)} aria-label={t('detail.deleteAria')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                {(material.description || material.content) && (
                  <CardContent>
                    {material.description && <p className="text-sm text-muted-foreground">{material.description}</p>}
                    {material.content && <p className="text-sm break-all">{material.content}</p>}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {id && (
        <AddMaterialDialog
          open={open}
          onClose={() => setOpen(false)}
          courseId={id}
          onMaterialAdded={(material) => setMaterials((prev) => [material, ...prev])}
        />
      )}
    </div>
  );
};

export default CourseDetailPage;
