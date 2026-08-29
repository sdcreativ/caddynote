import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { getStudentAccess, isSameInstitution, isGlobalAdmin, SECRETARIAT_ROLES, FINANCE_ROLES, TEACHING_ROLES, INSTITUTION_STAFF_ROLES } from '../lib/authz.js';
import { renderPdfDocument, renderStudentCardPdf, type DocumentBranding } from '../lib/pdf.js';
import { getLatestComputations } from '../lib/gradeEngine.js';
import {
  isS3Configured,
  buildObjectKey,
  buildTenantScope,
  isOwnedObjectKey,
  getPresignedDownloadUrl,
} from '../lib/s3.js';
import {
  putStoredObject,
  getStoredObjectBytes,
  deleteStoredObject,
} from '../lib/fileStorage.js';
import { STORAGE_FOLDER, folderForDocumentType } from '../lib/storageFolders.js';
import { AntivirusGateError, assertCleanUpload } from '../lib/antivirus.js';
import type { JwtPayload } from '../lib/jwt.js';
import { logAudit } from '../lib/audit.js';
import { Prisma, type StrkDocument, type StrkDocumentType } from '@prisma/client';

/**
 * Module Documents & vérification (chap. 18, DOC-001 à 005).
 *
 * DOC-001 : génération PDF pour un nombre restreint de types (certificat de
 * scolarité, reçu de paiement, bulletin) — le moteur (`buildDocumentContent`
 * + `lib/pdf.ts`) est conçu pour être étendu à d'autres types sans changer
 * l'architecture. EVA-006 : le bulletin (`report_card`) s'appuie sur le
 * dernier calcul versionné du moteur de moyennes/rangs (EVA-004, voir
 * `lib/gradeEngine.ts`) — un bulletin ne peut être émis qu'après un
 * `POST /grades/compute` réussi pour la classe/période concernée ; sinon
 * pas de contenu fiable à mettre dans le PDF.
 * DOC-002 : personnalisation par établissement (logo, couleur d'accent,
 * mention de pied de page, affichage de l'adresse — `StrkDocumentTemplate`,
 * `PUT /documents/templates/:type`). Le bloc de vérification (DOC-004) reste
 * une "zone protégée" : jamais personnalisable, cf. `lib/pdf.ts`.
 * DOC-003 : chaque génération crée une nouvelle version, jamais un écrasement.
 * DOC-004 : QR intégré au PDF, pointant vers la page SPA publique
 * `/verify/document/:token` (APP_URL). L’API `GET /documents/verify/:token`
 * reste la source JSON (comme `/finance/verify/:token`).
 * DOC-005 : persistance systématique via `fileStorage` (S3 si configuré,
 * sinon disque local). Téléchargement : URL signée S3, ou flux octets locaux ;
 * repli de régénération depuis `dataSnapshot` si `fileKey` absent.
 */
export const documentsRouter = Router();
documentsRouter.use(requireAuth);
documentsRouter.use(requireFeature('documents'));

