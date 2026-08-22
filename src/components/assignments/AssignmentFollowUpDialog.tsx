import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ApiError } from '@/lib/apiClient';
import {
  fetchAssignmentFollowUp,
  gradeSubmission,
  type AssignmentFollowUpRow,
  type AssignmentFollowUpStatus,
} from '@/services/strkAssignmentService';

type Filter = 'all' | 'missing' | 'late' | 'toGrade' | 'graded' | 'pending';

const STATUS_KEY: Record<AssignmentFollowUpStatus, string> = {
  not_submitted: 'followUp.statusNotSubmitted',
  draft: 'followUp.statusDraft',
  submitted: 'followUp.statusSubmitted',
  late: 'followUp.statusLate',
  missing: 'followUp.statusMissing',
  graded: 'followUp.statusGraded',
};

const studentName = (row: AssignmentFollowUpRow, fallback: string) =>
  [row.lastName, row.firstName].filter(Boolean).join(' ') || fallback;

const matchesFilter = (row: AssignmentFollowUpRow, filter: Filter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'missing') return row.followUpStatus === 'missing' || row.followUpStatus === 'not_submitted';
  if (filter === 'late') return row.late;
  if (filter === 'toGrade') return row.followUpStatus === 'submitted' || row.followUpStatus === 'late';
  if (filter === 'graded') return row.followUpStatus === 'graded';
  return row.followUpStatus === 'not_submitted' || row.followUpStatus === 'draft';
};

interface AssignmentFollowUpDialogProps {
  assignmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AssignmentFollowUpDialog = ({ assignmentId, open, onOpenChange }: AssignmentFollowUpDialogProps) => {
  const { t } = useTranslation('assignments');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<AssignmentFollowUpRow | null>(null);
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assignment-follow-up', assignmentId],
    queryFn: () => fetchAssignmentFollowUp(assignmentId!),
    enabled: open && !!assignmentId,
  });

  const rows = useMemo(() => (data?.students ?? []).filter((row) => matchesFilter(row, filter)), [data, filter]);

  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!selected?.submissionId) throw new Error(t('followUp.noCopyToGrade'));
      const value = Number(grade);
      const max = data?.assignment.maxGrade ?? 20;
      if (Number.isNaN(value) || value < 0 || value > max) {
        throw new Error(t('followUp.gradeRange', { max }));
      }
      const ok = await gradeSubmission(selected.submissionId, value, feedback || undefined);
      if (!ok) throw new Error(t('followUp.saveError'));
    },
    onSuccess: () => {
      toast({ title: t('followUp.savedTitle'), description: t('followUp.savedBody', { name: studentName(selected!, t('followUp.studentFallback')) }) });
      queryClient.invalidateQueries({ queryKey: ['assignment-follow-up', assignmentId] });
      setSelected(null);
      setGrade('');
      setFeedback('');
    },
    onError: (error) => {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError || error instanceof Error ? error.message : t('followUp.gradeImpossible'),
        variant: 'destructive',
      });
    },
  });

  const openGrade = (row: AssignmentFollowUpRow) => {
    setSelected(row);
    setGrade(row.grade != null ? String(row.grade) : '');
    setFeedback(row.feedback ?? '');
  };

  const fallbackName = t('followUp.studentFallback');
  const nameOf = (row: AssignmentFollowUpRow) => studentName(row, fallbackName);

  const statusBadge = (row: AssignmentFollowUpRow) => {
    if (row.followUpStatus === 'graded') {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{t(STATUS_KEY.graded)}</Badge>;
    }
    if (row.followUpStatus === 'late' || (row.late && row.followUpStatus === 'submitted')) {
      return <Badge variant="destructive">{t(STATUS_KEY.late)}</Badge>;
    }
    if (row.followUpStatus === 'submitted') {
      return <Badge variant="secondary">{t(STATUS_KEY.submitted)}</Badge>;
    }
    if (row.followUpStatus === 'draft') {
      return <Badge variant="outline">{t(STATUS_KEY.draft)}</Badge>;
    }
    return <Badge variant="destructive">{t(STATUS_KEY.missing)}</Badge>;
  };

  const summary = data?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.assignment.title ?? t('followUp.title')}</DialogTitle>
          <DialogDescription>
            {data?.course?.className ? `${data.course.className} · ` : ''}
            {data?.assignment.dueDate
              ? t('followUp.dueOn', { date: new Date(data.assignment.dueDate).toLocaleDateString('fr-FR') })
              : t('followUp.rosterHint')}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">{t('followUp.loading')}</p>}
        {isError && <p className="text-sm text-destructive">{t('followUp.loadError')}</p>}

        {summary && (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">{t('followUp.class')}</div>
              <div className="font-semibold">
                {t('followUp.submitted', { submitted: summary.submitted, roster: summary.roster })}
              </div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">{t('followUp.late')}</div>
              <div className="font-semibold">{summary.late}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">{t('followUp.notSubmitted')}</div>
              <div className="font-semibold">{summary.missing + summary.pending}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-muted-foreground">{t('followUp.toGrade')}</div>
              <div className="font-semibold">{summary.toGrade}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'followUp.filterAll'],
              ['missing', 'followUp.filterMissing'],
              ['late', 'followUp.filterLate'],
              ['toGrade', 'followUp.filterToGrade'],
              ['graded', 'followUp.filterGraded'],
            ] as const
          ).map(([value, labelKey]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? 'default' : 'outline'}
              onClick={() => setFilter(value)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>

        {data && data.summary.roster === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('followUp.noClass')}
          </p>
        )}

        {data && data.summary.roster > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('followUp.student')}</TableHead>
                <TableHead>{t('followUp.status')}</TableHead>
                <TableHead>{t('followUp.submittedAt')}</TableHead>
                <TableHead>{t('followUp.grade')}</TableHead>
                <TableHead className="text-right">{t('followUp.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell>
                    <div className="font-medium">{nameOf(row)}</div>
                    {row.studentNumber && (
                      <div className="text-xs text-muted-foreground">{row.studentNumber}</div>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(row)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.submittedAt ? new Date(row.submittedAt).toLocaleString('fr-FR') : '—'}
                  </TableCell>
                  <TableCell>{row.grade != null ? `${row.grade}/${data.assignment.maxGrade}` : '—'}</TableCell>
                  <TableCell className="text-right">
                    {row.submissionId ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => openGrade(row)}>
                        {row.followUpStatus === 'graded' ? tc('actions.edit') : t('followUp.correct')}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('followUp.noCopy')}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    {t('followUp.emptyFilter')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {selected && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">{t('followUp.grading', { name: nameOf(selected) })}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="follow-up-grade">{t('followUp.gradeLabel', { max: data?.assignment.maxGrade ?? 20 })}</Label>
                <Input
                  id="follow-up-grade"
                  type="number"
                  min={0}
                  max={data?.assignment.maxGrade ?? 20}
                  step="0.5"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="follow-up-feedback">{t('followUp.comment')}</Label>
                <Textarea
                  id="follow-up-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => gradeMutation.mutate()} disabled={gradeMutation.isPending}>
                {tc('actions.save')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                {tc('actions.cancel')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
