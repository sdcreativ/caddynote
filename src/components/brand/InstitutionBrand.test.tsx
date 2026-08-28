import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InstitutionBrand } from './InstitutionBrand';

vi.mock('@/lib/storedFileAccess', () => ({
  resolveStoredFileDisplayUrl: vi.fn(async () => 'blob:mock-logo'),
}));

describe('InstitutionBrand', () => {
  it('affiche le nom de l’établissement sans logo', () => {
    render(
      <MemoryRouter>
        <InstitutionBrand name="Collège Demo" logoKey={null} />
      </MemoryRouter>
    );
    expect(screen.getByText('Collège Demo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('affiche le logo lorsque la clé est une URL directe', () => {
    const { container } = render(
      <MemoryRouter>
        <InstitutionBrand name="Collège Demo" logoKey="https://cdn.example/logo.png" />
      </MemoryRouter>
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example/logo.png');
    expect(screen.getByText('Collège Demo')).toBeInTheDocument();
  });
});
