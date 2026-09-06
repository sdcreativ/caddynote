import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { checkA11y } from '@/test/a11y';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/strkAdmissionService', () => ({
  fetchAdmissionInstitutions: vi.fn().mockResolvedValue({
    institutions: [{ id: 'inst-1', name: 'École Pilote' }],
  }),
  fetchAdmissionClasses: vi.fn().mockResolvedValue({ classes: [] }),
  fetchAdmissionCampuses: vi.fn().mockResolvedValue({ campuses: [] }),
  fetchAdmissionByToken: vi.fn(),
  fetchAdmissionPacket: vi.fn(),
  createAdmission: vi.fn(),
  submitAdmission: vi.fn(),
  attachAdmissionPacketItem: vi.fn(),
  clearAdmissionPacketItem: vi.fn(),
  initiateAdmissionFeeCinetPay: vi.fn(),
  initiateAdmissionFeeStripe: vi.fn(),
}));

import {
  fetchAdmissionByToken,
  fetchAdmissionPacket,
  submitAdmission,
} from '@/services/strkAdmissionService';
import AdmissionApplyPage from './AdmissionApplyPage';

const DRAFT_KEY = 'caddynote.admission.apply.draft.v1';

const readyPacket = {
  template: null,
  storageMode: 'local' as const,
  items: [],
  completeness: {
    percent: 100,
    requiredTotal: 0,
    requiredDone: 0,
    missingRequired: 0,
    canSubmit: true,
  },
};

function seedSubmitDraft() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      v: 1,
      step: 6,
      institutionId: 'inst-1',
      classId: '',
      academicYear: '2025-2026',
      applicationKind: 'pre_registration',
      level: '',
      foreignStudent: false,
      assignedStudent: false,
      scholarshipStudent: false,
      campus: '',
      campusId: '',
      studentFirstName: 'Koffi',
      studentLastName: 'Yao',
      studentBirthDate: '2015-01-01',
      studentGender: 'male',
      guardian: {
        firstName: 'Awa',
        lastName: 'Yao',
        email: 'awa@example.com',
        phone: '',
        relationship: 'mother',
      },
      token: 'tok-public-1',
      applicationId: 'app-1',
    })
  );
}

describe('AdmissionApplyPage (wizard)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchAdmissionPacket).mockResolvedValue(readyPacket);
    vi.mocked(submitAdmission).mockResolvedValue({ followEmailSent: true });
    vi.mocked(fetchAdmissionByToken).mockResolvedValue({
      application: {
        id: 'app-1',
        publicToken: 'tok-public-1',
        applicationFeeCents: null,
        applicationFeePaid: false,
      },
    } as never);
  });

  it('affiche le stepper 8 étapes et l’étape Établissement', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AdmissionApplyPage />
        </MemoryRouter>
      </I18nextProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Étape 1 sur 8 : Établissement/i)).toBeInTheDocument();
    });

    const bar = screen.getByRole('progressbar', { name: /Progression du dossier/i });
    expect(bar).toHaveAttribute('aria-valuenow', '13'); // round(1/8*100)
    // 8 pastilles numérotées (stepper aria-hidden mais texte 1…8 présent)
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
  });

  it('à l’étape Soumission, lie la confidentialité puis confirme après envoi', async () => {
    seedSubmitDraft();

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <AdmissionApplyPage />
        </MemoryRouter>
      </I18nextProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Étape 7 sur 8 : Soumission/i)).toBeInTheDocument();
    });

    const privacy = screen.getByRole('link', { name: 'politique de confidentialité' });
    expect(privacy).toHaveAttribute('href', '/confidentialite');
    expect(await checkA11y(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Soumettre le dossier' }));

    await waitFor(() => {
      expect(submitAdmission).toHaveBeenCalledWith('tok-public-1');
      expect(screen.getByText(/Étape 8 sur 8 : Paiement & suivi/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Dossier soumis.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir mon suivi' })).toHaveAttribute(
      'href',
      '/admissions/suivi/tok-public-1'
    );
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
