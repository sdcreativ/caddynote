import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireFeature } from '../middleware/requireFeature.js';
import { isSameInstitution, SECRETARIAT_ROLES } from '../lib/authz.js';
import {
  ALLOWED_TRANSITIONS,
  checkForDuplicateStudent,
  enrollApplication,
  ensureParentAccountsForApplication,
} from '../lib/admissions.js';
import { isS3Configured, buildObjectKey, createPresignedUploadPost } from '../lib/s3.js';
import { getFileStorageMode, isFileStorageAvailable, getStoredObjectBytes, deleteStoredObject, putStoredObject } from '../lib/fileStorage.js';
import { isAntivirusConfigured, scanBuffer } from '../lib/antivirus.js';
import { logAudit } from '../lib/audit.js';
import { isCinetPayConfigured, initiatePayment } from '../lib/cinetpay.js';
import { isStripeConfigured, getStripeClient } from '../lib/stripeClient.js';
import { isTestMode } from '../lib/testMode.js';
import {
  sendAdmissionFollowEmail,
  notifyAdmissionContact,
  pickGuardianPhone,
} from '../lib/admissionFollowUp.js';
import {
  ensureApplicationPacketItems,
  reuseValidDocumentsFromPrevious,
} from '../lib/admissionPackets.js';
import { parseStudentGender } from '../lib/studentGender.js';
import { getAdmissionInstitutionPolicy } from '../lib/admissionSettings.js';
import { generateDocument } from './documents.routes.js';
import {
  registerAdmissionPacketPublicRoutes,
  registerAdmissionPacketStaffRoutes,
} from './admissionPackets.routes.js';
import type { StrkAdmissionStatus } from '@prisma/client';

/**
 * Chap. 8.1/8.2 : préinscription publique et admission.
 *
 * `admissionsPublicRouter` (sans authentification, mais limité en débit) —
 * un candidat n'a par définition pas encore de compte à ce stade. Le dossier
 * reste purement déclaratif (JSON) jusqu'à `POST /admissions/:id/enroll`
 * (`admissionsRouter`, réservé à la direction), qui crée alors les vrais
 * comptes élève/responsables — cf. `lib/admissions.ts`.
 *
 * Frais de dossier : confirmation manuelle (personnel) OU paiement en ligne
 * CinetPay/Stripe via le token public (`POST …/pay/cinetpay|stripe`), confirmé
 * uniquement par webhook serveur (mêmes principes FIN-005).
 */

/**
 * Création de dossier (POST /) — plafond bas anti-spam.
 * Les uploads / PATCH / submit d’une même session consomment `wizardLimiter`
 * (sinon 10 pièces + retries épuisent vite 20/h et bloquent l’UX).
 */
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test' || isTestMode(),
});

/** Parcours wizard public (pièces, patch, soumission, paiement initiate). */
const wizardLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test' || isTestMode(),
});

/** @deprecated alias — anciens imports / greps ; préférer wizardLimiter */
const submitLimiter = wizardLimiter;

/** Récupération du lien par e-mail — plus strict pour limiter l’énumération. */
const recoverLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard.' },
  skip: () => process.env.NODE_ENV === 'test' || isTestMode(),
});

const PUBLIC_APPLICATION_SELECT = {
  id: true,
  institutionId: true,
  classId: true,
  academicYear: true,
  applicationKind: true,
  level: true,
  campus: true,
  campusId: true,
  profileFlags: true,
  packetTemplateId: true,
  previousApplicationId: true,
  confirmationDocumentId: true,
  instructionStatus: true,
  contactProfileId: true,
  status: true,
  studentFirstName: true,
  studentLastName: true,
  studentBirthDate: true,
  studentGender: true,
  guardians: true,
  documents: true,
  applicationFeeCents: true,
  applicationFeeCurrency: true,
  applicationFeePaid: true,
  decisionNotes: true,
  submittedAt: true,
  contactEmail: true,
  publicToken: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const admissionsPublicRouter = Router();

admissionsPublicRouter.get('/institutions', async (_req, res) => {
  const institutions = await prisma.strkInstitution.findMany({
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });
  res.json({ institutions });
});

admissionsPublicRouter.get('/institutions/:id/classes', async (req, res) => {
  const classes = await prisma.strkClass.findMany({
    where: { institutionId: req.params.id, isActive: true },
    select: { id: true, name: true, academicYear: true },
    orderBy: { name: 'asc' },
  });
  res.json({ classes });
});

const guardianInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  relationship: z.enum(['father', 'mother', 'tutor', 'payer', 'other_authorized']),
});

