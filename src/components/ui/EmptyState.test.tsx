import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState (smoke)', () => {
  it('affiche titre et description fournis', () => {
    render(<EmptyState title="Aucune facture" description="Créez une première facture." />);
    expect(screen.getByText('Aucune facture')).toBeInTheDocument();
    expect(screen.getByText('Créez une première facture.')).toBeInTheDocument();
  });

  it('déclenche onAction quand un bouton est proposé', () => {
    const onAction = vi.fn();
    render(
      <EmptyState title="Vide" description="—" actionLabel="Créer" onAction={onAction} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
