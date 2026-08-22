import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { checkA11y } from '@/test/a11y';

describe('Dialog (UX-004 — focus + 44px + nom accessible)', () => {
  it('expose un dialogue nommé, bouton Fermer 44px, sans violation axe', async () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle classe</DialogTitle>
            <DialogDescription>Renseignez le nom et le niveau.</DialogDescription>
          </DialogHeader>
          <Button>Enregistrer</Button>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Nouvelle classe' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const close = screen.getByRole('button', { name: 'Fermer' });
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).toMatch(/\bw-11\b/);
    expect(dialog.contains(close)).toBe(true);

    expect(await checkA11y(baseElement)).toHaveNoViolations();
  });
});
