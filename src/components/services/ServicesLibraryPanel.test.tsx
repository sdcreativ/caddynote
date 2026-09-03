import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import { ServicesLibraryPanel } from './ServicesLibraryPanel';

describe('ServicesLibraryPanel', () => {
  it('signale les prêts en retard et filtre la liste', () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    render(
      <I18nextProvider i18n={i18n}>
        <ServicesLibraryPanel
          items={[
            {
              id: 'item-1',
              title: 'Livre A',
              available: 0,
              quantity: 1,
              loans: [
                { id: 'loan-late', studentId: 's1', studentName: 'Ada', dueAt: past },
                { id: 'loan-ok', studentId: 's2', studentName: 'Bob', dueAt: future },
              ],
            },
          ]}
          saving={false}
          loading={false}
          onCreateItem={vi.fn()}
          onLoan={vi.fn()}
          onReturn={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByText(/1 prêt\(s\) en retard/i)).toBeInTheDocument();
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();

    // Select native via role combobox
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /En retard/i }));

    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.queryByText(/Bob/)).not.toBeInTheDocument();
  });
});
