import { describe, it, expect } from 'vitest';
import { lockKeyPair, withCronLock } from '../lib/cronLock.js';

describe('cronLock (advisory Postgres)', () => {
  it('lockKeyPair est stable et distinct par nom', () => {
    expect(lockKeyPair('a')).toEqual(lockKeyPair('a'));
    expect(lockKeyPair('backup')).not.toEqual(lockKeyPair('dunning'));
  });

  it('deux appels concurrents : un ran, un skipped', async () => {
    const db = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!db) {
      console.warn('Pas de DATABASE_URL — skip test concurrence cronLock');
      return;
    }

    const name = `test-lock-${Date.now()}`;
    let concurrent = 0;
    let maxConcurrent = 0;

    const job = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 200));
      concurrent -= 1;
    };

    const [a, b] = await Promise.all([withCronLock(name, job), withCronLock(name, job)]);
    const results = [a, b].sort();
    expect(results).toEqual(['ran', 'skipped']);
    expect(maxConcurrent).toBe(1);
  }, 15_000);
});
