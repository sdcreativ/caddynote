import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';

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

import AdmissionApplyPage from './AdmissionApplyPage';

describe('AdmissionApplyPage (wizard)', () => {
  beforeEach(() => {
    localStorage.clear();
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
      expect(screen.getByText(/Étape 1 sur 8 — Établissement/i)).toBeInTheDocument();
    });

    const bar = screen.getByRole('progressbar', { name: /Progression du dossier/i });
    expect(bar).toHaveAttribute('aria-valuenow', '13'); // round(1/8*100)
    // 8 pastilles numérotées (stepper aria-hidden mais texte 1…8 présent)
    for (const n of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
  });
});