const applicationInputSchema = z.object({
  institutionId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  academicYear: z.string().min(1),
  applicationKind: z
    .enum(['pre_registration', 'first_enrollment', 're_enrollment', 'transfer'])
    .optional()
    .default('pre_registration'),
  level: z.string().max(80).optional(),
  campus: z.string().max(80).optional(),
  campusId: z.string().uuid().optional(),
  profileFlags: z.array(z.string().max(64)).max(20).optional(),
  previousApplicationId: z.string().uuid().optional(),
  studentFirstName: z.string().min(1),
  studentLastName: z.string().min(1),
  studentBirthDate: z.string(),
  studentGender: z.preprocess(
    (v) => (typeof v === 'string' ? parseStudentGender(v) ?? v : v),
    z.enum(['female', 'male'], { errorMap: () => ({ message: 'Genre invalide (fille ou garçon)' }) })
  ),
  guardians: z.array(guardianInputSchema).min(1),
  contactEmail: z.string().email(),
});

admissionsPublicRouter.post('/', createLimiter, async (req, res) => {
  const parsed = applicationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const institution = await prisma.strkInstitution.findUnique({ where: { id: parsed.data.institutionId } });
  if (!institution) {
    return res.status(400).json({ error: 'Établissement invalide' });
  }
  if (parsed.data.classId) {
    const klass = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId }, select: { institutionId: true } });
    if (!klass || klass.institutionId !== parsed.data.institutionId) {
      return res.status(400).json({ error: 'Classe invalide pour cet établissement' });
    }
  }
  if (parsed.data.previousApplicationId) {
    const prev = await prisma.strkAdmissionApplication.findUnique({
      where: { id: parsed.data.previousApplicationId },
      select: { institutionId: true },
    });
    if (!prev || prev.institutionId !== parsed.data.institutionId) {
      return res.status(400).json({ error: 'Dossier antérieur invalide' });
    }
  }
  let campusId = parsed.data.campusId;
  let campusLabel = parsed.data.campus;
  if (campusId) {
    const campus = await prisma.strkCampus.findFirst({
      where: { id: campusId, institutionId: parsed.data.institutionId, isActive: true },
    });
    if (!campus) return res.status(400).json({ error: 'Campus invalide' });
    campusLabel = campus.name;
  } else if (parsed.data.campus?.trim()) {
    // Auto-création / réutilisation d'un campus depuis le libellé libre
    const code = parsed.data.campus
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) || 'campus';
    const existing = await prisma.strkCampus.findUnique({
      where: {
        institutionId_code: { institutionId: parsed.data.institutionId, code },
      },
    });
    if (existing) {
      campusId = existing.id;
      campusLabel = existing.name;
    } else {
      const createdCampus = await prisma.strkCampus.create({
        data: {
          institutionId: parsed.data.institutionId,
          code,
          name: parsed.data.campus.trim(),
        },
      });
      campusId = createdCampus.id;
      campusLabel = createdCampus.name;
    }
  }
  const birthDate = new Date(parsed.data.studentBirthDate);
  const duplicateWarning = await checkForDuplicateStudent(parsed.data.institutionId, {
    firstName: parsed.data.studentFirstName,
    lastName: parsed.data.studentLastName,
    birthDate,
  });

  const policy = await getAdmissionInstitutionPolicy(parsed.data.institutionId);
  const envDefaultFee = Number(process.env.ADMISSION_DEFAULT_FEE_CENTS || 0);
  const feeCents =
    (policy.payment.defaultApplicationFeeCents && policy.payment.defaultApplicationFeeCents > 0
      ? policy.payment.defaultApplicationFeeCents
      : envDefaultFee) || 0;
  const feeCurrency =
    policy.payment.defaultApplicationFeeCurrency ||
    process.env.ADMISSION_DEFAULT_FEE_CURRENCY ||
    'XOF';

  const application = await prisma.strkAdmissionApplication.create({
    data: {
      institutionId: parsed.data.institutionId,
      classId: parsed.data.classId,
      academicYear: parsed.data.academicYear,
      applicationKind: parsed.data.applicationKind,
      level: parsed.data.level,
      campus: campusLabel,
      campusId,
      profileFlags: parsed.data.profileFlags ?? [],
      previousApplicationId: parsed.data.previousApplicationId,
      studentFirstName: parsed.data.studentFirstName,
      studentLastName: parsed.data.studentLastName,
      studentBirthDate: birthDate,
      studentGender: parsed.data.studentGender,
      guardians: parsed.data.guardians,
      contactEmail: parsed.data.contactEmail,
      duplicateWarning,
      publicToken: crypto.randomBytes(24).toString('hex'),
      ...(feeCents > 0
        ? { applicationFeeCents: feeCents, applicationFeeCurrency: feeCurrency }
        : {}),
    },
    select: PUBLIC_APPLICATION_SELECT,
  });

  // Matérialise le modèle de pièces applicable (catalogue / template).
  await ensureApplicationPacketItems(application.id).catch((err) => {
    console.error('ensureApplicationPacketItems:', err);
  });
  if (parsed.data.previousApplicationId || parsed.data.applicationKind === 're_enrollment') {
    await reuseValidDocumentsFromPrevious(application.id).catch((err) => {
      console.error('reuseValidDocumentsFromPrevious:', err);
    });
  }

  const parentProvision = await ensureParentAccountsForApplication(application.id).catch((err) => {
    console.error('ensureParentAccountsForApplication:', err);
    return { contactProfileId: null, invitesSent: 0 };
  });

  const followEmailSent = await sendAdmissionFollowEmail({
    to: application.contactEmail,
    studentFirstName: application.studentFirstName,
    studentLastName: application.studentLastName,
    publicToken: application.publicToken,
    kind: 'created',
  });

  res.status(201).json({
    application: { ...application, contactProfileId: parentProvision.contactProfileId },
    fileStorageAvailable: isFileStorageAvailable(),
    storageMode: getFileStorageMode(),
    followEmailSent,
    parentAccountLinked: !!parentProvision.contactProfileId,
    parentInviteSent: parentProvision.invitesSent > 0,
  });
});

