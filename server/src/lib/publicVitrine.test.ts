import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLIC_EMAIL,
  parseStoredContact,
  parseStoredFaq,
  parseStoredStats,
  parseStoredTestimonials,
  sanitizeContact,
  sanitizeFaq,
  sanitizeStats,
  sanitizeTestimonials,
} from './publicVitrine.js';

const validItem = {
  quote: 'Les parents sont informés plus vite et nos équipes gagnent du temps.',
  name: 'Marie Kouassi',
  role: 'Directrice',
  place: 'Abidjan',
};

describe('sanitizeTestimonials', () => {
  it('accepte un avis réel', () => {
    expect(sanitizeTestimonials([validItem])).toEqual({ ok: true, value: [validItem] });
  });

  it('refuse une citation trop courte ou une URL', () => {
    expect(sanitizeTestimonials([{ ...validItem, quote: 'trop cour' }]).ok).toBe(false);
    expect(sanitizeTestimonials([{ ...validItem, place: 'https://evil.example' }]).ok).toBe(false);
    expect(sanitizeTestimonials([{ ...validItem, name: 'Jean <script>' }]).ok).toBe(false);
  });

  it('refuse plus de 8 avis', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ ...validItem, name: `Personne ${i}` }));
    expect(sanitizeTestimonials(items).ok).toBe(false);
  });

  it('ignore un avis dangereux déjà stocké', () => {
    expect(
      parseStoredTestimonials({
        items: [validItem, { ...validItem, name: 'https://evil.example' }],
      })
    ).toEqual([validItem]);
  });
});

describe('sanitizeContact', () => {
  it('accepte e-mail, téléphone et WhatsApp', () => {
    expect(
      sanitizeContact({
        email: 'contact@caddynote.com',
        phone: '+225 01 02 03 04 05',
        whatsapp: '+2250102030405',
      }).ok
    ).toBe(true);
  });

  it('accepte des champs vides', () => {
    expect(sanitizeContact({ email: '', phone: '', whatsapp: '' })).toEqual({
      ok: true,
      value: { email: '', phone: '', whatsapp: '' },
    });
  });

  it('refuse un e-mail ou un téléphone invalide', () => {
    expect(sanitizeContact({ email: 'pas-un-email', phone: '', whatsapp: '' }).ok).toBe(false);
    expect(sanitizeContact({ email: '', phone: 'javascript:alert(1)', whatsapp: '' }).ok).toBe(false);
  });

  it('retombe sur l’e-mail officiel si le setting est illisible', () => {
    expect(parseStoredContact('oops', true).email).toBe(DEFAULT_PUBLIC_EMAIL);
  });
});

describe('sanitizeStats', () => {
  it('accepte des entiers positifs ou null', () => {
    expect(sanitizeStats({ schools: 3, students: null })).toEqual({
      ok: true,
      value: { schools: 3, students: null },
    });
  });

  it('refuse 0, les décimaux et les valeurs excessives', () => {
    expect(sanitizeStats({ schools: 0, students: 10 }).ok).toBe(false);
    expect(sanitizeStats({ schools: 1.5, students: null }).ok).toBe(false);
    expect(parseStoredStats({ schools: 0, students: 12 })).toEqual({ schools: null, students: 12 });
  });
});

describe('sanitizeFaq', () => {
  it('accepte une question / réponse', () => {
    const item = { q: 'Comment me connecter ?', a: 'Utilisez l’e-mail fourni par votre établissement.' };
    expect(sanitizeFaq([item])).toEqual({ ok: true, value: [item] });
  });

  it('refuse HTML, URL et texte trop court', () => {
    expect(sanitizeFaq([{ q: 'Ok ?', a: 'Trop court' }]).ok).toBe(false);
    expect(sanitizeFaq([{ q: 'Question <b>x</b>', a: 'Réponse assez longue ici.' }]).ok).toBe(false);
    expect(parseStoredFaq({ items: [{ q: 'https://evil.example', a: 'Réponse assez longue ici.' }] })).toEqual([]);
  });
});
