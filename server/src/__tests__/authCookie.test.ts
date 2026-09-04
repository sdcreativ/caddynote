import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { ACCESS_COOKIE_NAME } from '../lib/accessCookie.js';
import { registerActor, auth } from './fixtures.js';

const cookieFrom = (res: request.Response): string | undefined => {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.find((c) => c.startsWith(`${ACCESS_COOKIE_NAME}=`));
};

describe('Cookie HttpOnly d’accès', () => {
  let email: string;
  let token: string;

  beforeAll(async () => {
    const actor = await registerActor('teacher');
    email = actor.email;
    token = actor.token;
  });

  it('login pose un cookie HttpOnly et GET /auth/me fonctionne sans Bearer', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Password123!' });
    expect(login.status).toBe(200);
    const setCookie = cookieFrom(login);
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).not.toMatch(/SameSite=None/i);

    const me = await request(app).get('/auth/me').set('Cookie', setCookie!);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    // NODE_ENV=test : Bearer encore dans le JSON pour les fixtures / scripts.
    expect(login.body.token).toBeTruthy();
  });

  it('Bearer continue de fonctionner (tests / scripts)', async () => {
    const me = await request(app).get('/auth/me').set(auth(token));
    expect(me.status).toBe(200);
  });

  it('refuse une mutation cookie depuis une origine étrangère', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Password123!' });
    const setCookie = cookieFrom(login);
    const denied = await request(app)
      .post('/auth/logout')
      .set('Cookie', setCookie!)
      .set('Origin', 'https://evil.example');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('csrf');
  });

  it('POST /auth/adopt pose le cookie à partir d’un jeton valide', async () => {
    const adopted = await request(app)
      .post('/auth/adopt')
      .set('Origin', 'http://localhost:8080')
      .send({ token });
    expect(adopted.status).toBe(200);
    expect(cookieFrom(adopted)).toMatch(new RegExp(`^${ACCESS_COOKIE_NAME}=`));
  });

  it('POST /auth/adopt refuse un code inconnu', async () => {
    const denied = await request(app)
      .post('/auth/adopt')
      .set('Origin', 'http://localhost:8080')
      .send({ code: 'abcdefghijklmnopqrstuvwxyz012345' });
    expect(denied.status).toBe(401);
    expect(cookieFrom(denied)).toBeUndefined();
  });

  it('POST /auth/adopt refuse une origine étrangère', async () => {
    const denied = await request(app)
      .post('/auth/adopt')
      .set('Origin', 'https://evil.example')
      .send({ token });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('csrf');
    expect(cookieFrom(denied)).toBeUndefined();
  });
});
