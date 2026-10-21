// Integration : authentification (contracts/http-endpoints.md, section Authentification).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, createUser, sidCookie, login, expectError, BASE_URL } from '../../_support/harness.js';

const EMAIL = 'marie@club.fr';
const PASSWORD = 'motdepasse-solide-1';

describe.skipIf(!hasDb)('Auth - login / me / logout', () => {
  let ctx;
  let userId;
  let cookie; // un seul login de preparation : le login est limite a 10/min/IP
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    userId = await createUser(ctx.pool, { email: EMAIL, password: PASSWORD, name: 'Marie Dupont' });
    cookie = await login(ctx.app, EMAIL, PASSWORD);
  });
  afterAll(() => closeApp(ctx));

  describe('POST /api/auth/login', () => {
    it('200 + utilisateur sans hash, cookie sid HttpOnly SameSite=Lax', async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: userId, email: EMAIL, name: 'Marie Dupont', role: 'manager' });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
      const cookie = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('sid='));
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it("l'e-mail est insensible a la casse", async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: 'MARIE@Club.FR', password: PASSWORD });
      expect(res.status).toBe(200);
    });

    it('401 invalid_credentials si mot de passe faux, sans cookie', async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: 'faux' });
      expectError(res, 401, 'invalid_credentials');
      expect(sidCookie(res)).toBeNull();
    });

    it('401 invalid_credentials si e-mail inconnu', async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: 'inconnu@club.fr', password: PASSWORD });
      expectError(res, 401, 'invalid_credentials');
    });
  });

  describe('GET /api/auth/me', () => {
    it('200 avec session valide', async () => {
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: userId, email: EMAIL, name: 'Marie Dupont', role: 'manager' });
    });

    it('401 unauthenticated sans cookie', async () => {
      const res = await request(ctx.app).get('/api/auth/me');
      expectError(res, 401, 'unauthenticated');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('204 et le cookie sid est efface', async () => {
      const res = await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', BASE_URL);
      expect(res.status).toBe(204);
      const set = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));
      expect(set).toBeDefined();
      expect(set).toMatch(/^sid=;|Expires=Thu, 01 Jan 1970|Max-Age=0/i);
    });

    it('401 sans session', async () => {
      const res = await request(ctx.app).post('/api/auth/logout');
      expectError(res, 401, 'unauthenticated');
    });
  });
});
