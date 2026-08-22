import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import {
  createIncident,
  createObservation,
  getStudentTimeline,
  type TimelineEntry,
} from '@/services/strkFollowUpService';
import { ApiError } from '@/lib/apiClient';

/**
 * SUI-001/002 — suivi pédagogique + discipline (timeline unifiée).
 */
export default function FollowUpPage() {
  const { t } = useTranslation('followup');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'observation' | 'incident'>('observation');
  const [category, setCategory] = useState<'positive' | 'negative' | 'neutral'>('neutral');

  const canWriteObservation = ['admin', 'school_admin', 'teacher', 'head_teacher'].includes(user?.role || '');
  const canWriteIncident = ['admin', 'school_admin', 'teacher', 'head_teacher', 'supervisor'].includes(
    user?.role || ''
  );
  const canWrite = canWriteObservation || canWriteIncident;

  useEffect(() => {
    if (!canWriteObservation && canWriteIncident && mode === 'observation') {
      setMode('incident');
    }
  }, [canWriteObservation, canWriteIncident, mode]);

  const loadTimeline = useCallback(async () => {
    if (!studentId.trim()) return;
    setLoading(true);
    try {
      const data = await getStudentTimeline(studentId.trim());
      setTimeline(data);
    } catch (e) {
      toast({
        title: t('loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [studentId, toast, t, tc]);

  useEffect(() => {
    if (studentId.trim().length > 30) void loadTimeline();
  }, [studentId, loadTimeline]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !studentId.trim()) return;
    try {
      if (mode === 'observation') {
        await createObservation({
          studentId: studentId.trim(),
          title: title.trim(),
          description: description.trim(),
          category,
          visibleToFamily: category === 'positive',
        });
      } else {
        await createIncident({
          studentId: studentId.trim(),
          title: title.trim(),
          description: description.trim(),
        });
      }
      toast({ title: tc('status.saved') });
      setTitle('');
      setDescription('');
      await loadTimeline();
    } catch (err) {
      toast({
        title: t('failure'),
        description: err instanceof ApiError ? err.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#0B1F3A]">
          {t('title')}
        </h1>
        <p className="mt-1 text-slate-500">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('studentTitle')}</CardTitle>
          <CardDescription>{t('studentDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder={t('studentPlaceholder')}
            className="flex-1"
          />
          <Button type="button" onClick={() => void loadTimeline()} disabled={loading || !studentId.trim()}>
            {loading ? t('loading') : t('showDossier')}
          </Button>
        </CardContent>
      </Card>

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-[#1D70D8]" />
              {t('newEntry')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('type')}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as 'observation' | 'incident')}
                  disabled={!canWriteObservation}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canWriteObservation && <SelectItem value="observation">{t('observation')}</SelectItem>}
                    {canWriteIncident && <SelectItem value="incident">{t('incident')}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              {mode === 'observation' && (
                <div className="space-y-2">
                  <Label>{t('category')}</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as 'positive' | 'negative' | 'neutral')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">{t('positive')}</SelectItem>
                      <SelectItem value="neutral">{t('neutral')}</SelectItem>
                      <SelectItem value="negative">{t('negative')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2 md:col-span-2">
                <Label>{t('titleLabel')}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('description')}</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <div>
                <Button type="submit" className="bg-[#1D70D8] hover:bg-[#1a63c2]">
                  <HeartHandshake className="mr-2 h-4 w-4" />
                  {tc('actions.save')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!studentId.trim() ? (
            <p className="text-sm text-slate-500">{t('selectStudent')}</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty')}</p>
          ) : (
            <ul className="space-y-3">
              {timeline.map((row) => (
                <li key={`${row.kind}-${row.entry.id}`} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{row.entry.title}</p>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {row.kind === 'observation' ? t('kindObservation') : t('kindIncident')}
                      {row.entry.status ? ` · ${row.entry.status}` : ''}
                    </span>
                  </div>
                  {row.entry.description && (
                    <p className="mt-1 text-sm text-slate-600">{row.entry.description}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {row.date ? new Date(row.date).toLocaleString('fr-FR') : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
