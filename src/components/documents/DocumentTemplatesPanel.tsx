import { useCallback, useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiClient, ApiError, authorizedFetch } from '@/lib/apiClient';
import type { StrkDocumentType } from '@/services/strkDocumentService';
import { DOCUMENT_TYPE_LABELS } from '@/services/strkDocumentService';

type Template = {
  accentColor?: string | null;
  footerText?: string | null;
  showAddress?: boolean;
  font?: string | null;
  watermarkEnabled?: boolean;
  signatureLabel?: string | null;
  signatureName?: string | null;
};

const TYPES = Object.keys(DOCUMENT_TYPE_LABELS) as StrkDocumentType[];

export function DocumentTemplatesPanel() {
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const [type, setType] = useState<StrkDocumentType>('enrollment_certificate');
  const [form, setForm] = useState<Template>({
    accentColor: '#1D70D8',
    footerText: '',
    showAddress: true,
    font: 'Helvetica',
    watermarkEnabled: false,
    signatureLabel: t('templates.defaultSignatureLabel'),
    signatureName: '',
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { template } = await apiClient.get<{ template: Template | null }>(`/documents/templates/${type}`);
      if (template) setForm((f) => ({ ...f, ...template }));
    } catch (e) {
      toast({
        title: t('templates.loadTitle'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [type, toast, t, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    try {
      await apiClient.put(`/documents/templates/${type}`, form);
      toast({ title: t('templates.savedTitle') });
    } catch (e) {
      toast({
        title: t('templates.saveFailedTitle'),
        description: e instanceof ApiError ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  const preview = async () => {
    try {
      const response = await authorizedFetch(`/documents/templates/${type}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || t('templates.httpError', { status: response.status }));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      toast({
        title: t('templates.previewFailedTitle'),
        description: e instanceof Error ? e.message : tc('status.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4" /> {t('templates.title')}
        </CardTitle>
        <CardDescription>{t('templates.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>{t('documentType')}</Label>
          <Select value={type} onValueChange={(v) => setType(v as StrkDocumentType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((docType) => (
                <SelectItem key={docType} value={docType}>
                  {t(`types.${docType}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('templates.accentColor')}</Label>
          <Input
            type="color"
            value={form.accentColor || '#1D70D8'}
            onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('templates.font')}</Label>
          <Input value={form.font || ''} onChange={(e) => setForm({ ...form, font: e.target.value })} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>{t('templates.footer')}</Label>
          <Input
            value={form.footerText || ''}
            onChange={(e) => setForm({ ...form, footerText: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('templates.signatureLabel')}</Label>
          <Input
            value={form.signatureLabel || ''}
            onChange={(e) => setForm({ ...form, signatureLabel: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('templates.signatureName')}</Label>
          <Input
            value={form.signatureName || ''}
            onChange={(e) => setForm({ ...form, signatureName: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.showAddress}
            onCheckedChange={(v) => setForm({ ...form, showAddress: v })}
          />
          <Label>{t('templates.showAddress')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={!!form.watermarkEnabled}
            onCheckedChange={(v) => setForm({ ...form, watermarkEnabled: v })}
          />
          <Label>{t('templates.watermark')}</Label>
        </div>
        <div className="flex gap-2 md:col-span-2">
          <Button onClick={() => void save()} disabled={loading}>
            {tc('actions.save')}
          </Button>
          <Button variant="outline" onClick={() => void preview()}>
            {t('templates.previewPdf')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
