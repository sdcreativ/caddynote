import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { prisma } from '../lib/prisma.js';
import { buildFixture, type Fixture } from './fixtures.js';
import { runAdmissionDocumentReminderCheck } from '../lib/admissionDocDeadlineCron.js';
import { setAdmissionInstitutionPolicy } from '../lib/admissionSettings.js';
import * as followUp from '../lib/admissionFollowUp.js';

describe('admissionDocDeadlineCron — dossiers incomplets', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildFixture();
  }, 30000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('relance un dossier draft stagnant avec pièce manquante', async () => {
    await setAdmissionInstitutionPolicy(fx.a.institutionId, { incompleteReminderDays: 1 });

    const notify = vi.spyOn(followUp, 'notifyAdmissionContact').mockResolvedValue({
      email: true,
      sms: false,
      whatsapp: false,
    } as never);

    const stale = new Date(Date.now() - 3 * 86400000);
    const app = await prisma.strkAdmissionApplication.create({
      data: {
        institutionId: fx.a.institutionId,
        academicYear: '2026-2027',
        status: 'draft',
        studentFirstName: 'Awa',
        studentLastName: 'Test',
        studentBirthDate: new Date('2015-01-01'),
        contactEmail: 'parent.rappel@example.invalid',
        publicToken: `tok-remind-${Date.now()}`,
        createdAt: stale,
        updatedAt: stale,
      },
    });

    const docType = await prisma.strkAdmissionDocumentType.create({
      data: {
        institutionId: fx.a.institutionId,
        code: `birth_${Date.now()}`,
        label: 'Acte de naissance',
        category: 'identity',
      },
    });

    await prisma.strkAdmissionDocumentItem.create({
      data: {
        applicationId: app.id,
        documentTypeId: docType.id,
        status: 'missing',
      },
    });

    const result = await runAdmissionDocumentReminderCheck({ institutionId: fx.a.institutionId });
    expect(result.reminded).toBeGreaterThanOrEqual(1);

    const refreshed = await prisma.strkAdmissionApplication.findUnique({ where: { id: app.id } });
    expect(refreshed?.packetRemindedAt).toBeTruthy();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent.rappel@example.invalid',
        kind: 'needs_info',
      })
    );

    await runAdmissionDocumentReminderCheck({ institutionId: fx.a.institutionId });
    const again = notify.mock.calls.filter((c) => c[0]?.to === 'parent.rappel@example.invalid');
    // Pas de double relance pour le même dossier
    expect(again.length).toBe(1);
  }, 30000);
});