const buildDocumentContent = (
  type: StrkDocumentType,
  snapshot: Record<string, unknown>
): { title: string; paragraphs: string[] } => {
  if (type === 'enrollment_certificate') {
    const s = snapshot as {
      studentName: string;
      studentNumber?: string | null;
      className?: string | null;
      academicYear: string;
    };
    return {
      title: 'Certificat de scolarité',
      paragraphs: [
        `Nous soussignés certifions que ${s.studentName}${s.studentNumber ? ` (matricule ${s.studentNumber})` : ''} est inscrit(e) dans notre établissement${s.className ? ` en classe de ${s.className}` : ''} au titre de l'année scolaire ${s.academicYear}.`,
        `Le présent certificat est délivré à l'intéressé(e) pour servir et valoir ce que de droit.`,
      ],
    };
  }
  if (type === 'admission_confirmation') {
    const s = snapshot as {
      studentName: string;
      academicYear: string;
      applicationKind?: string | null;
      status?: string | null;
      decisionNotes?: string | null;
    };
    return {
      title: 'Confirmation de dossier d’admission',
      paragraphs: [
        `Nous confirmons que le dossier d’admission de ${s.studentName} pour l’année scolaire ${s.academicYear}${s.applicationKind ? ` (${s.applicationKind})` : ''} a été traité.`,
        s.status ? `Statut : ${s.status}.` : '',
        s.decisionNotes ? `Observations : ${s.decisionNotes}` : 'Le présent document vaut confirmation officielle pour la famille.',
      ].filter(Boolean),
    };
  }
  if (type === 'report_card') {
    const s = snapshot as {
      studentName: string;
      className?: string | null;
      academicYear: string;
      periodName: string;
      subjects: { name: string; average: number; coefficient: number; rank: number | null; studentCount: number }[];
      overallAverage: number;
      overallRank: number | null;
      studentCount: number;
    };
    return {
      title: `Bulletin — ${s.periodName}`,
      paragraphs: [
        `${s.studentName}${s.className ? ` — classe de ${s.className}` : ''} — année scolaire ${s.academicYear}`,
        ...s.subjects.map(
          (sub) =>
            `${sub.name} (coefficient ${sub.coefficient}) : ${sub.average.toFixed(2)}/20${sub.rank ? ` — rang ${sub.rank}/${sub.studentCount}` : ''}`
        ),
        `Moyenne générale : ${s.overallAverage.toFixed(2)}/20${s.overallRank ? ` — rang ${s.overallRank}/${s.studentCount}` : ''}`,
      ],
    };
  }
  if (type === 'payment_receipt') {
    const s = snapshot as {
      payerName: string;
      invoiceNumber: string;
      receiptNumber: string;
      amountCents: number;
      currency: string;
      method: string;
      paidAt: string;
    };
    return {
      title: 'Reçu de paiement',
      paragraphs: [
        `Reçu émis à ${s.payerName} pour le règlement de la facture ${s.invoiceNumber}.`,
        `Montant réglé : ${(s.amountCents / 100).toFixed(2)} ${s.currency}`,
        `Moyen de paiement : ${s.method}`,
        `Date de paiement : ${new Date(s.paidAt).toLocaleDateString('fr-FR')}`,
        `Numéro de reçu : ${s.receiptNumber}`,
      ],
    };
  }
  if (type === 'transcript') {
    const s = snapshot as {
      studentName: string;
      className?: string | null;
      academicYear: string;
      periods: { periodName: string; overallAverage: number; overallRank: number | null; studentCount: number }[];
    };
    return {
      title: `Relevé de notes — ${s.academicYear}`,
      paragraphs: [
        `${s.studentName}${s.className ? ` — classe de ${s.className}` : ''} — année scolaire ${s.academicYear}`,
        ...s.periods.map(
          (p) =>
            `${p.periodName} : moyenne générale ${p.overallAverage.toFixed(2)}/20${p.overallRank ? ` — rang ${p.overallRank}/${p.studentCount}` : ''}`
        ),
      ],
    };
  }
  if (type === 'class_list') {
    const s = snapshot as {
      className: string;
      academicYear: string;
      students: { name: string; studentNumber?: string | null }[];
    };
    return {
      title: `Liste de classe — ${s.className}`,
      paragraphs: [
        `Établissement — année scolaire ${s.academicYear} — ${s.students.length} élève(s)`,
        ...s.students.map((st, i) => `${i + 1}. ${st.name}${st.studentNumber ? ` (matricule ${st.studentNumber})` : ''}`),
      ],
    };
  }
  if (type === 'school_attestation') {
    const s = snapshot as {
      studentName: string;
      studentNumber?: string | null;
      className?: string | null;
      academicYear: string;
      purpose?: string | null;
    };
    return {
      title: 'Attestation de scolarité',
      paragraphs: [
        `L'établissement atteste que ${s.studentName}${s.studentNumber ? ` (matricule ${s.studentNumber})` : ''} est scolarisé(e)${s.className ? ` en classe de ${s.className}` : ''} pour l'année scolaire ${s.academicYear}.`,
        s.purpose
          ? `Cette attestation est délivrée pour ${s.purpose}.`
          : `Cette attestation est délivrée pour faire valoir ce que de droit.`,
      ],
    };
  }
  if (type === 'invoice') {
    const s = snapshot as {
      invoiceNumber: string;
      studentName: string;
      totalCents: number;
      paidCents: number;
      currency: string;
      dueDate?: string | null;
      lines: { label: string; amountCents: number; quantity: number; lineType: string }[];
      academicYear?: string | null;
    };
    return {
      title: `Facture ${s.invoiceNumber}`,
      paragraphs: [
        `Élève : ${s.studentName}${s.academicYear ? ` — année ${s.academicYear}` : ''}`,
        ...s.lines.map(
          (l) =>
            `${l.lineType === 'discount' ? 'Remise' : 'Ligne'} — ${l.label} × ${l.quantity} : ${(l.amountCents / 100).toFixed(2)} ${s.currency}`
        ),
        `Total : ${(s.totalCents / 100).toFixed(2)} ${s.currency}`,
        `Déjà réglé : ${(s.paidCents / 100).toFixed(2)} ${s.currency}`,
        `Reste dû : ${((s.totalCents - s.paidCents) / 100).toFixed(2)} ${s.currency}`,
        s.dueDate ? `Échéance : ${new Date(s.dueDate).toLocaleDateString('fr-FR')}` : '',
      ].filter(Boolean),
    };
  }
  const s = snapshot as {
    studentName: string;
    studentNumber?: string | null;
    className?: string | null;
    academicYear: string;
    dateOfBirth?: string | null;
    hasPhoto: boolean;
  };
  return {
    title: 'Carte d’élève',
    paragraphs: [
      `Identité : ${s.studentName}`,
      s.studentNumber ? `Matricule : ${s.studentNumber}` : 'Matricule : non attribué',
      s.className ? `Classe : ${s.className}` : 'Classe : non renseignée',
      `Année scolaire : ${s.academicYear}`,
      s.dateOfBirth ? `Date de naissance : ${s.dateOfBirth}` : '',
      s.hasPhoto ? 'Photo de profil : jointe au dossier numérique.' : 'Photo de profil : non renseignée.',
    ].filter(Boolean),
  };
};

/** DOC-002 : configuration de personnalisation de l'établissement pour ce
 * type de document, si elle existe. Le logo est lu via `fileStorage` (S3 ou
 * local) ; son absence ne bloque jamais la génération (dégrade vers texte). */
