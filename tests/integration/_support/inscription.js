// Support LOT-3 : activite ouverte + inscriptions publiques (pas de test ici).
import request from 'supertest';
import { makeApp, resetData, createUser, login, validActivity, BASE_URL } from './harness.js';

export const EMAIL_RESP = 'marie@club.fr';
export const PWD_RESP = 'motdepasse-solide-1';

/** App + responsable connecte. Retourne { app, pool, cookie, api(method,url) } ; mutations avec Origin (regle F1). */
export async function setup(options) {
  const ctx = await makeApp(options);
  await resetData(ctx.pool);
  await createUser(ctx.pool, { email: EMAIL_RESP, password: PWD_RESP, name: 'Marie Dupont' });
  ctx.cookie = await login(ctx.app, EMAIL_RESP, PWD_RESP);
  ctx.api = (method, url) => request(ctx.app)[method](url).set('Cookie', ctx.cookie).set('Origin', BASE_URL);
  return ctx;
}

export async function newActivity(ctx, { open = true, ...over } = {}) {
  const { activity } = (await ctx.api('post', '/api/activities').send(validActivity(over))).body;
  if (open) await ctx.api('post', `/api/activities/${activity.id}/open`);
  return activity;
}

export const registrationBody = (over = {}) => ({
  participant_name: 'Leo Martin',
  is_minor: true,
  contact_name: 'Sophie Martin',
  contact_email: 'sophie.martin@mail.fr',
  consent: true,
  ...over,
});

/** Inscription publique (sans cookie, Origin du navigateur). */
export const register = (ctx, slug, over) =>
  request(ctx.app).post(`/api/public/activities/${slug}/registrations`).set('Origin', BASE_URL).send(registrationBody(over));

export const tokenOf = (res) => res.body.manage_url.split('/r/')[1];
export const publicGet = (ctx, url) => request(ctx.app).get(url);
export const publicDelete = (ctx, url) => request(ctx.app).delete(url).set('Origin', BASE_URL);
