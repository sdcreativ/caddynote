import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from './input';
import { checkA11y } from '@/test/a11y';

describe('Input — cible tactile 44px (UX-004)', () => {
  it('fait au moins 44px de haut (h-11)', () => {
    const { container } = render(<Input aria-label="Nom" />);
    expect(container.querySelector('input')?.className).toMatch(/\bh-11\b/);
  });

  it("n'a aucune violation axe avec un libellé", async () => {
    const { container } = render(<Input aria-label="Nom" />);
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