const getBranding = async (institutionId: string, type: StrkDocumentType): Promise<DocumentBranding | undefined> => {
  const template = await prisma.strkDocumentTemplate.findUnique({
    where: { institutionId_type: { institutionId, type } },
  });
  if (!template) return undefined;

  let logoBytes: Buffer | null = null;
  if (template.logoKey) {
    try {
      logoBytes = await getStoredObjectBytes(template.logoKey);
    } catch (error) {
      console.error('Logo établissement introuvable sur le stockage (clé obsolète ?) :', error);
    }
  }
  return { logoBytes, accentColor: template.accentColor, footerText: template.footerText, showAddress: template.showAddress };
};

/** URL humaine du QR (SPA) — l’API JSON reste disponible pour la page et les recettes. */
const documentVerificationPublicUrl = (token: string) => {
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080';
  return `${appUrl.replace(/\/$/, '')}/verify/document/${token}`;
};

const renderAndStore = async (document: StrkDocument, institution: { name: string; address: string | null }) => {
  const branding = await getBranding(document.institutionId, document.type);
  const verificationUrl = documentVerificationPublicUrl(document.verificationToken);

  if (document.type === 'student_card') {
    const s = document.dataSnapshot as {
      studentName: string;
      studentNumber?: string | null;
      className?: string | null;
      academicYear: string;
      dateOfBirth?: string | null;
      photoKey?: string | null;
    };
    let photoBytes: Buffer | null = null;
    if (s.photoKey) {
      try {
        photoBytes = await getStoredObjectBytes(s.photoKey);
      } catch {
        photoBytes = null;
      }
    }
    return renderStudentCardPdf({
      institutionName: institution.name,
      studentName: s.studentName,
      studentNumber: s.studentNumber,
      className: s.className,
      academicYear: s.academicYear,
      dateOfBirth: s.dateOfBirth,
      verificationUrl,
      documentId: document.id,
      version: document.version,
      generatedAt: document.generatedAt,
      accentColor: branding?.accentColor,
      photoBytes,
    });
  }

  const { title, paragraphs } = buildDocumentContent(document.type, document.dataSnapshot as Record<string, unknown>);
  return renderPdfDocument({
    title,
    institutionName: institution.name,
    institutionAddress: institution.address,
    paragraphs,
    verificationUrl,
    documentId: document.id,
    version: document.version,
    generatedAt: document.generatedAt,
    branding,
  });
};

/** Crée une nouvelle version d'un document pour une clé logique donnée
 * (établissement + type + sujet) — jamais d'écrasement (DOC-003). */
// Exporté pour réutilisation par d'autres modules qui émettent un document
// officiel sans passer par une route HTTP dédiée (ex. certificat de
// scolarité émis à la finalisation d'une préinscription — lib/admissions.ts).
// Bug réel trouvé et corrigé le 16/08/2026 (test de charge NFR-010,
// scénario "publication massive de bulletins") : `findFirst` puis `create`
// n'est pas atomique — deux requêtes concurrentes pour le même document
// (même établissement/type/sujet, ex. deux clics rapprochés sur "générer
// le bulletin", ou une vraie rafale de publication de fin de trimestre)
// lisaient la même "dernière version" et tentaient toutes les deux de créer
// la version suivante, violant la contrainte unique. Sans filet (voir
// `express-async-errors` + middleware d'erreur global ajoutés le même
// jour dans index.ts), cette erreur crashait TOUT le process Node, pas
// seulement la requête en conflit — coupant le service à tous les
// établissements jusqu'au redémarrage manuel. Corrigé par une nouvelle
// tentative sur conflit (P2002) : relit la version réellement en base et
// réessaie, borné pour ne jamais boucler indéfiniment sous contention
// extrême.
const MAX_VERSION_CONFLICT_RETRIES = 5;

export const generateDocument = async (params: {
  institutionId: string;
  type: StrkDocumentType;
  subjectId: string;
  dataSnapshot: Record<string, unknown>;
  generatedBy: string;
}) => {
  const institution = await prisma.strkInstitution.findUniqueOrThrow({ where: { id: params.institutionId } });
  const { title } = buildDocumentContent(params.type, params.dataSnapshot);

  let document: StrkDocument | undefined;
  for (let attempt = 0; attempt <= MAX_VERSION_CONFLICT_RETRIES; attempt++) {
    const current = await prisma.strkDocument.findFirst({
      where: { institutionId: params.institutionId, type: params.type, subjectId: params.subjectId },
      orderBy: { version: 'desc' },
    });
    try {
      document = await prisma.strkDocument.create({
        data: {
          institutionId: params.institutionId,
          type: params.type,
          subjectId: params.subjectId,
          version: (current?.version ?? 0) + 1,
          title,
          dataSnapshot: params.dataSnapshot as any,
          verificationToken: crypto.randomBytes(16).toString('hex'),
          generatedBy: params.generatedBy,
        },
      });
      break;
    } catch (error) {
      const isVersionConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('version');
      if (!isVersionConflict || attempt === MAX_VERSION_CONFLICT_RETRIES) {
        throw error;
      }
      // Une autre requête a créé la même version entre notre lecture et
      // notre écriture — on relit l'état réel et on retente.
    }
  }
  if (!document) {
    throw new Error('Impossible de générer le document après plusieurs tentatives (conflit de version persistant)');
  }

  const pdfBytes = await renderAndStore(document, institution);

  const scope = buildTenantScope(params.institutionId, params.generatedBy);
  const folder = folderForDocumentType(params.type);
  const fileKey = buildObjectKey(folder, scope, `${params.type}-${params.subjectId}-v${document.version}.pdf`);
  await putStoredObject(fileKey, Buffer.from(pdfBytes), 'application/pdf');
  return prisma.strkDocument.update({ where: { id: document.id }, data: { fileKey } });
};

