import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/apiClient', () => ({
  API_BASE_URL: '/api',
  apiClient: {
    post: vi.fn(),
    get: vi.fn().mockResolvedValue({
      testimonials: [],
      contact: { email: 'contact@caddynote.com', phone: '', whatsapp: '' },
      stats: { schools: null, students: null },
      faq: [],
    }),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/public/FadeIn', () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Stagger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaggerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ContactFormContent } from './ContactFormContent';

/**
 * §6 — a11y ciblée formulaire contact (noms accessibles).
 * Suite axe complète : PublicShell / PublicHeader ; contraste : `npm run a11y:paint`.
 */
describe('ContactFormContent a11y (§6)', () => {
  it(
    'expose des champs nommés et un bouton d’envoi',
    () => {
      render(
        <MemoryRouter>
          <ContactFormContent />
        </MemoryRouter>
      );
      expect(screen.getByLabelText(/Nom complet/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Adresse e-mail/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Sujet/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Message/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Envoyer le message/i })).toBeInTheDocument();
    },
    30_000
  );
});
