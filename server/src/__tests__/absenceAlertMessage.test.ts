import { describe, it, expect } from 'vitest';
import { formatAbsenceAlertCopy, formatStudentDisplayName } from '../lib/absenceAlertCron.js';
import { formatThresholdAlertCopy } from '../lib/attendanceThresholds.js';

describe('formatAbsenceAlertCopy', () => {
  it('inclut nom, cours et horaire dans le message immédiat', () => {
    const { subject, body } = formatAbsenceAlertCopy(
      {
        studentName: 'Léa Martin',
        courseName: 'Mathématiques',
        courseTime: '08:00–09:00',
        formattedDate: '26/08/2026',
      },
      { immediate: true }
    );
    expect(subject).toBe('Absence de Léa Martin');
    expect(body).toContain('Léa Martin');
    expect(body).toContain('Mathématiques');
    expect(body).toContain('08:00–09:00');
    expect(body).toContain('26/08/2026');
  });

  it('omet le cours et l’horaire s’ils sont absents', () => {
    const { body } = formatAbsenceAlertCopy(
      {
        studentName: 'Léa Martin',
        courseName: null,
        courseTime: null,
        formattedDate: '26/08/2026',
      },
      { immediate: true }
    );
    expect(body).toBe(
      'Léa Martin a été marqué(e) absent(e) le 26/08/2026. Vous pouvez justifier l’absence depuis votre espace parent.'
    );
  });

  it('conserve le cours sans horaire si seul le nom est connu', () => {
    const { body } = formatAbsenceAlertCopy(
      {
        studentName: 'Léa Martin',
        courseName: 'Histoire',
        courseTime: null,
        formattedDate: '26/08/2026',
      },
      { immediate: true }
    );
    expect(body).toContain('au cours de Histoire');
    expect(body).not.toContain('()');
  });

  it('formule un message de retard explicite', () => {
    const { subject, body } = formatAbsenceAlertCopy(
      {
        studentName: 'Noah Bernard',
        courseName: 'Anglais',
        courseTime: '14:00–14:50',
        formattedDate: '11/03/2026',
      },
      { kind: 'lateness' }
    );
    expect(subject).toBe('Retard de Noah Bernard');
    expect(body).toBe(
      'Noah Bernard a été marqué(e) en retard le 11/03/2026 au cours de Anglais (14:00–14:50).'
    );
  });
});

describe('formatStudentDisplayName', () => {
  it('compose prénom + nom', () => {
    expect(formatStudentDisplayName({ firstName: 'Léa', lastName: 'Martin' })).toBe('Léa Martin');
  });

  it('replie sur « votre enfant » si profil vide', () => {
    expect(formatStudentDisplayName({ firstName: null, lastName: null })).toBe('votre enfant');
  });
});

describe('formatThresholdAlertCopy', () => {
  it('inclut le nom de l’élève pour la direction et la famille', () => {
    const copy = formatThresholdAlertCopy({
      studentName: 'Camille Dupont',
      type: 'absence',
      count: 3,
      threshold: 3,
      windowDays: 30,
    });
    expect(copy.staffSubject).toBe("Seuil d'assiduité — Camille Dupont");
    expect(copy.staffBody).toContain('Camille Dupont');
    expect(copy.guardianSubject).toBe("Suivi d'assiduité — Camille Dupont");
    expect(copy.guardianBody).toContain('Camille Dupont');
    expect(copy.guardianBody).toContain('absences non justifiées');
    expect(copy.guardianBody).not.toContain('votre enfant');
  });

  it('formule aussi les seuils de retards', () => {
    const copy = formatThresholdAlertCopy({
      studentName: 'Noah Bernard',
      type: 'lateness',
      count: 4,
      threshold: 4,
      windowDays: 30,
    });
    expect(copy.guardianBody).toContain('retards');
    expect(copy.guardianBody).toContain('Noah Bernard');
  });
});