// --- Génération (réservée au personnel de direction — action officielle) ---

const enrollmentCertificateSchema = z.object({ studentId: z.string().uuid() });

documentsRouter.post('/enrollment-certificate', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = enrollmentCertificateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    include: { profile: { select: { firstName: true, lastName: true } }, class: true },
  });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const document = await generateDocument({
    institutionId: student.institutionId,
    type: 'enrollment_certificate',
    subjectId: student.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Élève',
      studentNumber: student.studentNumber,
      className: student.class?.name ?? null,
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    },
  });
  res.status(201).json({ document });
});

const paymentReceiptSchema = z.object({ paymentId: z.string().uuid() });

documentsRouter.post('/payment-receipt', requireRole(...FINANCE_ROLES), async (req, res) => {
  const parsed = paymentReceiptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const payment = await prisma.strkPayment.findUnique({
    where: { id: parsed.data.paymentId },
    include: { invoice: true },
  });
  if (!payment || !isSameInstitution(req.auth!, payment.invoice.institutionId)) {
    return res.status(404).json({ error: 'Paiement introuvable' });
  }
  if (payment.status !== 'paid') {
    return res.status(400).json({ error: 'Seul un paiement confirmé peut faire l’objet d’un reçu' });
  }
  const payer = payment.paidBy ? await prisma.strkProfile.findUnique({ where: { id: payment.paidBy } }) : null;
  const document = await generateDocument({
    institutionId: payment.invoice.institutionId,
    type: 'payment_receipt',
    subjectId: payment.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      payerName: payer ? [payer.firstName, payer.lastName].filter(Boolean).join(' ') : 'Client',
      invoiceNumber: payment.invoice.invoiceNumber,
      receiptNumber: payment.receiptNumber ?? payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
      paidAt: (payment.paidAt ?? new Date()).toISOString(),
    },
  });
  res.status(201).json({ document });
});

/** Dérive une clé UUID stable et déterministe à partir d'un préfixe et d'un
 * ou plusieurs identifiants (mêmes entrées -> toujours la même sortie), pour
 * respecter la colonne `subjectId @db.Uuid` de `StrkDocument` sans lui faire
 * porter un couple/triplet d'identifiants. Pas cryptographique : un simple
 * hash formaté en UUID, uniquement utilisé comme clé de regroupement
 * interne — jamais retraversable, d'où le besoin de conserver les vrais
 * identifiants dans `dataSnapshot` pour le contrôle d'accès. */
const compositeDocumentKey = (...parts: string[]): string => {
  const hash = crypto.createHash('sha256').update(parts.join(':')).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};
const reportCardKey = (studentId: string, periodId: string): string =>
  compositeDocumentKey('report_card', studentId, periodId);
const transcriptKey = (studentId: string, academicYear: string): string =>
  compositeDocumentKey('transcript', studentId, academicYear);

const reportCardSchema = z.object({ studentId: z.string().uuid(), periodId: z.string().uuid() });

// EVA-006 : le bulletin est une lecture du dernier calcul versionné du
// moteur de moyennes/rangs (EVA-004) — jamais recalculé à la volée ici, pour
// que le bulletin corresponde toujours exactement à un calcul officiel déjà
// tracé (StrkGradeComputation.version), pas à un instantané qui pourrait
// diverger du dernier "arrêté" par la direction.
documentsRouter.post('/report-card', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = reportCardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    include: { profile: { select: { firstName: true, lastName: true } }, class: true },
  });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  if (!student.classId) {
    return res.status(400).json({ error: 'Élève non rattaché à une classe' });
  }
  const period = await prisma.strkAcademicPeriod.findUnique({ where: { id: parsed.data.periodId } });
  if (!period || period.institutionId !== student.institutionId) {
    return res.status(400).json({ error: 'Période invalide pour cet établissement' });
  }
  const computations = await getLatestComputations({
    classId: student.classId,
    periodId: parsed.data.periodId,
    studentId: student.id,
  });
  if (computations.length === 0) {
    return res.status(409).json({ error: 'Aucun calcul de moyennes disponible pour cette période — lancez POST /grades/compute au préalable' });
  }
  const overall = computations.find((c) => c.subjectId === null);
  const subjectRows = computations.filter((c) => c.subjectId !== null);
  const subjects = await prisma.strkSubject.findMany({
    where: { id: { in: subjectRows.map((r) => r.subjectId!) } },
    select: { id: true, name: true },
  });
  const courses = await prisma.strkCourse.findMany({
    where: { subjectId: { in: subjectRows.map((r) => r.subjectId!) }, classId: student.classId },
    select: { subjectId: true, coefficient: true },
  });
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));
  const coefficientBySubjectId = new Map(courses.map((c) => [c.subjectId as string, Number(c.coefficient)]));

  const document = await generateDocument({
    institutionId: student.institutionId,
    type: 'report_card',
    // subjectId est une colonne UUID (voir schema.prisma) : "un élève, une
    // période" n'est pas un UUID en soi, donc on en dérive un de façon
    // déterministe (même élève + même période -> toujours la même clé, donc
    // les régénérations successives restent bien des versions du même
    // bulletin plutôt que des documents distincts). L'élève reste identifié
    // sans ambiguïté dans dataSnapshot.studentId pour le contrôle d'accès
    // (canAccessDocument), qui ne peut pas être retrouvé depuis ce hash.
    subjectId: reportCardKey(student.id, period.id),
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      studentId: student.id,
      periodId: period.id,
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Élève',
      className: student.class?.name ?? null,
      academicYear: period.academicYear,
      periodName: period.name,
      subjects: subjectRows.map((row) => ({
        name: subjectNameById.get(row.subjectId!) ?? 'Matière',
        average: Number(row.average),
        coefficient: coefficientBySubjectId.get(row.subjectId!) ?? 1,
        rank: row.rank,
        studentCount: row.studentCount,
      })),
      overallAverage: overall ? Number(overall.average) : 0,
      overallRank: overall?.rank ?? null,
      studentCount: overall?.studentCount ?? 0,
    },
  });
  res.status(201).json({ document });
});

