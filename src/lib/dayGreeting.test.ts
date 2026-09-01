import { describe, expect, it } from 'vitest';
import { dayGreetingKey } from './dayGreeting';

describe('dayGreetingKey', () => {
  it('renvoie hello en journée', () => {
    expect(dayGreetingKey(new Date('2026-09-01T10:00:00'))).toBe('hello');
    expect(dayGreetingKey(new Date('2026-09-01T05:00:00'))).toBe('hello');
    expect(dayGreetingKey(new Date('2026-09-01T17:59:00'))).toBe('hello');
  });

  it('renvoie helloEvening le soir et la nuit', () => {
    expect(dayGreetingKey(new Date('2026-09-01T18:00:00'))).toBe('helloEvening');
    expect(dayGreetingKey(new Date('2026-09-01T21:24:00'))).toBe('helloEvening');
    expect(dayGreetingKey(new Date('2026-09-01T04:59:00'))).toBe('helloEvening');
  });
});
