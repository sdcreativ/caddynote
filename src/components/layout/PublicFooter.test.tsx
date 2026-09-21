import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/publicVitrine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/publicVitrine')>();
  return {
    ...actual,
    usePublicVitrine: () => ({
      testimonials: [],
      contact: {
        ...actual.EMPTY_PUBLIC_CONTACT,
        companyName: 'SD CREATIV',
        legalForm: 'SARL',
        registeredAddress: 'Abidjan',
        rccm: 'CI-ABJ-2024-B-12345',
      },
      hosting: actual.PUBLIC_HOSTING,
      stats: { schools: null, students: null },
      faq: [],
    }),
  };
});

import { PublicFooter } from './PublicFooter';

describe('PublicFooter', () => {
  it('affiche l’identité légale et l’hébergeur en bas de page', () => {
    render(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>
    );

    expect(screen.getByText(/SD CREATIV, SARL/)).toBeInTheDocument();
    expect(screen.getByText(/Hostinger International Ltd/)).toBeInTheDocument();
  });
});