const transcriptSchema = z.object({ studentId: z.string().uuid(), academicYear: z.string().min(1) });

// DOC-001 : relevé de notes — cumul de toutes les périodes déjà calculées
// d'une année scolaire pour un élève (distinct du bulletin EVA-006, qui ne
// porte que sur une seule période). Même principe de fiabilité que le
// bulletin : lit les derniers calculs versionnés, n'en recalcule aucun.
documentsRouter.post('/transcript', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    include: { profile: { select: { firstName: true, lastName: true } }, class: true },
  });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  if (!student.classId) {
    return res.status(400).json({ error: 'Élève non rattaché à une classe' });
  }
  const periods = await prisma.strkAcademicPeriod.findMany({
    where: { institutionId: student.institutionId, academicYear: parsed.data.academicYear },
    orderBy: { order: 'asc' },
  });
  const periodRows: { periodName: string; overallAverage: number; overallRank: number | null; studentCount: number }[] = [];
  for (const period of periods) {
    const computations = await getLatestComputations({ classId: student.classId, periodId: period.id, studentId: student.id });
    const overall = computations.find((c) => c.subjectId === null);
    if (!overall) continue; // pas encore de calcul arrêté pour cette période -> absente du relevé, pas une ligne à zéro
    periodRows.push({
      periodName: period.name,
      overallAverage: Number(overall.average),
      overallRank: overall.rank,
      studentCount: overall.studentCount,
    });
  }
  if (periodRows.length === 0) {
    return res.status(409).json({ error: 'Aucun calcul de moyennes disponible pour cette année scolaire' });
  }
  const document = await generateDocument({
    institutionId: student.institutionId,
    type: 'transcript',
    // Voir reportCardKey : même contrainte de colonne UUID, même repli sur
    // dataSnapshot.studentId pour le contrôle d'accès.
    subjectId: transcriptKey(student.id, parsed.data.academicYear),
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      studentId: student.id,
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Élève',
      className: student.class?.name ?? null,
      academicYear: parsed.data.academicYear,
      periods: periodRows,
    },
  });
  res.status(201).json({ document });
});

const classListSchema = z.object({ classId: z.string().uuid() });

// DOC-001 : liste de classe — document administratif (effectif nominatif),
// pas rattaché à un élève en particulier : subjectId est directement
// classId (déjà un UUID, pas besoin du hash composite ci-dessus).
documentsRouter.post('/class-list', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = classListSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const classroom = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId } });
  if (!classroom || !isSameInstitution(req.auth!, classroom.institutionId)) {
    return res.status(404).json({ error: 'Classe introuvable' });
  }
  const students = await prisma.strkStudent.findMany({
    where: { classId: classroom.id },
    include: { profile: { select: { firstName: true, lastName: true } } },
    orderBy: { profile: { lastName: 'asc' } },
  });
  const document = await generateDocument({
    institutionId: classroom.institutionId,
    type: 'class_list',
    subjectId: classroom.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      className: classroom.name,
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      students: students.map((s) => ({
        name: [s.profile.firstName, s.profile.lastName].filter(Boolean).join(' ') || 'Élève',
        studentNumber: s.studentNumber,
      })),
    },
  });
  res.status(201).json({ document });
});

const studentCardSchema = z.object({ studentId: z.string().uuid() });

documentsRouter.post('/student-card', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = studentCardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    include: {
      profile: { select: { firstName: true, lastName: true, profileImage: true } },
      class: { select: { name: true } },
    },
  });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const document = await generateDocument({
    institutionId: student.institutionId,
    type: 'student_card',
    subjectId: student.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Élève',
      studentNumber: student.studentNumber,
      className: student.class?.name ?? null,
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      dateOfBirth: student.enrollmentDate ? student.enrollmentDate.toISOString().slice(0, 10) : null,
      hasPhoto: !!student.profile.profileImage,
      photoKey: student.profile.profileImage ?? null,
    },
  });
  res.status(201).json({ document });
});

const schoolAttestationSchema = z.object({
  studentId: z.string().uuid(),
  purpose: z.string().max(300).optional(),
});

documentsRouter.post('/school-attestation', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = schoolAttestationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const student = await prisma.strkStudent.findUnique({
    where: { id: parsed.data.studentId },
    include: { profile: { select: { firstName: true, lastName: true } }, class: true },
  });
  if (!student || !isSameInstitution(req.auth!, student.institutionId)) {
    return res.status(404).json({ error: 'Élève introuvable' });
  }
  const document = await generateDocument({
    institutionId: student.institutionId,
    type: 'school_attestation',
    subjectId: student.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      studentName: [student.profile.firstName, student.profile.lastName].filter(Boolean).join(' ') || 'Élève',
      studentNumber: student.studentNumber,
      className: student.class?.name ?? null,
      academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      purpose: parsed.data.purpose ?? null,
    },
  });
  res.status(201).json({ document });
});

