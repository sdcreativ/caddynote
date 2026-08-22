import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const post = vi.fn();
vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ForgotPasswordPage from './ForgotPasswordPage';

describe('ForgotPasswordPage (smoke)', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({});
  });

  it('affiche le formulaire email et envoie /auth/forgot-password', async () => {
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    const email = screen.getByLabelText(/e-?mail/i);
    fireEvent.change(email, { target: { value: 'parent@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer le lien/i }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'parent@example.com' },
        { skipAuth: true }
      );
    });
  });
});
