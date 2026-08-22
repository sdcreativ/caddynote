import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { downloadReportExport } from '@/services/strkReportService';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Types alignés sur `GET /reports/export` (signatures n’y figurent pas). */
  dataType: 'absences' | 'grades' | 'attendance' | 'students';
  /** Conservé pour aperçu UI ; l’export serveur ne dépend pas de ce tableau. */
  data?: unknown[];
}

type UiFormat = 'pdf' | 'excel' | 'csv';

const rangeToDates = (range: string): { start?: string; end?: string } => {
  if (range === 'all') return {};
  const end = new Date();
  const start = new Date();
  if (range === 'week') start.setDate(end.getDate() - 7);
  else if (range === 'month') start.setMonth(end.getMonth() - 1);
  else if (range === 'quarter') start.setMonth(end.getMonth() - 3);
  else if (range === 'year') start.setFullYear(end.getFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

export function ExportDialog({ open, onOpenChange, dataType, data = [] }: ExportDialogProps) {
  const { t } = useTranslation('export');
  const { t: tc } = useTranslation('common');
  const { user } = useStrkAuth();
  const [format, setFormat] = useState<UiFormat>('csv');
  const [dateRange, setDateRange] = useState('month');
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportFormats = [
    { value: 'pdf' as const, icon: <FileText className="h-4 w-4" /> },
    { value: 'excel' as const, icon: <Table className="h-4 w-4" /> },
    { value: 'csv' as const, icon: <Table className="h-4 w-4" /> },
  ];

  const dateRangeValues = ['week', 'month', 'quarter', 'year', 'all'] as const;

  const handleExport = async () => {
    if (!user?.institutionId) {
      toast({
        title: t('toast.errorTitle'),
        description: t('toast.noInstitution'),
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const apiFormat = format === 'excel' ? 'xlsx' : format;
      const dates = rangeToDates(dateRange);
      await downloadReportExport(dataType, user.institutionId, dates, undefined, apiFormat);
      toast({
        title: t('toast.successTitle'),
        description: t('toast.successBody', {
          fileName: `export_${dataType}.${apiFormat}`,
        }),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t('toast.errorTitle'),
        description: error instanceof Error ? error.message : t('toast.errorBody'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('title', { type: t(`dataTypes.${dataType}`) })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>{t('formatLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {exportFormats.map((formatOption) => (
                <Button
                  key={formatOption.value}
                  variant={format === formatOption.value ? 'default' : 'outline'}
                  onClick={() => setFormat(formatOption.value)}
                  className="flex items-center gap-2"
                  type="button"
                >
                  {formatOption.icon}
                  {t(`formats.${formatOption.value}`)}
                </Button>
              ))}
            </div>
          </div>

          {dataType !== 'students' && (
            <div className="space-y-2">
              <Label htmlFor="dateRange">{t('period')}</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger id="dateRange">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateRangeValues.map((range) => (
                    <SelectItem key={range} value={range}>
                      {t(`dateRanges.${range}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">{t('preview.title')}</p>
            <ul className="mt-2 space-y-1">
              <li>{t('preview.format', { format: format.toUpperCase() })}</li>
              <li>{t('preview.period', { period: t(`dateRanges.${dateRange}`) })}</li>
              <li>{t('preview.count', { count: data.length })}</li>
              <li>{t('preview.viaReports')}</li>
            </ul>
            {dataType === 'grades' && (
              <p className="mt-3 text-slate-700">
                {t('bulletinHint')}{' '}
                <Link to="/documents" className="font-medium text-[#1D70D8] underline-offset-2 hover:underline">
                  {t('bulletinLink')}
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} type="button">
            {tc('actions.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !user?.institutionId} type="button">
            {isExporting ? (
              <>{t('exporting')}</>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {tc('actions.export')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
