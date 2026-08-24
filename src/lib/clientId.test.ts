import { describe, it, expect } from 'vitest';
import { newClientId } from './clientId';

describe('newClientId', () => {
  it('retourne un identifiant non vide en forme UUID', () => {
    const id = newClientId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('génère des valeurs distinctes', () => {
    expect(newClientId()).not.toBe(newClientId());
  });
});
