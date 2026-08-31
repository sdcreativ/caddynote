import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { generateTempPassword } from './tempPassword.js';
import { sendAccountInvite } from './accountInvite.js';
import { generateDocument } from '../routes/documents.routes.js';
import type { StrkAdmissionStatus } from '@prisma/client';
import {
  maybeAssignAndInvoiceAfterEnroll,
  resolveCycleCodeFromLabel,
} from './feeSchedules.js';
import { normalizeEmail } from './emailNormalize.js';

/**
 * Chap. 8.1/8.2 : préinscription publique et admission.
 *
 * Le dossier public reste accessible via token (sans auth). Dès la création,
 * un compte parent est créé ou réutilisé pour le contact / les responsables
 * (`ensureParentAccountsForApplication`) afin que le parent retrouve ses
 * dossiers une fois connecté. L'élève n'est matérialisé qu'à `enroll()`.
 */

export const ALLOWED_TRANSITIONS: Record<StrkAdmissionStatus, StrkAdmissionStatus[]> = {
  draft: ['submitted'],
  submitted: ['needs_info', 'conditionally_accepted', 'rejected', 'enrolled', 'cancelled'],
  needs_info: ['submitted', 'cancelled'],
  conditionally_accepted: ['enrolled', 'rejected', 'cancelled'],
  rejected: [],
  enrolled: [],
  cancelled: [],
};

export interface GuardianInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  relationship: 'father' | 'mother' | 'tutor' | 'payer' | 'other_authorized';
}

/**
 * Chap. 8.2 : détection de doublons. Volontairement non bloquante — signale
 * au personnel via `duplicateWarning` plutôt que de rejeter automatiquement
 * (des homonymes ou une fratrie sont des cas légitimes qu'un algorithme ne
 * peut pas trancher seul). Ne vérifie que l'identité de l'élève : un e-mail
 * de responsable déjà connu n'est pas un doublon, c'est le cas normal d'un
 * parent qui inscrit un second enfant (cf. `resolveGuardianAccount`).
 */
export const checkForDuplicateStudent = async (
  institutionId: string,
  student: { firstName: string; lastName: string; birthDate: Date },
  excludeApplicationId?: string
): Promise<string | null> => {
  const existingStudent = await prisma.strkStudent.findFirst({
    where: {
      institutionId,
      profile: {
        firstName: { equals: student.firstName, mode: 'insensitive' },
        lastName: { equals: student.lastName, mode: 'insensitive' },
      },
    },
  });
  if (existingStudent) {
    return `Un élève du même nom existe déjà dans cet établissement (dossier ${existingStudent.id}) — à vérifier avant de poursuivre.`;
  }

  const pendingDuplicate = await prisma.strkAdmissionApplication.findFirst({
    where: {
      institutionId,
      id: excludeApplicationId ? { not: excludeApplicationId } : undefined,
      status: { notIn: ['rejected', 'cancelled'] },
      studentFirstName: { equals: student.firstName, mode: 'insensitive' },
      studentLastName: { equals: student.lastName, mode: 'insensitive' },
      studentBirthDate: student.birthDate,
    },
  });
  if (pendingDuplicate) {
    return `Un autre dossier de préinscription en cours porte la même identité (dossier ${pendingDuplicate.id}) — doublon probable.`;
  }

  return null;
};

/** Réutilise le compte responsable existant (même e-mail) ou en crée un
 * nouveau avec un mot de passe temporaire — un parent qui inscrit un
 * second enfant ne doit jamais se retrouver avec deux comptes. */