const recoverSchema = z.object({
  email: z.string().email().max(320),
});

/**
 * Renvoie le(s) lien(s) de suivi à l’adresse contact — sans révéler si l’e-mail
 * existe (réponse uniforme). Le token n’est jamais renvoyé dans le JSON.
 */
admissionsPublicRouter.post('/recover', recoverLimiter, async (req, res) => {
  const parsed = recoverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'E-mail invalide' });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const applications = await prisma.strkAdmissionApplication.findMany({
    where: { contactEmail: { equals: email, mode: 'insensitive' } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: {
      publicToken: true,
      studentFirstName: true,
      studentLastName: true,
      contactEmail: true,
    },
  });

  let sent = 0;
  for (const app of applications) {
    const ok = await sendAdmissionFollowEmail({
      to: app.contactEmail,
      studentFirstName: app.studentFirstName,
      studentLastName: app.studentLastName,
      publicToken: app.publicToken,
      kind: 'recover',
    });
    if (ok) sent += 1;
  }

  res.json({
    ok: true,
    message:
      'Si un dossier est associé à cette adresse, un e-mail avec le lien de suivi vient d’être envoyé.',
    emailDeliveryAttempted: applications.length > 0,
    emailsSent: sent,
  });
});

const loadByToken = (token: string) => prisma.strkAdmissionApplication.findUnique({ where: { publicToken: token } });

admissionsPublicRouter.get('/status/:token', async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  const { duplicateWarning, decidedBy, applicationFeeConfirmedBy, previousApplicationId, enrolledStudentId, ...safe } =
    application;
  res.json({
    application: safe,
    fileStorageAvailable: isFileStorageAvailable(),
    storageMode: getFileStorageMode(),
  });
});

const editableApplicationSchema = applicationInputSchema.omit({ institutionId: true }).partial();

admissionsPublicRouter.patch('/status/:token', submitLimiter, async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!['draft', 'needs_info'].includes(application.status)) {
    return res.status(409).json({ error: 'Ce dossier ne peut plus être modifié directement' });
  }
  const parsed = editableApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides', details: parsed.error.flatten() });
  }
  const { studentBirthDate, ...rest } = parsed.data;
  const updated = await prisma.strkAdmissionApplication.update({
    where: { id: application.id },
    data: { ...rest, ...(studentBirthDate ? { studentBirthDate: new Date(studentBirthDate) } : {}) },
    select: PUBLIC_APPLICATION_SELECT,
  });
  res.json({ application: updated });
});

