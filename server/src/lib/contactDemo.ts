import { prisma } from './prisma.js';
import { hashPassword } from './password.js';
import { generateTempPassword } from './tempPassword.js';
import { sendAccountInvite } from './accountInvite.js';
import { ensureRoleExtension } from './roleExtensions.js';
import { ensureInstitutionSubscription } from './institutionSubscription.js';
import { logAudit } from './audit.js';
import { PUBLIC_PROFILE_SELECT } from './profileSelect.js';
import { invalidateDashboardSummaryCache } from './dashboardCache.js';

const DEMO_SUBJECT_RE =
  /d[eé]mo|d[eé]monstration|pr[eé]sentation|essai\s+gratuit|demande\s+d['’]?essai/i;

export const isDemoContactSubject = (subject: string): boolean => DEMO_SUBJECT_RE.test(subject);

export const splitContactName = (fullName: string): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Contact', lastName: 'Établissement' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Admin' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

/**
 * Notifie tous les admins plateforme (cloche in-app / poll Super Admin).
 * Best-effort : un échec d’écriture ne doit pas bloquer le POST /contact.
 */
export const notifyPlatformAdminsOfContact = async (params: {
  contactId: string;
  name: string;
  email: string;
  subject: string;
  isDemo: boolean;
}): Promise<number> => {
  const admins = await prisma.strkProfile.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
    orderBy: [{ lastLoginAt: 'desc' }, { createdAt: 'desc' }],
    // Équipe plateforme : volume faible en prod ; en test la base peut
    // accumuler des fixtures — on priorise les comptes récents / actifs.
    take: 200,
  });
  if (admins.length === 0) return 0;

  const title = params.isDemo ? 'Nouvelle demande de démo' : 'Nouveau message contact';
  const message = `${params.name} <${params.email}> — ${params.subject}`;
  const actionUrl = '/super-admin/support-ops';

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title,
      message,
      type: params.isDemo ? 'warning' : 'info',
      actionUrl,
      data: {
        contactId: params.contactId,
        kind: params.isDemo ? 'demo_request' : 'contact_message',
      } as object,
    })),
  });
  return admins.length;
};

const INSTITUTION_TYPES = [
  'school',
  'high_school',
  'middle_school',
  'university',
  'training_center',
  'elementary_school',
  'private_school',
] as const;

export type ProvisionDemoInput = {
  contactId: string;
  actorId: string;
  institutionName: string;
  institutionType: (typeof INSTITUTION_TYPES)[number];
  adminEmail?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminPhone?: string;
  ipAddress?: string;
};

export type ProvisionDemoResult = {
  alreadyProvisioned?: boolean;
  institution: { id: string; name: string; type: string; email: string | null };
  admin: { id: string; email: string; firstName: string; lastName: string };
  tempPassword: string;
  emailSent: boolean;
  smsSent: boolean;
  subscriptionAttach: Awaited<ReturnType<typeof ensureInstitutionSubscription>> | null;
  ticketId: string | null;
  message: {
    id: string;
    status: string;
    convertedTicketId: string | null;
    convertedInstitutionId: string | null;
  };
};

/**
 * Un clic ops : établissement (trial) + school_admin + invitation + ticket lié.
 */
