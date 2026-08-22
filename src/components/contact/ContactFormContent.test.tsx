import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const post = vi.fn();
vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/public/FadeIn', () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ContactFormContent } from './ContactFormContent';

describe('ContactFormContent (smoke)', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({});
  });

  it('soumet le formulaire vers POST /contact', async () => {
    render(
      <MemoryRouter>
        <ContactFormContent />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/Nom complet/i), {
      target: { value: 'Alice Martin' },
    });
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/i), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Sujet/i), {
      target: { value: 'Demo' },
    });
    fireEvent.change(screen.getByLabelText(/^Message/i), {
      target: { value: 'Bonjour' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le message/i }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/contact',
        {
          name: 'Alice Martin',
          email: 'alice@example.com',
          subject: 'Demo',
          message: 'Bonjour',
        },
        { skipAuth: true }
      );
    });
  });
});