admissionsPublicRouter.post('/status/:token/submit', submitLimiter, async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!ALLOWED_TRANSITIONS[application.status].includes('submitted')) {
    return res.status(409).json({ error: `Transition invalide : ${application.status} → submitted` });
  }

  const packet = await ensureApplicationPacketItems(application.id);
  if (!packet.completeness.canSubmit) {
    return res.status(422).json({
      error: 'Dossier incomplet : pièces obligatoires manquantes',
      code: 'packet_incomplete',
      completeness: packet.completeness,
    });
  }

  const policy = await getAdmissionInstitutionPolicy(application.institutionId);
  if (
    policy.payment.requirePaidBeforeSubmit &&
    application.applicationFeeCents != null &&
    application.applicationFeeCents > 0 &&
    !application.applicationFeePaid
  ) {
    return res.status(422).json({
      error: 'Paiement des frais de dossier requis avant soumission',
      code: 'payment_required',
    });
  }

  const duplicateWarning = await checkForDuplicateStudent(
    application.institutionId,
    { firstName: application.studentFirstName, lastName: application.studentLastName, birthDate: application.studentBirthDate },
    application.id
  );
  const updated = await prisma.strkAdmissionApplication.update({
    where: { id: application.id },
    data: { status: 'submitted', submittedAt: new Date(), duplicateWarning },
    select: PUBLIC_APPLICATION_SELECT,
  });

  // Marquer les pièces téléversées comme en vérification
  await prisma.strkAdmissionDocumentItem.updateMany({
    where: { applicationId: application.id, status: { in: ['uploaded', 'original_pending'] } },
    data: { status: 'in_review' },
  });

  const followEmailSent = await sendAdmissionFollowEmail({
    to: updated.contactEmail,
    studentFirstName: updated.studentFirstName,
    studentLastName: updated.studentLastName,
    publicToken: updated.publicToken,
    kind: 'submitted',
  });

  res.json({ application: updated, followEmailSent, completeness: packet.completeness });
});

const ADMISSION_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const ADMISSION_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const presignSchema = z.object({ filename: z.string().min(1).max(255), contentType: z.string().min(1) });

/** Prépare l’upload : S3 (POST signé) ou local (PUT binaire vers direct-upload). */
admissionsPublicRouter.post('/status/:token/documents/presign-upload', submitLimiter, async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (!ADMISSION_DOCUMENT_TYPES.includes(parsed.data.contentType as (typeof ADMISSION_DOCUMENT_TYPES)[number])) {
    return res.status(400).json({ error: `Type de fichier non autorisé (autorisés : ${ADMISSION_DOCUMENT_TYPES.join(', ')})` });
  }
  const scope = `inst-${application.institutionId}-app-${application.id}`;
  const key = buildObjectKey('admissions', scope, parsed.data.filename);

  if (isS3Configured()) {
    const { url, fields } = await createPresignedUploadPost(key, parsed.data.contentType, ADMISSION_DOCUMENT_MAX_BYTES);
    return res.json({
      mode: 's3' as const,
      key,
      url,
      fields,
      maxSizeBytes: ADMISSION_DOCUMENT_MAX_BYTES,
      expiresIn: 300,
    });
  }

  res.json({
    mode: 'local' as const,
    key,
    maxSizeBytes: ADMISSION_DOCUMENT_MAX_BYTES,
    uploadPath: `/admissions/status/${req.params.token}/documents/direct-upload`,
  });
});

/**
 * Upload binaire local (repli sans S3). Le corps n’est pas du JSON — express.json
 * laisse passer le flux pour les Content-Type hors application/json.
 */
