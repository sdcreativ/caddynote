import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { checkA11y } from '@/test/a11y';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineBanner } from '@/components/layout/OfflineBanner';

vi.mock('@/hooks/useOfflineSync', () => ({
  useOfflineSync: () => ({ isOnline: false, pendingCount: 2, refreshPendingCount: vi.fn() }),
}));

describe('États UX + hors-ligne (UX-004 / UX-005)', () => {
  it('EmptyState / LoadingState / ErrorState sans violation axe', async () => {
    const { container, rerender } = render(
      <EmptyState title="Vide" description="Rien ici." actionLabel="Créer" onAction={() => {}} />
    );
    expect(await checkA11y(container)).toHaveNoViolations();

    rerender(<LoadingState label="Chargement…" />);
    expect(await checkA11y(container)).toHaveNoViolations();
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<ErrorState title="Échec" description="Réessayez." onRetry={() => {}} />);
    expect(await checkA11y(container)).toHaveNoViolations();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ErrorState sans props affiche les libellés i18n par défaut', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Une erreur est survenue/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/réessayer/i);
  });

  it('OfflineBanner annonce le statut hors ligne (role=status)', async () => {
    const { container } = render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/Hors ligne/i);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
