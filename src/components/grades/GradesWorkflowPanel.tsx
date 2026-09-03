import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, Download, FileDown, Send, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CourseWithDetails } from '@/services/strkCourseService';
import type { StrkAcademicPeriod } from '@/services/strkAcademicPeriodService';

type ImportReport = {
  created: number;
  skipped: number;
  errors: number;
  results: Array<{ row: number; key: string; status: string; error?: string }>;
};

type GradesWorkflowPanelProps = {
  courses: CourseWithDetails[];
  periods: StrkAcademicPeriod[];
  canPublish: boolean;
  canCompute: boolean;
  canShowCreateActions: boolean;
  workflowBusy: boolean;
  onOpenExport: () => void;
  publishCourseId: string;
  onPublishCourseIdChange: (value: string) => void;
  publishPeriodId: string;
  onPublishPeriodIdChange: (value: string) => void;
  onPublish: () => void;
  computeClassId: string;
  onComputeClassIdChange: (value: string) => void;
  computePeriodId: string;
  onComputePeriodIdChange: (value: string) => void;
  onCompute: () => void;
  isImportOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  importCourseId: string;
  onImportCourseIdChange: (value: string) => void;
  importPeriodId: string;
  onImportPeriodIdChange: (value: string) => void;
  importTitle: string;
  onImportTitleChange: (value: string) => void;
  importCsv: string;
  onImportCsvChange: (value: string) => void;
  importPreviewRows: string[][];
  importReport: ImportReport | null;
  importing: boolean;
  onDownloadTemplate: () => void;
  onImportFile: (file: File) => void;
  onImportCsv: () => void;
};

/** Onglet Publication & calcul — export, publish, moyennes, import CSV. */
export function GradesWorkflowPanel({
  courses,
  periods,
  canPublish,
  canCompute,
  canShowCreateActions,
  workflowBusy,
  onOpenExport,
  publishCourseId,
  onPublishCourseIdChange,
  publishPeriodId,
  onPublishPeriodIdChange,
  onPublish,
  computeClassId,
  onComputeClassIdChange,
  computePeriodId,
  onComputePeriodIdChange,
  onCompute,
  isImportOpen,
  onImportOpenChange,
  importCourseId,
  onImportCourseIdChange,
  importPeriodId,
  onImportPeriodIdChange,
  importTitle,
  onImportTitleChange,
  importCsv,
  onImportCsvChange,
  importPreviewRows,
  importReport,
  importing,
  onDownloadTemplate,
  onImportFile,
  onImportCsv,
}: GradesWorkflowPanelProps) {
  const { t } = useTranslation('grades');
  const { t: tc } = useTranslation('common');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('panels.workflow')}</CardTitle>
        <CardDescription>{t('panels.workflowHint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenExport}>
            <FileDown className="mr-2 h-4 w-4" />
            {tc('actions.export')}
          </Button>

          {canPublish && canShowCreateActions ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Send className="mr-2 h-4 w-4" />
                  {t('publish')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('publishDialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t('course')}</Label>
                    <Select value={publishCourseId} onValueChange={onPublishCourseIdChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('chooseCourse')} />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('period')}</Label>
                    <Select value={publishPeriodId} onValueChange={onPublishPeriodIdChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('period')} />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={onPublish} disabled={workflowBusy} className="w-full">
                    {t('publishDialog.action')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {canCompute ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Calculator className="mr-2 h-4 w-4" />
                  {t('computeAverages')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('computeDialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>{t('computeDialog.classId')}</Label>
                    <Input
                      value={computeClassId}
                      onChange={(e) => onComputeClassIdChange(e.target.value)}
                      placeholder={t('computeDialog.classUuidPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">{t('computeDialog.classHint')}</p>
                    <Select
                      onValueChange={(courseId) => {
                        const c = courses.find((x) => x.id === courseId);
                        if (c?.class_id) onComputeClassIdChange(c.class_id);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('computeDialog.fillFromCourse')} />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('period')}</Label>
                    <Select value={computePeriodId} onValueChange={onComputePeriodIdChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('period')} />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={onCompute} disabled={workflowBusy} className="w-full">
                    {t('computeDialog.action')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          {canShowCreateActions ? (
            <Dialog open={isImportOpen} onOpenChange={onImportOpenChange}>
              <DialogTrigger asChild>
                <Button variant="outline">{t('importCsv')}</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                  <DialogTitle>{t('import.title')}</DialogTitle>
                  <DialogDescription>{t('import.description')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
                      <Download className="mr-2 h-4 w-4" />
                      {t('import.template')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        <Upload className="mr-2 h-4 w-4" />
                        {t('import.chooseFile')}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onImportFile(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t('course')}</Label>
                      <Select value={importCourseId} onValueChange={onImportCourseIdChange}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('course')} />
                        </SelectTrigger>
                        <SelectContent>
                          {courses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>{t('period')}</Label>
                      <Select value={importPeriodId} onValueChange={onImportPeriodIdChange}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('period')} />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{t('import.evalTitle')}</Label>
                    <Input value={importTitle} onChange={(e) => onImportTitleChange(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('import.csvPaste')}</Label>
                    <Textarea
                      rows={6}
                      value={importCsv}
                      onChange={(e) => onImportCsvChange(e.target.value)}
                      placeholder="studentNumber,gradeValue"
                    />
                  </div>
                  {importPreviewRows.length > 0 ? (
                    <div className="max-h-40 overflow-auto rounded border text-xs">
                      <table className="w-full">
                        <tbody>
                          {importPreviewRows.map((row, i) => (
                            <tr key={i} className={i === 0 ? 'bg-muted font-medium' : ''}>
                              {row.map((cell, j) => (
                                <td key={j} className="border-b px-2 py-1">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {importReport ? (
                    <div className="rounded border bg-muted/40 p-3 text-sm">
                      <p>
                        {t('import.report', {
                          created: importReport.created,
                          skipped: importReport.skipped,
                          errors: importReport.errors,
                        })}
                      </p>
                      {importReport.errors > 0 ? (
                        <ul className="mt-2 max-h-24 overflow-auto text-xs text-destructive">
                          {importReport.results
                            .filter((r) => r.status === 'error')
                            .slice(0, 8)
                            .map((r) => (
                              <li key={`${r.row}-${r.key}`}>
                                {t('import.rowError', {
                                  row: r.row,
                                  key: r.key,
                                  error: r.error || t('import.errorFallback'),
                                })}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <Button onClick={onImportCsv} disabled={importing}>
                    {importing ? t('import.importing') : tc('actions.import')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