admissionsPublicRouter.put('/status/:token/documents/direct-upload', submitLimiter, async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (isS3Configured()) {
    return res.status(400).json({ error: 'Utilisez l’upload S3 signé sur cette instance.' });
  }

  const keyHeader = typeof req.headers['x-object-key'] === 'string' ? req.headers['x-object-key'] : '';
  const expectedPrefix = `admissions/inst-${application.institutionId}-app-${application.id}/`;
  if (!keyHeader.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: 'Clé de fichier invalide pour ce dossier' });
  }

  const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ADMISSION_DOCUMENT_TYPES.includes(contentType as (typeof ADMISSION_DOCUMENT_TYPES)[number])) {
    return res.status(400).json({ error: `Type de fichier non autorisé (autorisés : ${ADMISSION_DOCUMENT_TYPES.join(', ')})` });
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > ADMISSION_DOCUMENT_MAX_BYTES) {
      return res.status(413).json({ error: 'Fichier trop volumineux (max 15 Mo)' });
    }
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);
  if (body.length === 0) {
    return res.status(400).json({ error: 'Fichier vide' });
  }

  await putStoredObject(keyHeader, body, contentType);
  res.status(201).json({ key: keyHeader, bytes: body.length, mode: 'local' });
});

const attachDocumentSchema = z.object({ label: z.string().min(1), fileKey: z.string().min(1) });

admissionsPublicRouter.post('/status/:token/documents', submitLimiter, async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  const parsed = attachDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const expectedPrefix = `admissions/inst-${application.institutionId}-app-${application.id}/`;
  if (!parsed.data.fileKey.startsWith(expectedPrefix)) {
    return res.status(403).json({ error: 'Ce fichier ne provient pas de ce dossier' });
  }
  // DOC-005 : scan antivirus au rattachement (S3 ou local).
  if (isAntivirusConfigured()) {
    const bytes = await getStoredObjectBytes(parsed.data.fileKey);
    const scan = await scanBuffer(bytes).catch((error) => {
      console.error('Échec du scan antivirus (clamd) :', error);
      return { scanned: false, clean: true } as const;
    });
    if (scan.scanned && !scan.clean) {
      await deleteStoredObject(parsed.data.fileKey).catch(() => {});
      await logAudit({
        institutionId: application.institutionId,
        actorId: null,
        action: 'admission.document_rejected_malware',
        targetType: 'admission_application',
        targetId: application.id,
        metadata: { fileKey: parsed.data.fileKey, threatName: scan.threatName },
      });
      return res.status(422).json({ error: 'Fichier refusé par l’antivirus', code: 'malware_detected' });
    }
  }
  const documents = [...((application.documents as { label: string; fileKey: string }[]) ?? []), parsed.data];
  const updated = await prisma.strkAdmissionApplication.update({
    where: { id: application.id },
    data: { documents },
    select: PUBLIC_APPLICATION_SELECT,
  });
  res.json({ application: updated });
});

/** Marque les frais de dossier comme payés après confirmation provider (webhook). */
export const markAdmissionFeePaidByProviderRef = async (
  providerRef: string,
  provider: 'cinetpay' | 'stripe'
): Promise<boolean> => {
  const application = await prisma.strkAdmissionApplication.findFirst({
    where: { applicationFeeProviderRef: providerRef },
  });
  if (!application || application.applicationFeePaid) return false;
  await prisma.strkAdmissionApplication.update({
    where: { id: application.id },
    data: {
      applicationFeePaid: true,
      applicationFeeProvider: provider,
      applicationFeeConfirmedAt: new Date(),
    },
  });
  await logAudit({
    institutionId: application.institutionId,
    actorId: null,
    action: 'admission.fee_paid_online',
    targetType: 'admission_application',
    targetId: application.id,
    metadata: { provider, providerRef, amountCents: application.applicationFeeCents },
  });
  return true;
};

admissionsPublicRouter.post('/status/:token/pay/cinetpay', submitLimiter, async (req, res) => {
  if (!isCinetPayConfigured()) {
    return res.status(501).json({
      error: "Le paiement Mobile Money (CinetPay) n'est pas encore configuré sur cette instance.",
    });
  }
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (application.applicationFeePaid) {
    return res.status(400).json({ error: 'Les frais de dossier sont déjà réglés' });
  }
  if (application.applicationFeeCents == null || application.applicationFeeCents <= 0) {
    return res.status(400).json({ error: 'Aucun frais de dossier n’a été fixé pour ce dossier' });
  }
  const transactionId = crypto.randomUUID();
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const apiUrl = process.env.API_URL || 'http://localhost:4000';
  try {
    const { paymentUrl } = await initiatePayment({
      transactionId,
      amountCents: application.applicationFeeCents,
      currency: application.applicationFeeCurrency || 'XOF',
      description: `Frais de dossier — ${application.studentFirstName} ${application.studentLastName}`,
      customerName: application.studentLastName,
      customerSurname: application.studentFirstName,
      customerEmail: application.contactEmail,
      customerPhoneNumber: '',
      notifyUrl: `${apiUrl}/finance/webhooks/cinetpay`,
      returnUrl: `${appUrl}/admissions/suivi/${application.publicToken}?payment=success&provider=cinetpay`,
    });
    await prisma.strkAdmissionApplication.update({
      where: { id: application.id },
      data: {
        applicationFeeProvider: 'cinetpay',
        applicationFeeProviderRef: transactionId,
      },
    });
    res.json({ paymentUrl, transactionId });
  } catch (error) {
    console.error('CinetPay admission fee initiate error:', error);
    res.status(502).json({ error: "Échec de l'initialisation du paiement Mobile Money" });
  }
});

