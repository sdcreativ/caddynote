import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Check, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import {
  createTeacherAvailability,
  listTeacherAvailabilities,
  updateAvailabilityStatus,
  type TeacherAvailability,
} from '@/services/strkTeacherAvailabilityService';
import { ApiError } from '@/lib/apiClient';

export default function TeacherAvailabilityPage() {
  const { t } = useTranslation('availability');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<TeacherAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const canModerate = user?.role === 'school_admin' || user?.role === 'admin';
  const isTeacher = user?.role === 'teacher' || user?.role === 'head_teacher';

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await listTeacherAvailabilities(
        canModerate && user.institutionId
          ? { institutionId: user.institutionId }
          : { teacherId: user.id }
      );
      setItems(data);
    } catch (e) {
      toast({
        title: t('toast.loadImpossible'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, canModerate, toast, t, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.institutionId) return;
    try {
      await createTeacherAvailability({
        teacherId: user.id,
        institutionId: user.institutionId,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        reason: reason.trim() || undefined,
      });
      toast({ title: t('toast.created') });
      setReason('');
      await load();
    } catch (err) {
      toast({
        title: t('toast.failed'),
        description: err instanceof ApiError ? err.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const onStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateAvailabilityStatus(id, status);
      toast({ title: status === 'approved' ? t('toast.approved') : t('toast.rejected') });
      await load();
    } catch (err) {
      toast({
        title: t('toast.failed'),
        description: err instanceof ApiError ? err.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-slate-500">{t('subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {isTeacher && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarOff className="h-5 w-5 text-[#1D70D8]" />
              {t('declareTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('start')}</Label>
                <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>{t('end')}</Label>
                <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('reason')}</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </div>
              <div>
                <Button type="submit" className="bg-[#1D70D8] hover:bg-[#1a63c2]">
                  {tc('actions.send')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('listTitle')}</CardTitle>
          <CardDescription>
            {canModerate ? t('listAll') : t('listMine')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty')}</p>
          ) : (
            <ul className="divide-y">
              {items.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(a.startDate).toLocaleString('fr-FR')} → {new Date(a.endDate).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-xs text-slate-500">{a.reason || t('noReason')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.status === 'approved' ? 'default' : a.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {a.status}
                    </Badge>
                    {canModerate && a.status === 'requested' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void onStatus(a.id, 'approved')}>
                          <Check className="mr-1 h-3.5 w-3.5" /> {t('approve')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onStatus(a.id, 'rejected')}>
                          <X className="mr-1 h-3.5 w-3.5" /> {t('reject')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