export const resolveGuardianAccount = async (
  guardian: GuardianInput,
  institutionId?: string | null
): Promise<{ id: string; created: boolean; tempPassword?: string }> => {
  const email = normalizeEmail(guardian.email);
  const existing = await prisma.strkProfile.findUnique({ where: { email } });
  if (existing) {
    if (institutionId && !existing.institutionId) {
      await prisma.strkProfile.update({
        where: { id: existing.id },
        data: { institutionId },
      });
    }
    return { id: existing.id, created: false };
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const created = await prisma.strkProfile.create({
    data: {
      email,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      phoneNumber: guardian.phone,
      role: 'parent',
      passwordHash,
      institutionId: institutionId ?? null,
      mustChangePassword: true,
    },
  });
  return { id: created.id, created: true, tempPassword };
};

/**
 * Dès la création du dossier : crée/relie le compte parent du contact
 * (et des responsables) + envoie l'invitation si nouveau compte.
 */
export const ensureParentAccountsForApplication = async (
  applicationId: string
): Promise<{ contactProfileId: string | null; invitesSent: number }> => {
  const application = await prisma.strkAdmissionApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { contactProfileId: null, invitesSent: 0 };

  const guardians = (application.guardians as unknown as GuardianInput[]) ?? [];
  let invitesSent = 0;
  let contactProfileId: string | null = application.contactProfileId;

  const contactGuardian: GuardianInput = {
    firstName: guardians[0]?.firstName || application.studentFirstName,
    lastName: guardians[0]?.lastName || application.studentLastName,
    email: application.contactEmail,
    phone: guardians[0]?.phone,
    relationship: guardians[0]?.relationship || 'tutor',
  };

  const contactAccount = await resolveGuardianAccount(contactGuardian, application.institutionId);
  contactProfileId = contactAccount.id;
  if (contactAccount.created && contactAccount.tempPassword) {
    await sendAccountInvite({
      email: contactGuardian.email,
      firstName: contactGuardian.firstName,
      tempPassword: contactAccount.tempPassword,
      phoneNumber: contactGuardian.phone,
      accountKind: 'parent',
    });
    invitesSent += 1;
  }

  for (const guardian of guardians) {
    if (guardian.email.toLowerCase() === application.contactEmail.toLowerCase()) continue;
    const account = await resolveGuardianAccount(guardian, application.institutionId);
    if (account.created && account.tempPassword) {
      await sendAccountInvite({
        email: guardian.email,
        firstName: guardian.firstName,
        tempPassword: account.tempPassword,
        phoneNumber: guardian.phone,
        accountKind: 'parent',
      });
      invitesSent += 1;
    }
  }

  await prisma.strkAdmissionApplication.update({
    where: { id: applicationId },
    data: { contactProfileId },
  });

  return { contactProfileId, invitesSent };
};

export interface EnrollResult {
  studentId: string;
  studentNumber: string;
  guardianAccounts: { email: string; created: boolean; tempPassword?: string }[];
  documentId: string;
  feeAssignmentId?: string | null;
  feeInvoiceId?: string | null;
  feeSkippedReason?: string | null;
}

export type EnrollFeeOptions = {
  generateFeeInvoice?: boolean;
  optionalFeeTypeCodes?: string[];
  cycleCode?: string | null;
  feeScheduleId?: string;
};

/**
 * Finalise un dossier accepté : crée le compte élève (profil + extension
 * `StrkStudent`, matricule généré), résout les comptes responsables
 * (réutilisés ou créés), établit les liens `StrkStudentGuardian`, et émet
 * le certificat de scolarité (DOC-001) — le dossier passe alors à
 * `enrolled`, terminal. N'écrit rien tant que le dossier n'est pas dans un
 * état autorisant l'inscription (vérifié par l'appelant via
 * `ALLOWED_TRANSITIONS`).
 *
 * Tranche A : si une grille publiée existe pour l’année, crée une affectation
 * et (par défaut) une facture — sans faire échouer l’enroll si aucune grille.
 */
export const enrollApplication = async (
  applicationId: string,
  performedBy: string,
  feeOptions?: EnrollFeeOptions
): Promise<EnrollResult> => {
  const application = await prisma.strkAdmissionApplication.findUniqueOrThrow({ where: { id: applicationId } });

  const studentNumber = `${application.academicYear.replace(/[^0-9]/g, '').slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const studentProfile = await prisma.strkProfile.create({
    data: {
      firstName: application.studentFirstName,
      lastName: application.studentLastName,
      role: 'student',
      institutionId: application.institutionId,
    },
  });
  await prisma.strkStudent.create({
    data: {
      id: studentProfile.id,
      institutionId: application.institutionId,
      classId: application.classId,
      studentNumber,
      gender: application.studentGender,
      enrollmentDate: new Date(),
    },
  });

  const guardians = (application.guardians as unknown as GuardianInput[]) ?? [];
  const guardianAccounts: EnrollResult['guardianAccounts'] = [];
  for (const guardian of guardians) {
    const account = await resolveGuardianAccount(guardian, application.institutionId);
    await prisma.strkStudentGuardian.upsert({
      where: { studentId_guardianId: { studentId: studentProfile.id, guardianId: account.id } },
      create: {
        institutionId: application.institutionId,
        studentId: studentProfile.id,
        guardianId: account.id,
        relationship: guardian.relationship,
        createdBy: performedBy,
      },
      update: {},
    });
    guardianAccounts.push({ email: guardian.email, created: account.created, tempPassword: account.tempPassword });
  }

  let className: string | null = null;
  let gradeLevelId: string | null = null;
  let cycleFromGrade: string | null = null;
  if (application.classId) {
    const klass = await prisma.strkClass.findUnique({
      where: { id: application.classId },
      select: {
        name: true,
        gradeLevelId: true,
        gradeLevel: { select: { cycle: { select: { code: true } } } },
      },
    });
    className = klass?.name ?? null;
    gradeLevelId = klass?.gradeLevelId ?? null;
    cycleFromGrade = klass?.gradeLevel?.cycle?.code ?? null;
  }
  const document = await generateDocument({
    institutionId: application.institutionId,
    type: 'enrollment_certificate',
    subjectId: studentProfile.id,
    generatedBy: performedBy,
    dataSnapshot: {
      studentName: `${application.studentFirstName} ${application.studentLastName}`,
      studentNumber,
      className,
      academicYear: application.academicYear,
    },
  });

  await prisma.strkAdmissionApplication.update({
    where: { id: applicationId },
    data: { status: 'enrolled', enrolledStudentId: studentProfile.id },
  });

  const cycleCode =
    feeOptions?.cycleCode ??
    cycleFromGrade ??
    resolveCycleCodeFromLabel(application.level);

  let feeAssignmentId: string | null = null;
  let feeInvoiceId: string | null = null;
  let feeSkippedReason: string | null = null;
  try {
    const fee = await maybeAssignAndInvoiceAfterEnroll({
      institutionId: application.institutionId,
      studentId: studentProfile.id,
      academicYear: application.academicYear,
      createdBy: performedBy,
      cycleCode,
      gradeLevelId,
      feeScheduleId: feeOptions?.feeScheduleId,
      optionalFeeTypeCodes: feeOptions?.optionalFeeTypeCodes ?? [],
      generateFeeInvoice: feeOptions?.generateFeeInvoice,
    });
    feeAssignmentId = fee.assignmentId;
    feeInvoiceId = fee.invoiceId;
    feeSkippedReason = fee.skippedReason;
  } catch {
    // L’inscription reste valide même si la facturation grille échoue.
    feeSkippedReason = 'fee_bridge_error';
  }

  return {
    studentId: studentProfile.id,
    studentNumber,
    guardianAccounts,
    documentId: document.id,
    feeAssignmentId,
    feeInvoiceId,
    feeSkippedReason,
  };
};
