import { describe, expect, it } from 'vitest';
import { isInternalCtaPath, sanitizeCtaUrl } from './internalCtaPath.js';

describe('isInternalCtaPath', () => {
  it('accepte les chemins internes', () => {
    expect(isInternalCtaPath('/contact?subject=Présentation')).toBe(true);
    expect(isInternalCtaPath('/#features')).toBe(true);
    expect(isInternalCtaPath('')).toBe(true);
    expect(isInternalCtaPath('  /admissions  ')).toBe(true);
  });

  it('refuse externe, protocol-relative et javascript', () => {
    expect(isInternalCtaPath('https://evil.example')).toBe(false);
    expect(isInternalCtaPath('http://evil.example')).toBe(false);
    expect(isInternalCtaPath('//evil.example')).toBe(false);
    expect(isInternalCtaPath('javascript:alert(1)')).toBe(false);
    expect(isInternalCtaPath('/foo/javascript:bar')).toBe(false);
    expect(isInternalCtaPath('mailto:ops@example.com')).toBe(false);
    expect(isInternalCtaPath('data:text/html,hi')).toBe(false);
  });
});

describe('sanitizeCtaUrl', () => {
  it('neutralise une URL externe déjà stockée', () => {
    expect(sanitizeCtaUrl('https://evil.example')).toBe('');
    expect(sanitizeCtaUrl('/contact')).toBe('/contact');
    expect(sanitizeCtaUrl(undefined)).toBe('');
  });
});
