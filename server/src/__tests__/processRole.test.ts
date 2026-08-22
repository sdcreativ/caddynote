import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { parseProcessRole, shouldRunJobs, shouldServeHttp } from '../lib/processRole.js';

describe('Rôle du process (HTTP vs jobs)', () => {
  const originalRole = process.env.CADDYNOTE_PROCESS_ROLE;

  afterEach(() => {
    if (originalRole === undefined) delete process.env.CADDYNOTE_PROCESS_ROLE;
    else process.env.CADDYNOTE_PROCESS_ROLE = originalRole;
  });

  it('parseProcessRole : défaut all, valeurs connues, repli si invalide', () => {
    expect(parseProcessRole(undefined)).toBe('all');
    expect(parseProcessRole('')).toBe('all');
    expect(parseProcessRole('API')).toBe('api');
    expect(parseProcessRole(' worker ')).toBe('worker');
    expect(parseProcessRole('all')).toBe('all');
    expect(parseProcessRole('scheduler')).toBe('all');
  });

  it('all sert HTTP et jobs ; api seulement HTTP ; worker seulement jobs', () => {
    expect(shouldServeHttp('all')).toBe(true);
    expect(shouldRunJobs('all')).toBe(true);
    expect(shouldServeHttp('api')).toBe(true);
    expect(shouldRunJobs('api')).toBe(false);
    expect(shouldServeHttp('worker')).toBe(false);
    expect(shouldRunJobs('worker')).toBe(true);
  });

  it('GET /health expose le rôle et les capacités de ce process', async () => {
    process.env.CADDYNOTE_PROCESS_ROLE = 'api';
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.processRole).toBe('api');
    expect(res.body.http).toBe(true);
    expect(res.body.jobs).toBe(false);
    expect(res.body.databaseTarget).toEqual(
      expect.objectContaining({
        host: expect.any(String),
        port: expect.any(Number),
        database: expect.any(String),
        profile: expect.any(String),
      })
    );
    expect(res.body.databaseTarget).not.toHaveProperty('password');
  });

  it('GET /metrics publie les jauges de rôle après /health', async () => {
    delete process.env.METRICS_TOKEN;
    process.env.CADDYNOTE_PROCESS_ROLE = 'worker';
    await request(app).get('/health');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('caddynote_http_enabled 0');
    expect(res.text).toContain('caddynote_jobs_enabled 1');
  });
});
