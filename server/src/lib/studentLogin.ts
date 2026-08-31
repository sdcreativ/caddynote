import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { generateTempPassword } from './tempPassword.js';
import { sendAccountInvite } from './accountInvite.js';
import { logAudit } from './audit.js';
import { PUBLIC_PROFILE_SELECT } from './profileSelect.js';
import { normalizeEmail, normalizeOptionalEmail } from './emailNormalize.js';

/**
 * Identifiant de connexion opaque pour un élève sans e-mail famille.
 * Pas de prénom/nom dans le local-part (anti-énumération / RGPD).
 * Domaine plateforme : les mails d’invite peuvent rebondir — le MDP
 * provisoire est toujours renvoyé au personnel pour remise (feuillet / parent).
 */
export const OPAQUE_STUDENT_LOGIN_DOMAIN =
  (process.env.STUDENT_LOGIN_DOMAIN || 'eleves.caddynote.app').trim().toLowerCase();

export const buildOpaqueStudentLogin = (studentId: string): string => {
  const short = studentId.replace(/-/g, '').slice(0, 10).toLowerCase();
  return `s-${short}@${OPAQUE_STUDENT_LOGIN_DOMAIN}`;
};

export const isOpaqueStudentLogin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const e = normalizeEmail(email);
  return e.startsWith('s-') && e.endsWith(`@${OPAQUE_STUDENT_LOGIN_DOMAIN}`);
};

export type ProvisionStudentLoginResult = {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    role: string;
    institutionId: string | null;
    [key: string]: unknown;
  };
  tempPassword: string;
  email: string;
  emailSent: boolean;
  smsSent: boolean;
  loginMode: 'email' | 'opaque';
};

/**
 * Active l’espace élève (e-mail réel ou alias opaque) + MDP provisoire.
 * Refuse si un login existe déjà (email + passwordHash).
 */
export const provisionStudentLogin = async (params: {
  studentId: string;
  email?: string | null;
  actorId: string;
  ipAddress?: string;
}): Promise<ProvisionStudentLoginResult> => {
  const student = await prisma.strkStudent.findUnique({
    where: { id: params.studentId },
    include: {
      profile: {
        select: {
          id: true,
          email: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          role: true,
          institutionId: true,
        },
      },
    },
  });
  if (!student?.profile || student.profile.role !== 'student') {
    throw Object.assign(new Error('Élève introuvable'), { status: 404 });
  }
  if (student.profile.email && student.profile.passwordHash) {
    throw Object.assign(new Error('Cet élève a déjà un accès de connexion'), { status: 409 });
  }

  const rawEmail = normalizeOptionalEmail(params.email ?? undefined);
  const loginMode: 'email' | 'opaque' = rawEmail ? 'email' : 'opaque';
  const email = rawEmail || buildOpaqueStudentLogin(student.id);

  const existing = await prisma.strkProfile.findFirst({
    where: { email, NOT: { id: student.id } },
  });
  if (existing) {
    throw Object.assign(new Error('Un compte existe déjà avec cet e-mail'), { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const user = await prisma.strkProfile.update({
    where: { id: student.id },
    data: {
      email,
      passwordHash,
      mustChangePassword: true,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
    select: PUBLIC_PROFILE_SELECT,
  });

  const invite =
    loginMode === 'email'
      ? await sendAccountInvite({
          email,
          firstName: user.firstName || '',
          tempPassword,
          phoneNumber: user.phoneNumber,
          accountKind: 'élève',
          role: 'student',
        })
      : { emailSent: false, smsSent: false };

  await logAudit({
    institutionId: student.institutionId,
    actorId: params.actorId,
    action: 'student.login.activated',
    targetType: 'user',
    targetId: student.id,
    metadata: { loginMode, email },
    ipAddress: params.ipAddress,
  });

  return {
    user,
    tempPassword,
    email,
    emailSent: invite.emailSent,
    smsSent: invite.smsSent,
    loginMode,
  };
};
