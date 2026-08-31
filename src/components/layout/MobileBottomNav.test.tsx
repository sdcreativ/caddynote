import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { checkA11y } from '@/test/a11y';
import MobileBottomNav from './MobileBottomNav';

describe('MobileBottomNav (enseignant)', () => {
  it('affiche les 5 slots et ouvre Plus via onOpenMore', async () => {
    const onOpenMore = vi.fn();
    const { container } = render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MobileBottomNav role="teacher" onOpenMore={onOpenMore} />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Présences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cahier / cours' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    expect(onOpenMore).toHaveBeenCalledTimes(1);

    expect(await checkA11y(container)).toHaveNoViolations();
  });

  it('ne rend rien pour un rôle sans barre du bas', () => {
    const { container } = render(
      <MemoryRouter>
        <MobileBottomNav role="unknown_role" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('Comptable : Accueil · Finances · Élèves · Documents · Plus', () => {
    render(
      <MemoryRouter initialEntries={['/finance']}>
        <MobileBottomNav role="accountant" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Finances' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Élèves' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
  });

  it('Direction : Accueil · Élèves · Présences · Finances · Plus', () => {
    render(
      <MemoryRouter initialEntries={['/students']}>
        <MobileBottomNav role="school_admin" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Élèves' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Présences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finances' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
  });

  it('Parent : Enfants actif hors onglet finance', () => {
    render(
      <MemoryRouter initialEntries={['/my-children']}>
        <MobileBottomNav role="parent" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Enfants' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Finances' })).not.toHaveAttribute('aria-current');
  });

  it('Parent : Finances actif avec ?tab=finance', () => {
    render(
      <MemoryRouter initialEntries={['/my-children?tab=finance']}>
        <MobileBottomNav role="parent" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Finances' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Enfants' })).not.toHaveAttribute('aria-current');
  });

  it('Élève : Accueil · Notes · Devoirs · Messages · Plus', () => {
    render(
      <MemoryRouter initialEntries={['/my-grades']}>
        <MobileBottomNav role="student" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Mes notes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Devoirs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
  });

  it('Secrétariat : Accueil · Élèves · Présences · Messages · Plus', () => {
    render(
      <MemoryRouter initialEntries={['/students']}>
        <MobileBottomNav role="secretary" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Élèves' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Présences' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
  });

  it('Vie scolaire : Accueil · Présences · Élèves · Messagerie · Plus', () => {
    render(
      <MemoryRouter initialEntries={['/attendance']}>
        <MobileBottomNav role="supervisor" onOpenMore={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Présences' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Élèves' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appel' })).not.toBeInTheDocument();
  });
});