const invoiceDocumentSchema = z.object({ invoiceId: z.string().uuid() });

documentsRouter.post('/invoice', requireRole(...FINANCE_ROLES, ...SECRETARIAT_ROLES), async (req, res) => {
  const parsed = invoiceDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const invoice = await prisma.strkInvoice.findUnique({
    where: { id: parsed.data.invoiceId },
    include: {
      lines: true,
      student: { include: { profile: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!invoice || !isSameInstitution(req.auth!, invoice.institutionId)) {
    return res.status(404).json({ error: 'Facture introuvable' });
  }
  const studentName =
    [invoice.student.profile.firstName, invoice.student.profile.lastName].filter(Boolean).join(' ') || 'Élève';
  const document = await generateDocument({
    institutionId: invoice.institutionId,
    type: 'invoice',
    subjectId: invoice.id,
    generatedBy: req.auth!.sub,
    dataSnapshot: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.studentId,
      studentName,
      totalCents: invoice.totalCents,
      paidCents: invoice.paidCents,
      currency: invoice.currency,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      lines: invoice.lines.map((l) => ({
        label: l.label,
        amountCents: l.amountCents,
        quantity: l.quantity,
        lineType: l.lineType,
      })),
    },
  });
  res.status(201).json({ document });
});

// --- Personnalisation par établissement (DOC-002) ---

const documentTypeParam = z.enum([
  'enrollment_certificate',
  'payment_receipt',
  'report_card',
  'transcript',
  'class_list',
  'student_card',
  'school_attestation',
  'invoice',
  'admission_confirmation',
]);

documentsRouter.get('/templates/:type', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const type = documentTypeParam.safeParse(req.params.type);
  if (!type.success) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  const template = await prisma.strkDocumentTemplate.findUnique({
    where: { institutionId_type: { institutionId, type: type.data } },
  });
  res.json({ template });
});

const templateSchema = z.object({
  // Clé S3 obtenue via POST /files/presign-upload (dossier "documents") —
  // vérifiée ci-dessous comme appartenant bien au périmètre de cet
  // établissement (ORG-004), jamais acceptée telle quelle.
  logoKey: z.string().min(1).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format "#RRGGBB"')
    .nullable()
    .optional(),
  footerText: z.string().max(500).nullable().optional(),
  showAddress: z.boolean().optional(),
  font: z.enum(['helvetica', 'times', 'courier']).optional(),
  watermarkEnabled: z.boolean().optional(),
  signatureLabel: z.string().max(100).nullable().optional(),
  signatureName: z.string().max(100).nullable().optional(),
});

documentsRouter.put('/templates/:type', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const type = documentTypeParam.safeParse(req.params.type);
  if (!type.success) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  if (
    parsed.data.logoKey &&
    !isOwnedObjectKey(parsed.data.logoKey, STORAGE_FOLDER.documents, institutionId, req.auth!.sub)
  ) {
    return res.status(403).json({ error: 'Ce fichier ne provient pas de votre établissement' });
  }
  if (parsed.data.logoKey) {
    try {
      const bytes = await getStoredObjectBytes(parsed.data.logoKey);
      await assertCleanUpload(bytes);
    } catch (error) {
      if (error instanceof AntivirusGateError) {
        if (error.code === 'malware_detected') {
          await deleteStoredObject(parsed.data.logoKey).catch(() => {});
          await logAudit({
            institutionId,
            actorId: req.auth!.sub,
            action: 'document.antivirus_rejected',
            metadata: { fileKey: parsed.data.logoKey, context: 'template_logo' },
          });
        }
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  }

  const template = await prisma.strkDocumentTemplate.upsert({
    where: { institutionId_type: { institutionId, type: type.data } },
    create: { institutionId, type: type.data, ...parsed.data, updatedBy: req.auth!.sub },
    update: { ...parsed.data, updatedBy: req.auth!.sub },
  });
  res.json({ template });
});

// Données factices pour prévisualiser un gabarit sans avoir besoin d'un
// élève/paiement réel — cf. `POST /templates/:type/preview` ci-dessous.
const SAMPLE_DATA: Record<StrkDocumentType, Record<string, unknown>> = {
  enrollment_certificate: {
    studentName: 'Prénom Nom (exemple)',
    studentNumber: 'EX-0001',
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  },
  payment_receipt: {
    payerName: 'Client exemple',
    invoiceNumber: 'INV-EXEMPLE',
    receiptNumber: 'REC-EXEMPLE',
    amountCents: 25000,
    currency: 'XOF',
    method: 'cash',
    paidAt: new Date().toISOString(),
  },
  report_card: {
    studentName: 'Prénom Nom (exemple)',
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    periodName: 'Trimestre 1 (exemple)',
    subjects: [
      { name: 'Mathématiques', average: 14.5, coefficient: 3, rank: 4, studentCount: 28 },
      { name: 'Français', average: 12.8, coefficient: 3, rank: 12, studentCount: 28 },
    ],
    overallAverage: 13.6,
    overallRank: 7,
    studentCount: 28,
  },
  transcript: {
    studentName: 'Prénom Nom (exemple)',
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    periods: [
      { periodName: 'Trimestre 1 (exemple)', overallAverage: 13.6, overallRank: 7, studentCount: 28 },
      { periodName: 'Trimestre 2 (exemple)', overallAverage: 14.1, overallRank: 5, studentCount: 28 },
    ],
  },
  class_list: {
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    students: [
      { name: 'Prénom Nom (exemple)', studentNumber: 'EX-0001' },
      { name: 'Autre Élève (exemple)', studentNumber: 'EX-0002' },
    ],
  },
  student_card: {
    studentName: 'Prénom Nom (exemple)',
    studentNumber: 'EX-0001',
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    dateOfBirth: '2012-03-15',
    hasPhoto: false,
  },
  school_attestation: {
    studentName: 'Prénom Nom (exemple)',
    studentNumber: 'EX-0001',
    className: 'Exemple',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    purpose: 'démarches administratives (exemple)',
  },
  admission_confirmation: {
    studentName: 'Prénom Nom (exemple)',
    academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    applicationKind: 'pre_registration',
    status: 'conditionally_accepted',
    decisionNotes: null,
  },
  invoice: {
    invoiceNumber: 'INV-EXEMPLE',
    studentName: 'Prénom Nom (exemple)',
    totalCents: 150000,
    paidCents: 50000,
    currency: 'XOF',
    dueDate: new Date().toISOString(),
    lines: [
      { label: 'Frais de scolarité T1', amountCents: 100000, quantity: 1, lineType: 'fee' },
      { label: 'Cantine', amountCents: 50000, quantity: 1, lineType: 'fee' },
    ],
  },
};

// Rendu à la volée d'un exemple avec la configuration proposée (pas
// nécessairement encore enregistrée) — permet de voir le résultat avant de
// valider un changement de gabarit (DOC-002), sans créer de `StrkDocument`
// ni consommer de numéro de version.
documentsRouter.post('/templates/:type/preview', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const type = documentTypeParam.safeParse(req.params.type);
  if (!type.success) {
    return res.status(400).json({ error: 'Type de document invalide' });
  }
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institutionId = req.auth!.institutionId;
  if (!institutionId) {
    return res.status(400).json({ error: 'Aucun établissement associé à ce compte' });
  }
  if (
    parsed.data.logoKey &&
    !isOwnedObjectKey(parsed.data.logoKey, STORAGE_FOLDER.documents, institutionId, req.auth!.sub)
  ) {
    return res.status(403).json({ error: 'Ce fichier ne provient pas de votre établissement' });
  }

  const institution = await prisma.strkInstitution.findUniqueOrThrow({ where: { id: institutionId } });
  let logoBytes: Buffer | null = null;
  if (parsed.data.logoKey) {
    try {
      logoBytes = await getStoredObjectBytes(parsed.data.logoKey);
    } catch (error) {
      console.error('Aperçu : logo introuvable sur le stockage :', error);
    }
  }

  const previewVerifyUrl = documentVerificationPublicUrl('apercu-non-genere');
  if (type.data === 'student_card') {
    const s = SAMPLE_DATA.student_card as {
      studentName: string;
      studentNumber?: string | null;
      className?: string | null;
      academicYear: string;
      dateOfBirth?: string | null;
    };
    const pdfBytes = await renderStudentCardPdf({
      institutionName: institution.name,
      studentName: s.studentName,
      studentNumber: s.studentNumber,
      className: s.className,
      academicYear: s.academicYear,
      dateOfBirth: s.dateOfBirth,
      verificationUrl: previewVerifyUrl,
      documentId: 'APERÇU',
      version: 1,
      generatedAt: new Date(),
      accentColor: parsed.data.accentColor,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="apercu-carte.pdf"');
    return res.send(Buffer.from(pdfBytes));
  }
  const { title, paragraphs } = buildDocumentContent(type.data, SAMPLE_DATA[type.data]);
  const pdfBytes = await renderPdfDocument({
    title,
    institutionName: institution.name,
    institutionAddress: institution.address,
    paragraphs,
    verificationUrl: previewVerifyUrl,
    documentId: 'APERÇU',
    version: 1,
    generatedAt: new Date(),
    branding: { ...parsed.data, logoBytes },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="apercu.pdf"');
  res.send(Buffer.from(pdfBytes));
});

// --- Consultation ---

const canAccessDocument = async (auth: JwtPayload, document: StrkDocument): Promise<boolean> => {
  if (isGlobalAdmin(auth)) return true;
  if (INSTITUTION_STAFF_ROLES.includes(auth.role) && isSameInstitution(auth, document.institutionId)) return true;

  if (document.type === 'enrollment_certificate' || document.type === 'student_card' || document.type === 'school_attestation') {
    const access = await getStudentAccess(auth, document.subjectId);
    return access.allowed;
  }
  if (document.type === 'admission_confirmation') {
    // subjectId = applicationId — accessible au personnel du tenant uniquement (déjà couvert plus haut)
    // ou via le token public `/admissions/status/:token/confirmation`.
    return false;
  }
  if (document.type === 'report_card' || document.type === 'transcript') {
    // subjectId est un hash dérivé (cf. reportCardKey/transcriptKey), pas
    // l'id élève — l'identifiant réel est conservé dans dataSnapshot à la
    // génération.
    const studentId = (document.dataSnapshot as { studentId?: string }).studentId;
    if (!studentId) return false;
    const access = await getStudentAccess(auth, studentId);
    return access.allowed && (access.via !== 'guardian' || access.permissions.canViewGrades);
  }
  if (document.type === 'class_list') {
    // Document administratif (effectif nominatif) : jamais accessible à un
    // élève ou un responsable, quel que soit leur enfant — déjà refusé ici
    // puisque seul le personnel a été autorisé plus haut dans la fonction.
    return false;
  }
  if (document.type === 'invoice') {
    const studentId = (document.dataSnapshot as { studentId?: string }).studentId;
    if (!studentId) return false;
    const access = await getStudentAccess(auth, studentId);
    return access.allowed && (access.via !== 'guardian' || access.permissions.canViewBilling);
  }
  if (document.type === 'payment_receipt') {
    // Le payeur lui-même, ou un responsable avec le droit canViewBilling sur
    // l'élève concerné par la facture.
    const payment = await prisma.strkPayment.findUnique({ where: { id: document.subjectId }, include: { invoice: true } });
    if (!payment) return false;
    if (payment.paidBy === auth.sub) return true;
    const access = await getStudentAccess(auth, payment.invoice.studentId);
    return access.allowed && (access.via !== 'guardian' || access.permissions.canViewBilling);
  }
  return false;
};

// Liste par établissement — jusqu'ici absente : chaque document ne pouvait
// être retrouvé que si son id était déjà connu (ex. juste après sa
// génération), donc rien ne permettait de "parcourir" les documents déjà
// émis pour l'établissement. Réservée au personnel (une liste nominative de
// tous les documents n'a pas vocation à être exposée à une famille).
documentsRouter.get('/', requireRole(...TEACHING_ROLES, 'secretary', 'accountant'), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : req.auth!.institutionId;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const documents = await prisma.strkDocument.findMany({
    where: { institutionId },
    orderBy: [{ generatedAt: 'desc' }],
  });
  res.json({ documents });
});

documentsRouter.get('/:id', async (req, res) => {
  const document = await prisma.strkDocument.findUnique({ where: { id: req.params.id } });
  if (!document) {
    return res.status(404).json({ error: 'Document introuvable' });
  }
  if (!(await canAccessDocument(req.auth!, document))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ document });
});

documentsRouter.get('/:id/versions', async (req, res) => {
  const document = await prisma.strkDocument.findUnique({ where: { id: req.params.id } });
  if (!document) {
    return res.status(404).json({ error: 'Document introuvable' });
  }
  if (!(await canAccessDocument(req.auth!, document))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const versions = await prisma.strkDocument.findMany({
    where: { institutionId: document.institutionId, type: document.type, subjectId: document.subjectId },
    orderBy: { version: 'desc' },
    select: { id: true, version: true, status: true, generatedAt: true, revokedAt: true },
  });
  res.json({ versions });
});

// DOC-005 : URL signée si S3 + fileKey ; sinon octets depuis fileStorage ;
// repli régénération depuis dataSnapshot si pas de fileKey.
documentsRouter.get('/:id/download', async (req, res) => {
  const document = await prisma.strkDocument.findUnique({ where: { id: req.params.id } });
  if (!document) {
    return res.status(404).json({ error: 'Document introuvable' });
  }
  if (!(await canAccessDocument(req.auth!, document))) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (document.fileKey) {
    const { isAtRestEncryptionEnabled } = await import('../lib/fileStorage.js');
    if (isS3Configured() && !isAtRestEncryptionEnabled()) {
      try {
        const downloadUrl = await getPresignedDownloadUrl(document.fileKey);
        return res.json({ downloadUrl, expiresIn: 3600 });
      } catch (error) {
        console.error('Presign document S3 :', error);
      }
    }
    try {
      const stored = await getStoredObjectBytes(document.fileKey);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${document.type}-v${document.version}.pdf"`);
      return res.send(stored);
    } catch (error) {
      console.error('Document stocké introuvable, régénération :', error);
    }
  }
  const institution = await prisma.strkInstitution.findUniqueOrThrow({ where: { id: document.institutionId } });
  const pdfBytes = await renderAndStore(document, institution);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${document.type}-v${document.version}.pdf"`);
  res.send(Buffer.from(pdfBytes));
});

documentsRouter.post('/:id/revoke', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const document = await prisma.strkDocument.findUnique({ where: { id: req.params.id } });
  if (!document || !isSameInstitution(req.auth!, document.institutionId)) {
    return res.status(404).json({ error: 'Document introuvable' });
  }
  const updated = await prisma.strkDocument.update({
    where: { id: document.id },
    data: { status: 'revoked', revokedAt: new Date() },
  });
  await logAudit({
    institutionId: document.institutionId,
    actorId: req.auth!.sub,
    action: 'document.revoked',
    targetType: 'document',
    targetId: document.id,
    metadata: { type: document.type },
    ipAddress: req.ip,
  });
  res.json({ document: updated });
});

// --- Vérification publique (DOC-004, sans authentification) ---

export const documentsPublicRouter = Router();

documentsPublicRouter.get('/verify/:token', async (req, res) => {
  const document = await prisma.strkDocument.findUnique({
    where: { verificationToken: req.params.token },
    include: { institution: { select: { name: true } } },
  });
  if (!document) {
    return res.status(404).json({ valid: false });
  }
  res.json({
    valid: document.status === 'generated',
    status: document.status,
    type: document.type,
    title: document.title,
    version: document.version,
    institution: document.institution.name,
    generatedAt: document.generatedAt,
    revokedAt: document.revokedAt,
  });
});
