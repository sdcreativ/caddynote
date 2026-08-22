import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Download, Ban } from 'lucide-react';
import { useStrkAuth } from '@/hooks/useStrkAuth';
import { useToast } from '@/hooks/use-toast';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { DocumentTemplatesPanel } from '@/components/documents/DocumentTemplatesPanel';
import { fetchStrkUsersByInstitution } from '@/services/strkUserService';
import { fetchClassesByInstitution } from '@/services/strkClassService';
import { fetchAcademicPeriods, type StrkAcademicPeriod } from '@/services/strkAcademicPeriodService';
import {
  fetchDocuments,
  generateEnrollmentCertificate,
  generateReportCard,
  generateTranscript,
  generateClassList,
  generateStudentCard,
  generateSchoolAttestation,
  revokeDocument,
  downloadDocument,
  type StrkDocument,
  type StrkDocumentType,
} from '@/services/strkDocumentService';

/**
 * DOC-001 à 005 — le module Documents était entièrement construit et testé
 * côté serveur (5 types, personnalisation, révocation, vérification
 * publique par QR) sans aucune interface. Cette page relie enfin l'écran à
 * l'API existante — mêmes principes que `/finance` juste avant.
 */

const GENERATABLE_TYPES: { value: StrkDocumentType; needsStudent: boolean; needsPeriod?: boolean; needsClass?: boolean; needsYear?: boolean }[] = [
  { value: 'enrollment_certificate', needsStudent: true },
  { value: 'report_card', needsStudent: true, needsPeriod: true },
  { value: 'transcript', needsStudent: true, needsYear: true },
  { value: 'class_list', needsStudent: false, needsClass: true },
  { value: 'student_card', needsStudent: true },
  { value: 'school_attestation', needsStudent: true },
];

