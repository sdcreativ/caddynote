import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, Calendar, Users, Award, Download, Clock } from "lucide-react";
import { useStrkAuth } from "@/hooks/useStrkAuth";
import { useToast } from "@/hooks/use-toast";
import {
  downloadReportExport,
  downloadScheduledReport,
  listScheduledExports,
  scheduleReportExport,
  type ScheduledExportJob,
} from "@/services/strkReportService";
import { ReportFilters, type ReportFiltersValue } from "@/components/reports/ReportFilters";

type ExportFormat = 'csv' | 'xlsx' | 'pdf';
const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'pdf'];

interface ExportTemplate {
  id: 'absences' | 'grades' | 'attendance' | 'students';
  dataType: string;
  icon: any;
  fields: string[];
}

const exportTemplates: ExportTemplate[] = [
  {
    id: 'absences',
    dataType: 'absences',
    icon: Calendar,
    fields: ['date', 'student_name', 'class', 'duration', 'justified', 'reason']
  },
  {
    id: 'grades',
    dataType: 'grades',
    icon: Award,
    fields: ['student_name', 'subject', 'grade', 'max_grade', 'date', 'type', 'comments']
  },
  {
    id: 'attendance',
    dataType: 'attendance',
    icon: Users,
    fields: ['student_name', 'class', 'total_hours', 'present_hours', 'absence_rate']
  },
  {
    id: 'students',
    dataType: 'students',
    icon: Users,
    fields: ['name', 'email', 'class', 'enrollment_date', 'phone', 'address']
  }
];

const ExportsPage = () => {
  const { t } = useTranslation('exports');
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<ExportTemplate | null>(null);
  // RPT-002 : les 3 formats du cahier des charges sont désormais réellement
  // générés côté serveur (voir server/src/routes/reports.routes.ts).
  const [format, setFormat] = useState<ExportFormat>('csv');
  // RPT-001 : filtres multi-critères, standardisés via `ReportFilters`.
  const [filters, setFilters] = useState<ReportFiltersValue>({});
  const [isExporting, setIsExporting] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledExportJob[]>([]);

  const refreshSchedule = async () => {
    if (!user?.institutionId) return;
    try {
      const jobs = await listScheduledExports(user.institutionId);
      setScheduledJobs(jobs);
    } catch {
      /* ignore list errors on load */
    }
  };

  useEffect(() => {
    void refreshSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.institutionId]);

  if (user && !user.institutionId) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExport = async () => {
    if (!selectedTemplate || !user?.institutionId) return;

    setIsExporting(true);
    try {
      await downloadReportExport(
        selectedTemplate.id,
        user.institutionId,
        { start: filters.startDate, end: filters.endDate },
        { classId: filters.classId, subjectId: filters.subjectId },
        format
      );
      toast({
        title: t('toast.successTitle'),
        description: t('toast.successBody'),
      });
    } catch (error) {
      toast({
        title: t('toast.errorTitle'),
        description: error instanceof Error ? error.message : t('toast.errorBody'),
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSchedule = async () => {
    if (!selectedTemplate || !user?.institutionId || !scheduleAt) return;
    setIsScheduling(true);
    try {
      const scheduledAt = new Date(scheduleAt).toISOString();
      await scheduleReportExport({
        type: selectedTemplate.id,
        institutionId: user.institutionId,
        scheduledAt,
        classId: filters.classId,
        subjectId: filters.subjectId,
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
      toast({ title: t('schedule.successTitle'), description: t('schedule.successBody') });
      setScheduleAt('');
      await refreshSchedule();
    } catch (error) {
      toast({
        title: t('schedule.errorTitle'),
        description: error instanceof Error ? error.message : t('schedule.errorBody'),
        variant: 'destructive',
      });
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('reportType')}</CardTitle>
              <CardDescription>
                {t('reportTypeDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {exportTemplates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <Card
                      key={template.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedTemplate?.id === template.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5" />
                          <CardTitle className="text-base">{t(`templates.${template.id}.name`)}</CardTitle>
                        </div>
                        <CardDescription className="text-sm">
                          {t(`templates.${template.id}.description`)}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>{t('configTitle')}</CardTitle>
                <CardDescription>
                  {t('configDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-xs">
                  <Label>{t('format')}</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPORT_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>{t(`formats.${f}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <ReportFilters
                  value={filters}
                  onChange={setFilters}
                  scopeInstitutionId={user?.institutionId}
                  show={{
                    dateRange: selectedTemplate.id !== 'students',
                    classId: true,
                    subjectId: selectedTemplate.id === 'grades' || selectedTemplate.id === 'absences',
                  }}
                />

                <div className="space-y-3">
                  <Label>{t('includedColumns')}</Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedTemplate.fields.map((field) => (
                      <div key={field} className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Table className="h-3.5 w-3.5" />
                        {field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedTemplate.id === 'grades' && (
                  <p className="text-sm text-muted-foreground">
                    {t('bulletinHint')}{' '}
                    <Link to="/documents" className="font-medium text-primary underline-offset-2 hover:underline">
                      {t('bulletinLink')}
                    </Link>
                  </p>
                )}

                <div className="pt-4 space-y-4">
                  <Button
                    onClick={handleExport}
                    className="w-full"
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        {t('exporting')}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        {t('download', { format: t(`formats.${format}`) })}
                      </>
                    )}
                  </Button>

                  <div className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{t('schedule.title')}</p>
                      <p className="text-xs text-muted-foreground">{t('schedule.hint')}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="space-y-2 flex-1">
                        <Label htmlFor="schedule-at">{t('schedule.when')}</Label>
                        <Input
                          id="schedule-at"
                          type="datetime-local"
                          value={scheduleAt}
                          onChange={(e) => setScheduleAt(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isScheduling || !scheduleAt}
                        onClick={() => void handleSchedule()}
                      >
                        {isScheduling ? t('schedule.scheduling') : t('schedule.submit')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('schedule.listTitle')}</CardTitle>
              <CardDescription>{t('schedule.listDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {scheduledJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('schedule.empty')}</p>
              ) : (
                scheduledJobs.map((job) => (
                  <div key={job.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="font-medium">{t(`templates.${job.type}.name`)}</div>
                    <div className="text-muted-foreground">
                      {new Date(job.scheduledAt).toLocaleString()} · {job.status}
                    </div>
                    {job.reportId && job.status === 'done' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1"
                        onClick={() =>
                          void downloadScheduledReport(job.reportId!).catch((error) =>
                            toast({
                              title: t('toast.errorTitle'),
                              description: error instanceof Error ? error.message : t('toast.errorBody'),
                              variant: 'destructive',
                            })
                          )
                        }
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        {t('schedule.download')}
                      </Button>
                    )}
                    {job.error && <p className="text-destructive text-xs">{job.error}</p>}
                  </div>
                ))
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => void refreshSchedule()}>
                {t('schedule.refresh')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ExportsPage;
