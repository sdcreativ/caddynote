import { describe, it, expect } from 'vitest';
import {
  assertDbProfile,
  hostDbMixupWarning,
  inferDbProfile,
  parseDatabaseUrl,
  parseExpectedDbProfile,
} from '../lib/databaseTarget.js';

describe('Cible Postgres (hôte 5432 vs compose 5433)', () => {
  it('parse l’URL sans exposer le mot de passe', () => {
    const target = parseDatabaseUrl('postgresql://caddynote:secret@localhost:5433/caddynote');
    expect(target).toEqual({
      host: 'localhost',
      port: 5433,
      database: 'caddynote',
      profile: 'compose-published',
    });
    expect(JSON.stringify(target)).not.toContain('secret');
  });

  it('distingue compose interne, compose publié, hôte et tests', () => {
    expect(inferDbProfile('caddynote-db', 5432, 'caddynote')).toBe('compose-internal');
    expect(inferDbProfile('localhost', 5433, 'caddynote')).toBe('compose-published');
    expect(inferDbProfile('127.0.0.1', 5432, 'caddynote')).toBe('host');
    expect(inferDbProfile('127.0.0.1', 5432, 'caddynote_test')).toBe('test');
    expect(inferDbProfile('db.example.com', 5432, 'caddynote')).toBe('other');
  });

  it('avertit uniquement pour le Postgres hôte applicatif', () => {
    expect(hostDbMixupWarning(parseDatabaseUrl('postgresql://u:p@localhost:5432/caddynote')!)).toMatch(/5433/);
    expect(hostDbMixupWarning(parseDatabaseUrl('postgresql://u:p@localhost:5433/caddynote')!)).toBeNull();
    expect(hostDbMixupWarning(parseDatabaseUrl('postgresql://u:p@127.0.0.1:5432/caddynote_test')!)).toBeNull();
  });

  it('CADDYNOTE_DB_PROFILE refuse une cible incompatible', () => {
    expect(parseExpectedDbProfile('Compose')).toBe('compose');
    const host = parseDatabaseUrl('postgresql://u:p@localhost:5432/caddynote')!;
    expect(assertDbProfile(host, 'host')).toBeNull();
    expect(assertDbProfile(host, 'compose')).toMatch(/compose/);
    const published = parseDatabaseUrl('postgresql://u:p@localhost:5433/caddynote')!;
    expect(assertDbProfile(published, 'compose')).toBeNull();
    const internal = parseDatabaseUrl('postgresql://u:p@caddynote-db:5432/caddynote')!;
    expect(assertDbProfile(internal, 'compose')).toBeNull();
    expect(assertDbProfile(host, 'prod')).toMatch(/invalide/);
  });

  it('URL absente ou illisible → null', () => {
    expect(parseDatabaseUrl(undefined)).toBeNull();
    expect(parseDatabaseUrl('not-a-url')).toBeNull();
  });
});
