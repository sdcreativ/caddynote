import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';

describe('États UX-005 (smoke)', () => {
  it('LoadingState annonce le chargement', () => {
    render(<LoadingState label="Chargement des factures…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des factures…');
  });

  it('ErrorState propose un nouvel essai', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Échec" description="Réseau indisponible" onRetry={onRetry} retryLabel="Réessayer" />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Échec');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('EmptyState affiche titre et description', () => {
    render(<EmptyState title="Aucune note" description="Saisissez une première note." />);
    expect(screen.getByText('Aucune note')).toBeInTheDocument();
  });
});
