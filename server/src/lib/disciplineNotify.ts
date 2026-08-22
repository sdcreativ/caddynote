import { prisma } from './prisma.js';
import { sendCommunication } from './communications.js';

/**
 * SUI / §5.11 — notifier les responsables (push) lorsqu’un incident leur
 * est partagé ou qu’une décision est prise sur un incident déjà visible.
 * Respecte `canViewDiscipline` + `canReceiveCommunications`.
 */
export const notifyGuardiansOfIncident = async (params: {
  studentId: string;
  institutionId: string;
  requestedBy: string;
  event: 'shared' | 'decision';
  description: string;
  decision?: string | null;
}): Promise<{ notified: number }> => {
  const links = await prisma.strkStudentGuardian.findMany({
    where: {
      studentId: params.studentId,
      status: 'active',
      canViewDiscipline: true,
      canReceiveCommunications: true,
    },
    select: { guardianId: true },
  });

  let notified = 0;
  const subject =
    params.event === 'decision'
      ? 'Décision disciplinaire'
      : 'Information disciplinaire';
  const body =
    params.event === 'decision'
      ? `Une décision a été enregistrée concernant votre enfant : ${params.decision || 'voir le dossier'}. Contexte : ${params.description}`
      : `Un incident disciplinaire concernant votre enfant a été partagé avec vous : ${params.description}`;

  for (const link of links) {
    const result = await sendCommunication({
      recipientId: link.guardianId,
      channel: 'push',
      useCase: params.event === 'decision' ? 'discipline_decision' : 'discipline_shared',
      subject,
      body,
      isCritical: true,
      requestedBy: params.requestedBy,
      institutionId: params.institutionId,
    });
    if (result.ok) notified += 1;
    else {
      console.error(
        `Notification discipline non envoyée (élève ${params.studentId}, responsable ${link.guardianId}) :`,
        result.error
      );
    }
  }

  return { notified };
};
