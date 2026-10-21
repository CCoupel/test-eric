// Integration (scope security) : cas negatifs auth — cookie altere/forge, Origin etranger (CSRF), enumeration d'e-mails.
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  hasDb, makeApp, closeApp, resetData, createUser, login, expectError, validActivity, BASE_URL,
} from '../../_support/harness.js';

const EMAIL = 'marie@club.fr';
const PASSWORD = 'motdepasse-solide-1';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const forge = (header, payload, secret) => {
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = secret ? crypto.createHmac('sha256', secret).update(data).digest('base64url') : '';
  return `${data}.${sig}`;
};

describe.skipIf(!hasDb)('Auth - securite', () => {
  let ctx;
  let userId;
  let cookie;
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    userId = await createUser(ctx.pool, { email: EMAIL, password: PASSWORD });
    cookie = await login(ctx.app, EMAIL, PASSWORD);
  });
  afterAll(() => closeApp(ctx));

  describe('cookie de session invalide', () => {
    const me = (c) => request(ctx.app).get('/api/auth/me').set('Cookie', c);

    it('signature alteree -> 401', async () => {
      const value = cookie.slice('sid='.length);
      const last = value.slice(-1) === 'A' ? 'B' : 'A';
      expectError(await me(`sid=${value.slice(0, -1)}${last}`), 401, 'unauthenticated');
    });

    it('valeur quelconque -> 401', async () => {
      expectError(await me('sid=n-importe-quoi'), 401, 'unauthenticated');
    });

    it('JWT alg=none -> 401', async () => {
      const token = forge({ alg: 'none', typ: 'JWT' }, { sub: userId, id: userId, exp: 4102444800 }, null);
      expectError(await me(`sid=${token}`), 401, 'unauthenticated');
    });

    it('JWT signe avec un autre secret -> 401', async () => {
      const token = forge({ alg: 'HS256', typ: 'JWT' }, { sub: userId, id: userId, exp: 4102444800 }, 'autre-secret');
      expectError(await me(`sid=${token}`), 401, 'unauthenticated');
    });
  });

  describe('verification Origin sur methodes non sures (CSRF)', () => {
    it('POST /api/activities avec Origin etranger -> 403 forbidden', async () => {
      const res = await request(ctx.app)
        .post('/api/activities').set('Cookie', cookie).set('Origin', 'https://evil.example').send(validActivity());
      expectError(res, 403, 'forbidden');
    });

    it('POST /api/auth/logout avec Origin etranger -> 403 forbidden', async () => {
      const res = await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', 'https://evil.example');
      expectError(res, 403, 'forbidden');
    });

    it("POST avec l'Origin de l'application -> accepte", async () => {
      const res = await request(ctx.app)
        .post('/api/activities').set('Cookie', cookie).set('Origin', BASE_URL).send(validActivity());
      expect(res.status).toBe(201);
    });

    it("methode sure (GET) avec Origin etranger -> non bloquee", async () => {
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie).set('Origin', 'https://evil.example');
      expect(res.status).toBe(200);
    });
  });

  describe("enumeration de comptes", () => {
    it('e-mail inconnu et mot de passe faux : meme statut, meme corps', async () => {
      const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'inconnu@club.fr', password: 'x-x-x-x' });
      const wrong = await request(ctx.app).post('/api/auth/login').send({ email: EMAIL, password: 'x-x-x-x' });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
    });
  });

  describe('injection', () => {
    it("charge SQL dans l'e-mail -> jamais 200 ni 500", async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: "' OR 1=1 --", password: "' OR '1'='1" });
      expect([400, 401]).toContain(res.status);
    });
  });
});