admissionsPublicRouter.post('/status/:token/pay/stripe', submitLimiter, async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(501).json({
      error: "Le paiement par carte (Stripe) n'est pas encore configuré sur cette instance.",
    });
  }
  const application = await loadByToken(req.params.token);
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (application.applicationFeePaid) {
    return res.status(400).json({ error: 'Les frais de dossier sont déjà réglés' });
  }
  if (application.applicationFeeCents == null || application.applicationFeeCents <= 0) {
    return res.status(400).json({ error: 'Aucun frais de dossier n’a été fixé pour ce dossier' });
  }
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: (application.applicationFeeCurrency || 'XOF').toLowerCase(),
          product_data: {
            name: `Frais de dossier — ${application.studentFirstName} ${application.studentLastName}`,
          },
          unit_amount: application.applicationFeeCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/admissions/suivi/${application.publicToken}?payment=success`,
    cancel_url: `${appUrl}/admissions/suivi/${application.publicToken}?payment=cancelled`,
    metadata: {
      kind: 'admission_fee',
      applicationId: application.id,
    },
  });
  await prisma.strkAdmissionApplication.update({
    where: { id: application.id },
    data: {
      applicationFeeProvider: 'stripe',
      applicationFeeProviderRef: session.id,
    },
  });
  res.json({ url: session.url, sessionId: session.id });
});

registerAdmissionPacketPublicRoutes(admissionsPublicRouter, submitLimiter);

/** Téléchargement / consultation de la confirmation PDF (token public). */
admissionsPublicRouter.get('/status/:token/confirmation', async (req, res) => {
  const application = await loadByToken(req.params.token);
  if (!application) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!application.confirmationDocumentId) {
    return res.status(404).json({ error: 'Confirmation non encore disponible' });
  }
  const document = await prisma.strkDocument.findUnique({
    where: { id: application.confirmationDocumentId },
  });
  if (!document || document.status === 'revoked') {
    return res.status(404).json({ error: 'Document introuvable' });
  }
  const appBase = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:8080').replace(
    /\/$/,
    ''
  );
  res.json({
    documentId: document.id,
    verificationToken: document.verificationToken,
    verificationUrl: `${appBase}/verify/document/${document.verificationToken}`,
    title: document.title,
  });
});

// --- Gestion côté personnel (direction uniquement) ---

export const admissionsRouter = Router();
admissionsRouter.use(requireAuth);
admissionsRouter.use(requireFeature('admissions'));

registerAdmissionPacketStaffRoutes(admissionsRouter);

/** Dossiers liés au compte parent connecté (profil ou e-mail contact). */
admissionsRouter.get('/mine', requireRole('parent'), async (req, res) => {
  const profile = await prisma.strkProfile.findUnique({
    where: { id: req.auth!.sub },
    select: { id: true, email: true },
  });
  if (!profile) return res.json({ applications: [] });
  const applications = await prisma.strkAdmissionApplication.findMany({
    where: {
      OR: [
        { contactProfileId: profile.id },
        ...(profile.email
          ? [{ contactEmail: { equals: profile.email, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: PUBLIC_APPLICATION_SELECT,
  });
  res.json({ applications });
});

admissionsRouter.get('/', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const institutionId = typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined;
  if (!institutionId || !isSameInstitution(req.auth!, institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const status = typeof req.query.status === 'string' ? (req.query.status as StrkAdmissionStatus) : undefined;
  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined;
  const level = typeof req.query.level === 'string' ? req.query.level : undefined;
  const applicationKind =
    typeof req.query.applicationKind === 'string' ? req.query.applicationKind : undefined;
  const submittedFrom =
    typeof req.query.submittedFrom === 'string' ? new Date(req.query.submittedFrom) : undefined;
  const submittedTo =
    typeof req.query.submittedTo === 'string' ? new Date(req.query.submittedTo) : undefined;

  const applications = await prisma.strkAdmissionApplication.findMany({
    where: {
      institutionId,
      ...(status ? { status } : {}),
      ...(academicYear ? { academicYear } : {}),
      ...(level ? { level } : {}),
      ...(applicationKind ? { applicationKind: applicationKind as never } : {}),
      ...(submittedFrom || submittedTo
        ? {
            submittedAt: {
              ...(submittedFrom && !Number.isNaN(submittedFrom.getTime()) ? { gte: submittedFrom } : {}),
              ...(submittedTo && !Number.isNaN(submittedTo.getTime()) ? { lte: submittedTo } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ applications });
});

admissionsRouter.get('/:id', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, application.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  res.json({ application });
});

const staffStatusSchema = z.object({
  status: z.enum(['needs_info', 'conditionally_accepted', 'rejected', 'cancelled']),
  decisionNotes: z.string().optional(),
});

admissionsRouter.patch('/:id/status', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, application.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = staffStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (!ALLOWED_TRANSITIONS[application.status].includes(parsed.data.status)) {
    return res.status(409).json({
      error: `Transition invalide : ${application.status} → ${parsed.data.status}`,
      allowed: ALLOWED_TRANSITIONS[application.status],
    });
  }
  const updated = await prisma.strkAdmissionApplication.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      decisionNotes: parsed.data.decisionNotes,
      decidedBy: req.auth!.sub,
      decidedAt: new Date(),
    },
  });
  await logAudit({
    institutionId: application.institutionId,
    actorId: req.auth!.sub,
    action: 'admission.status_changed',
    targetType: 'admission_application',
    targetId: application.id,
    metadata: { from: application.status, to: parsed.data.status },
    ipAddress: req.ip,
  });

  let confirmationDocumentId = application.confirmationDocumentId;
  if (parsed.data.status === 'conditionally_accepted' && !confirmationDocumentId) {
    try {
      const doc = await generateDocument({
        institutionId: application.institutionId,
        type: 'admission_confirmation',
        subjectId: application.id,
        generatedBy: req.auth!.sub,
        dataSnapshot: {
          studentName: `${application.studentFirstName} ${application.studentLastName}`,
          academicYear: application.academicYear,
          applicationKind: application.applicationKind,
          status: parsed.data.status,
          decisionNotes: parsed.data.decisionNotes ?? null,
        },
      });
      confirmationDocumentId = doc.id;
      await prisma.strkAdmissionApplication.update({
        where: { id: application.id },
        data: { confirmationDocumentId: doc.id },
      });
    } catch (err) {
      console.error('admission_confirmation PDF:', err);
    }
  }

  const noticeKind =
    parsed.data.status === 'needs_info'
      ? 'needs_info'
      : parsed.data.status === 'conditionally_accepted'
        ? 'accepted'
        : parsed.data.status === 'rejected'
          ? 'rejected'
          : null;
  if (noticeKind) {
    const policy = await getAdmissionInstitutionPolicy(application.institutionId);
    await notifyAdmissionContact({
      to: application.contactEmail,
      studentFirstName: application.studentFirstName,
      studentLastName: application.studentLastName,
      publicToken: application.publicToken,
      kind: noticeKind,
      detail: parsed.data.decisionNotes,
      phone: pickGuardianPhone(application.guardians),
      channelOverride: policy.channels,
    }).catch(() => undefined);
  }

  res.json({
    application: { ...updated, confirmationDocumentId },
    confirmationDocumentId,
  });
});

const feeSchema = z.object({ applicationFeeCents: z.number().int().nonnegative(), applicationFeeCurrency: z.string().default('XOF') });

admissionsRouter.post('/:id/fee', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, application.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = feeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const updated = await prisma.strkAdmissionApplication.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ application: updated });
});

// Confirmation manuelle du règlement des frais de dossier — même principe
// que FIN-003 virement/espèces : jamais une auto-déclaration du candidat.
admissionsRouter.post('/:id/confirm-fee', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, application.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const updated = await prisma.strkAdmissionApplication.update({
    where: { id: req.params.id },
    data: { applicationFeePaid: true, applicationFeeConfirmedBy: req.auth!.sub, applicationFeeConfirmedAt: new Date() },
  });
  await logAudit({
    institutionId: application.institutionId,
    actorId: req.auth!.sub,
    action: 'admission.fee_confirmed',
    targetType: 'admission_application',
    targetId: application.id,
    metadata: { amountCents: application.applicationFeeCents },
    ipAddress: req.ip,
  });
  res.json({ application: updated });
});

admissionsRouter.post('/:id/enroll', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const application = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!application) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, application.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  if (!ALLOWED_TRANSITIONS[application.status].includes('enrolled')) {
    return res.status(409).json({ error: `Transition invalide : ${application.status} → enrolled` });
  }
  const policy = await getAdmissionInstitutionPolicy(application.institutionId);
  if (
    policy.payment.requirePaidBeforeEnroll &&
    application.applicationFeeCents != null &&
    application.applicationFeeCents > 0 &&
    !application.applicationFeePaid
  ) {
    return res.status(422).json({
      error: 'Paiement des frais requis avant inscription définitive',
      code: 'payment_required',
    });
  }
  const result = await enrollApplication(application.id, req.auth!.sub);
  await logAudit({
    institutionId: application.institutionId,
    actorId: req.auth!.sub,
    action: 'admission.enrolled',
    targetType: 'admission_application',
    targetId: application.id,
    metadata: { studentId: result.studentId, studentNumber: result.studentNumber },
    ipAddress: req.ip,
  });
  await notifyAdmissionContact({
    to: application.contactEmail,
    studentFirstName: application.studentFirstName,
    studentLastName: application.studentLastName,
    publicToken: application.publicToken,
    kind: 'enrolled',
    detail: result.studentNumber ?? undefined,
    phone: pickGuardianPhone(application.guardians),
  }).catch(() => undefined);
  res.status(201).json(result);
});

const reenrollSchema = z.object({ academicYear: z.string().min(1), classId: z.string().uuid().optional() });

// Réinscription (chap. 8.2) : nouveau dossier brouillon pré-rempli à partir
// d'un dossier antérieur, plutôt que de ressaisir élève/responsables.
admissionsRouter.post('/:id/reenroll', requireRole(...SECRETARIAT_ROLES), async (req, res) => {
  const previous = await prisma.strkAdmissionApplication.findUnique({ where: { id: req.params.id } });
  if (!previous) {
    return res.status(404).json({ error: 'Dossier introuvable' });
  }
  if (!isSameInstitution(req.auth!, previous.institutionId)) {
    return res.status(403).json({ error: 'Permissions insuffisantes' });
  }
  const parsed = reenrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Données invalides' });
  }
  if (parsed.data.classId) {
    const klass = await prisma.strkClass.findUnique({ where: { id: parsed.data.classId }, select: { institutionId: true } });
    if (!klass || klass.institutionId !== previous.institutionId) {
      return res.status(400).json({ error: 'Classe invalide pour cet établissement' });
    }
  }
  const application = await prisma.strkAdmissionApplication.create({
    data: {
      institutionId: previous.institutionId,
      classId: parsed.data.classId,
      academicYear: parsed.data.academicYear,
      applicationKind: 're_enrollment',
      level: previous.level,
      profileFlags: previous.profileFlags,
      studentFirstName: previous.studentFirstName,
      studentLastName: previous.studentLastName,
      studentBirthDate: previous.studentBirthDate,
      studentGender: previous.studentGender,
      guardians: previous.guardians as any,
      contactEmail: previous.contactEmail,
      previousApplicationId: previous.id,
      publicToken: crypto.randomBytes(24).toString('hex'),
    },
  });
  await ensureApplicationPacketItems(application.id).catch(() => undefined);
  const reuse = await reuseValidDocumentsFromPrevious(application.id).catch(() => ({ reused: 0 }));
  await logAudit({
    institutionId: previous.institutionId,
    actorId: req.auth!.sub,
    action: 'admission.reenrolled',
    targetType: 'admission_application',
    targetId: application.id,
    metadata: { previousApplicationId: previous.id, reused: reuse.reused },
    ipAddress: req.ip,
  });
  res.status(201).json({ application, reusedDocuments: reuse.reused });
});