export const provisionDemoFromContact = async (
  input: ProvisionDemoInput
): Promise<ProvisionDemoResult> => {
  const contact = await prisma.strkContactMessage.findUnique({ where: { id: input.contactId } });
  if (!contact) {
    throw Object.assign(new Error('Message introuvable'), { status: 404 });
  }

  if (contact.convertedInstitutionId) {
    const institution = await prisma.strkInstitution.findUnique({
      where: { id: contact.convertedInstitutionId },
    });
    const admin = institution?.adminId
      ? await prisma.strkProfile.findUnique({
          where: { id: institution.adminId },
          select: PUBLIC_PROFILE_SELECT,
        })
      : await prisma.strkProfile.findFirst({
          where: { institutionId: contact.convertedInstitutionId, role: 'school_admin' },
          select: PUBLIC_PROFILE_SELECT,
        });
    if (institution && admin) {
      return {
        alreadyProvisioned: true,
        institution: {
          id: institution.id,
          name: institution.name,
          type: institution.type,
          email: institution.email,
        },
        admin: {
          id: admin.id,
          email: admin.email ?? '',
          firstName: admin.firstName ?? '',
          lastName: admin.lastName ?? '',
        },
        tempPassword: '',
        emailSent: false,
        smsSent: false,
        subscriptionAttach: null,
        ticketId: contact.convertedTicketId,
        message: {
          id: contact.id,
          status: contact.status,
          convertedTicketId: contact.convertedTicketId,
          convertedInstitutionId: contact.convertedInstitutionId,
        },
      };
    }
  }

  const split = splitContactName(contact.name);
  const adminEmail = (input.adminEmail || contact.email).trim().toLowerCase();
  const adminFirstName = (input.adminFirstName || split.firstName).trim();
  const adminLastName = (input.adminLastName || split.lastName).trim();

  const existingUser = await prisma.strkProfile.findUnique({ where: { email: adminEmail } });
  if (existingUser) {
    throw Object.assign(new Error('Un compte existe déjà avec cet e-mail'), { status: 409 });
  }

  const institution = await prisma.strkInstitution.create({
    data: {
      name: input.institutionName.trim(),
      type: input.institutionType,
      email: adminEmail,
      phone: input.adminPhone || null,
    },
  });

  let subscriptionAttach: Awaited<ReturnType<typeof ensureInstitutionSubscription>> | null = null;
  try {
    subscriptionAttach = await ensureInstitutionSubscription({
      institutionId: institution.id,
      actorUserId: input.actorId,
      status: 'trial',
    });
  } catch (err) {
    console.error('Rattachement plan démo échoué:', err);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const admin = await prisma.strkProfile.create({
    data: {
      email: adminEmail,
      passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: 'school_admin',
      phoneNumber: input.adminPhone || null,
      institutionId: institution.id,
    },
    select: PUBLIC_PROFILE_SELECT,
  });
  await ensureRoleExtension(admin.id, 'school_admin', institution.id);
  await prisma.strkInstitution.update({
    where: { id: institution.id },
    data: { adminId: admin.id },
  });

  const ticket = await prisma.strkSupportTicket.create({
    data: {
      institutionId: institution.id,
      createdBy: input.actorId,
      assignedTo: input.actorId,
      subject: `[Démo] ${contact.subject}`,
      priority: 'high',
      status: 'open',
    },
  });
  await prisma.strkSupportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorId: input.actorId,
      body:
        `Session démo provisionnée automatiquement.\n\n` +
        `Contact : ${contact.name} <${contact.email}>\n` +
        `Établissement : ${institution.name} (${institution.id})\n` +
        `Admin : ${admin.email}\n\n` +
        `${contact.message}`,
      isInternal: true,
    },
  });

  const message = await prisma.strkContactMessage.update({
    where: { id: contact.id },
    data: {
      status: 'converted',
      convertedTicketId: ticket.id,
      convertedInstitutionId: institution.id,
      handledAt: new Date(),
      handledBy: input.actorId,
    },
  });

  const { emailSent, smsSent } = await sendAccountInvite({
    email: adminEmail,
    firstName: adminFirstName,
    tempPassword,
    phoneNumber: input.adminPhone,
    role: 'school_admin',
    accountKind: 'school_admin',
  });

  await logAudit({
    actorId: input.actorId,
    institutionId: institution.id,
    action: 'contact.provisioned_demo',
    targetType: 'contact_message',
    targetId: contact.id,
    metadata: {
      institutionId: institution.id,
      adminId: admin.id,
      ticketId: ticket.id,
      emailSent,
      smsSent,
      subscriptionAttach,
    },
    ipAddress: input.ipAddress,
  });

  await invalidateDashboardSummaryCache(null);

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      type: institution.type,
      email: institution.email,
    },
    admin: {
      id: admin.id,
      email: admin.email ?? '',
      firstName: admin.firstName ?? '',
      lastName: admin.lastName ?? '',
    },
    tempPassword,
    emailSent,
    smsSent,
    subscriptionAttach,
    ticketId: ticket.id,
    message: {
      id: message.id,
      status: message.status,
      convertedTicketId: message.convertedTicketId,
      convertedInstitutionId: message.convertedInstitutionId,
    },
  };
};

export const DEMO_INSTITUTION_TYPES = INSTITUTION_TYPES;