const DocumentsPage = () => {
  const { user } = useStrkAuth();
  const { toast } = useToast();
  const confirm = useConfirmDialog();
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');

  const [documents, setDocuments] = useState<StrkDocument[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [periods, setPeriods] = useState<StrkAcademicPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showGenerate, setShowGenerate] = useState(false);
  const [genType, setGenType] = useState<StrkDocumentType>('enrollment_certificate');
  const [genStudentId, setGenStudentId] = useState('');
  const [genPeriodId, setGenPeriodId] = useState('');
  const [genClassId, setGenClassId] = useState('');
  const [genYear, setGenYear] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.institutionId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const [docs, users, classList, periodList] = await Promise.all([
        fetchDocuments(user.institutionId),
        fetchStrkUsersByInstitution(user.institutionId),
        fetchClassesByInstitution(user.institutionId),
        fetchAcademicPeriods(user.institutionId),
      ]);
      setDocuments(docs);
      setStudents(users.filter((u) => u.role === 'student').map((u) => ({ id: u.id, name: u.name || t('studentFallback') })));
      setClasses(classList.map((c) => ({ id: c.id, name: c.name })));
      setPeriods(periodList);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [user?.institutionId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedTypeConfig = GENERATABLE_TYPES.find((item) => item.value === genType)!;

  const handleGenerate = async () => {
    let created: StrkDocument | null = null;
    if (genType === 'enrollment_certificate') {
      if (!genStudentId) return;
      created = await generateEnrollmentCertificate(genStudentId);
    } else if (genType === 'report_card') {
      if (!genStudentId || !genPeriodId) return;
      created = await generateReportCard(genStudentId, genPeriodId);
    } else if (genType === 'transcript') {
      if (!genStudentId || !genYear) return;
      created = await generateTranscript(genStudentId, genYear);
    } else if (genType === 'class_list') {
      if (!genClassId) return;
      created = await generateClassList(genClassId);
    } else if (genType === 'student_card') {
      if (!genStudentId) return;
      created = await generateStudentCard(genStudentId);
    } else if (genType === 'school_attestation') {
      if (!genStudentId) return;
      created = await generateSchoolAttestation(genStudentId);
    }

    if (created) {
      toast({ title: t('generatedTitle'), description: t('generatedBody', { title: created.title, version: created.version }) });
      setShowGenerate(false);
      setGenStudentId('');
      setGenPeriodId('');
      setGenClassId('');
      setGenYear('');
      loadData();
      // Téléchargement immédiat — utile pour la carte élève (impression wallet).
      try {
        await downloadDocument(created.id, `${created.type}-v${created.version}.pdf`);
      } catch {
        toast({
          title: t('createdTitle'),
          description: t('createdDownloadFailed'),
        });
      }
    } else {
      toast({
        title: tc('status.error'),
        description: t('generateError'),
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (doc: StrkDocument) => {
    try {
      await downloadDocument(doc.id, `${doc.type}-v${doc.version}.pdf`);
    } catch (error) {
      toast({
        title: tc('status.error'),
        description: error instanceof Error ? error.message : t('downloadError'),
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = async (id: string) => {
    const ok = await confirm({
      description: t('revokeConfirm'),
      variant: 'destructive',
    });
    if (!ok) return;
    if (await revokeDocument(id)) {
      toast({ title: t('revokedTitle') });
      loadData();
    }
  };

  if (user && !user.institutionId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 py-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('subtitle')}
          </p>
        </div>
        {/* La génération est réservée à la direction côté serveur
            (requireRole admin/school_admin) — un enseignant peut consulter
            la liste (rôle inclus dans GET /documents) mais pas émettre de
            document officiel. */}
        {['admin', 'school_admin'].includes(user?.role || '') && (
          <Button onClick={() => setShowGenerate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('generate')}
          </Button>
        )}
      </div>

      {['admin', 'school_admin'].includes(user?.role || '') && <DocumentTemplatesPanel />}

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <LoadingState label={t('loading')} />
          ) : loadError ? (
            <ErrorState description={loadError} onRetry={() => void loadData()} />
          ) : documents.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyBody')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colTitle')}</TableHead>
                  <TableHead>{t('colType')}</TableHead>
                  <TableHead>{t('colVersion')}</TableHead>
                  <TableHead>{t('colStatus')}</TableHead>
                  <TableHead>{t('colGeneratedAt')}</TableHead>
                  <TableHead className="text-right">{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.title}</TableCell>
                    <TableCell>{t(`types.${d.type}`)}</TableCell>
                    <TableCell>v{d.version}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === 'revoked' ? 'destructive' : 'secondary'}>
                        {d.status === 'revoked' ? t('statusRevoked') : t('statusValid')}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(d.generated_at).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleDownload(d)} aria-label={t('downloadAria', { title: d.title })}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {d.status !== 'revoked' && (
                          <Button variant="ghost" size="icon" onClick={() => handleRevoke(d.id)} aria-label={t('revokeAria', { title: d.title })}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('generate')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('documentType')}</Label>
              <Select value={genType} onValueChange={(v) => setGenType(v as StrkDocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENERATABLE_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{t(`types.${item.value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('receiptHint')}
              </p>
            </div>

            {selectedTypeConfig.needsStudent && (
              <div className="space-y-2">
                <Label>{t('student')}</Label>
                <Select value={genStudentId} onValueChange={setGenStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('studentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTypeConfig.needsPeriod && (
              <div className="space-y-2">
                <Label>{t('period')}</Label>
                <Select value={genPeriodId} onValueChange={setGenPeriodId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('periodPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.academic_year})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTypeConfig.needsYear && (
              <div className="space-y-2">
                <Label>{t('academicYear')}</Label>
                <Input placeholder={t('yearPlaceholder')} value={genYear} onChange={(e) => setGenYear(e.target.value)} />
              </div>
            )}

            {selectedTypeConfig.needsClass && (
              <div className="space-y-2">
                <Label>{t('class')}</Label>
                <Select value={genClassId} onValueChange={setGenClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('classPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleGenerate}>{t('generateSubmit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentsPage;
