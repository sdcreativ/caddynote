import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { ApiError } from '@/lib/apiClient';
import {
  createAdmissionDocumentType,
  createAdmissionPacketTemplate,
  duplicateAdmissionPacketTemplate,
  ensureAdmissionPackets,
  fetchAdmissionPacketCatalog,
  fetchAdmissionPacketTemplates,
  fetchAdmissionPolicy,
  replaceAdmissionPacketRequirements,
  updateAdmissionPacketTemplate,
  updateAdmissionPolicy,
  type AdmissionDocumentType,
  type AdmissionPacketTemplate,
} from '@/services/strkAdmissionService';

const KINDS = ['pre_registration', 'first_enrollment', 're_enrollment', 'transfer'] as const;
const OBLIGATIONS = ['required', 'optional', 'conditional'] as const;
const ORIGINAL_MODES = ['digital_only', 'copy_then_original', 'physical_only'] as const;

const AdmissionPacketsConfigPanel = () => {
  const { t } = useTranslation('admissions');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();
  const prompt = usePromptDialog();
  const [templates, setTemplates] = useState<AdmissionPacketTemplate[]>([]);
  const [types, setTypes] = useState<AdmissionDocumentType[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [policySummary, setPolicySummary] = useState<string>('');

  const selected = templates.find((tpl) => tpl.id === selectedId) ?? null;

  const load = async () => {
    try {
      await ensureAdmissionPackets().catch(() => undefined);
      const [{ templates: list }, { types: catalog }, { policy }] = await Promise.all([
        fetchAdmissionPacketTemplates(),
        fetchAdmissionPacketCatalog(),
        fetchAdmissionPolicy(),
      ]);
      setTemplates(list);
      setTypes(catalog.filter((x) => x.institutionId));
      if (!selectedId && list[0]) setSelectedId(list[0].id);
      setPolicySummary(
        `Canaux: email=${policy.channels.email ? 'oui' : 'non'}, sms=${policy.channels.sms ? 'oui' : 'non'}, whatsapp=${policy.channels.whatsapp ? 'oui' : 'non'} · Paiement: ${policy.payment.trigger}`
      );
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.loadError'),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createTemplate = async () => {
    const values = await prompt({
      title: t('config.newTemplate'),
      fields: [
        {
          name: 'code',
          label: t('config.promptCode'),
          defaultValue: `modele_${Date.now().toString(36)}`,
          required: true,
        },
        {
          name: 'name',
          label: t('config.promptName'),
          defaultValue: t('config.newTemplateName'),
          required: true,
        },
      ],
    });
    if (!values) return;
    setBusy(true);
    try {
      const { template } = await createAdmissionPacketTemplate({
        code: values.code,
        name: values.name,
        applicationKind: 'pre_registration',
        isDefault: false,
        requirements: [],
      });
      await load();
      setSelectedId(template.id);
      toast({ title: t('config.templateCreated') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!selected) return;
    const values = await prompt({
      title: t('config.templateDuplicated'),
      fields: [
        {
          name: 'code',
          label: t('config.promptCode'),
          defaultValue: `${selected.code}_copie`,
          required: true,
        },
        {
          name: 'name',
          label: t('config.promptName'),
          defaultValue: `${selected.name} (copie)`,
          required: true,
        },
        {
          name: 'academicYear',
          label: t('config.promptYear'),
          defaultValue: selected.academicYear ?? '',
        },
      ],
    });
    if (!values) return;
    setBusy(true);
    try {
      const { template } = await duplicateAdmissionPacketTemplate(selected.id, {
        code: values.code,
        name: values.name,
        academicYear: values.academicYear || undefined,
      });
      await load();
      setSelectedId(template.id);
      toast({ title: t('config.templateDuplicated') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveMeta = async (patch: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    try {
      await updateAdmissionPacketTemplate(selected.id, patch);
      await load();
      toast({ title: t('config.saved') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const addRequirement = async (documentTypeId: string) => {
    if (!selected) return;
    if (selected.requirements.some((r) => r.documentTypeId === documentTypeId)) {
      toast({ title: t('config.reqExists'), variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await replaceAdmissionPacketRequirements(selected.id, [
        ...selected.requirements.map((r) => ({
          documentTypeId: r.documentTypeId,
          obligation: r.obligation,
          originalMode: r.originalMode,
          helpText: r.helpText,
          conditionRule: r.conditionRule,
          sortOrder: r.sortOrder,
        })),
        { documentTypeId, obligation: 'required', originalMode: 'digital_only' },
      ]);
      await load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const updateRequirement = async (
    documentTypeId: string,
    patch: { obligation?: string; originalMode?: string; conditionFlags?: string }
  ) => {
    if (!selected) return;
    setBusy(true);
    try {
      await replaceAdmissionPacketRequirements(
        selected.id,
        selected.requirements.map((r) => {
          if (r.documentTypeId !== documentTypeId) {
            return {
              documentTypeId: r.documentTypeId,
              obligation: r.obligation,
              originalMode: r.originalMode,
              helpText: r.helpText,
              conditionRule: r.conditionRule,
              sortOrder: r.sortOrder,
            };
          }
          const flags = patch.conditionFlags
            ? patch.conditionFlags
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
          return {
            documentTypeId: r.documentTypeId,
            obligation: patch.obligation ?? r.obligation,
            originalMode: patch.originalMode ?? r.originalMode,
            helpText: r.helpText,
            conditionRule:
              (patch.obligation ?? r.obligation) === 'conditional'
                ? { flags: flags ?? (r.conditionRule as { flags?: string[] } | null)?.flags ?? [] }
                : null,
            sortOrder: r.sortOrder,
          };
        })
      );
      await load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeRequirement = async (documentTypeId: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await replaceAdmissionPacketRequirements(
        selected.id,
        selected.requirements
          .filter((r) => r.documentTypeId !== documentTypeId)
          .map((r) => ({
            documentTypeId: r.documentTypeId,
            obligation: r.obligation,
            originalMode: r.originalMode,
            helpText: r.helpText,
            conditionRule: r.conditionRule,
            sortOrder: r.sortOrder,
          }))
      );
      await load();
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const createType = async () => {
    const values = await prompt({
      title: t('config.newType'),
      fields: [
        {
          name: 'code',
          label: t('config.promptTypeCode'),
          defaultValue: `piece_${Date.now().toString(36)}`,
          required: true,
        },
        {
          name: 'label',
          label: t('config.promptTypeLabel'),
          required: true,
        },
      ],
    });
    if (!values) return;
    setBusy(true);
    try {
      await createAdmissionDocumentType({ code: values.code, label: values.label, category: 'other' });
      await load();
      toast({ title: t('config.typeCreated') });
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof ApiError ? error.message : t('config.saveError'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t('config.policyTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{policySummary || t('config.policyHint')}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await updateAdmissionPolicy({
                    channels: { email: true, sms: true, whatsapp: true, inApp: true },
                    payment: {
                      trigger: 'after_acceptance',
                      requirePaidBeforeSubmit: false,
                      requirePaidBeforeEnroll: true,
                    },
                    expiryReminderDays: 14,
                    deadlineReminderDays: 3,
                  });
                  await load();
                  toast({ title: t('config.saved') });
                } catch (error) {
                  toast({
                    title: tc('status.error'),
                    description: error instanceof ApiError ? error.message : t('config.saveError'),
                    variant: 'destructive',
                  });
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t('config.applyDefaultPolicy')}
          </Button>
        </CardHeader>
      </Card>

    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">{t('config.templatesTitle')}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void createTemplate()} disabled={busy}>
              {t('config.newTemplate')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void createType()} disabled={busy}>
              {t('config.newType')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  const values = await prompt({
                    title: t('config.newCampus'),
                    fields: [
                      {
                        name: 'code',
                        label: t('config.promptCode'),
                        defaultValue: `campus_${Date.now().toString(36)}`,
                        required: true,
                      },
                      {
                        name: 'name',
                        label: t('apply.campus'),
                        defaultValue: 'Campus principal',
                        required: true,
                      },
                    ],
                  });
                  if (!values) return;
                  setBusy(true);
                  try {
                    const { createAdmissionCampus } = await import('@/services/strkAdmissionService');
                    await createAdmissionCampus({ code: values.code, name: values.name });
                    toast({ title: t('config.campusCreated') });
                  } catch (error) {
                    toast({
                      title: tc('status.error'),
                      description: error instanceof ApiError ? error.message : t('config.saveError'),
                      variant: 'destructive',
                    });
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t('config.newCampus')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                tpl.id === selectedId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
              }`}
              onClick={() => setSelectedId(tpl.id)}
            >
              <div className="font-medium">{tpl.name}</div>
              <div className="text-xs opacity-70">
                {tpl.applicationKind}
                {!tpl.isActive ? ` · ${t('config.inactive')}` : ''}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{selected.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{selected.code}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void duplicate()} disabled={busy}>
                {t('config.duplicate')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void saveMeta({ isActive: !selected.isActive })}
                disabled={busy}
              >
                {selected.isActive ? t('config.deactivate') : t('config.activate')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('config.kind')}</Label>
                <Select
                  value={selected.applicationKind}
                  onValueChange={(v) => void saveMeta({ applicationKind: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`config.kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('apply.academicYear')}</Label>
                <Input
                  defaultValue={selected.academicYear ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== (selected.academicYear ?? null)) void saveMeta({ academicYear: v });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('config.level')}</Label>
                <Input
                  defaultValue={selected.level ?? ''}
                  placeholder={t('config.levelPlaceholder')}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== (selected.level ?? null)) void saveMeta({ level: v });
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{t('config.requirements')}</h3>
                <Select onValueChange={(id) => void addRequirement(id)}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder={t('config.addPiece')} />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ul className="space-y-2">
                {selected.requirements.map((req) => {
                  const flags =
                    (req.conditionRule as { flags?: string[] } | null)?.flags?.join(', ') ?? '';
                  return (
                    <li key={req.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
                      <div className="mb-2 font-medium">{req.documentType.label}</div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Select
                          value={req.obligation}
                          onValueChange={(v) => void updateRequirement(req.documentTypeId, { obligation: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OBLIGATIONS.map((o) => (
                              <SelectItem key={o} value={o}>
                                {t(`config.obligations.${o}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={req.originalMode}
                          onValueChange={(v) => void updateRequirement(req.documentTypeId, { originalMode: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORIGINAL_MODES.map((o) => (
                              <SelectItem key={o} value={o}>
                                {t(`config.originalModes.${o}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeRequirement(req.documentTypeId)}
                        >
                          {t('config.remove')}
                        </Button>
                      </div>
                      {req.obligation === 'conditional' && (
                        <div className="mt-2 space-y-1">
                          <Label className="text-xs">{t('config.conditionFlags')}</Label>
                          <Input
                            defaultValue={flags}
                            placeholder="foreign_student, assigned"
                            onBlur={(e) =>
                              void updateRequirement(req.documentTypeId, {
                                obligation: 'conditional',
                                conditionFlags: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">{t('config.empty')}</CardContent>
        </Card>
      )}
    </div>
    </div>
  );
};

export default AdmissionPacketsConfigPanel;
