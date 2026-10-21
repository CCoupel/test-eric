// Integration : GET /api/public/activities/:slug (fiche publique ; brouillon invisible).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - fiche publique', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => closeApp(ctx));
  const get = (slug) => request(ctx.app).get(`/api/public/activities/${slug}`);

  it('activite ouverte : 200, champs du contrat, texte de consentement versionne', async () => {
    const a = await newActivity(ctx, { capacity: 20 });
    const res = await get(a.public_slug);
    expect(res.status).toBe(200);
    expect(res.body.activity).toMatchObject({
      title: a.title, description: a.description, location: a.location, status: 'open', capacity: 20, remaining_places: 20, is_full: false,
    });
    expect(new Date(res.body.activity.starts_at).toISOString()).toBe(a.starts_at);
    expect(typeof res.body.consent_text).toBe('string');
    expect(res.body.consent_text.length).toBeGreaterThan(20);
    expect(res.body.consent_version).toBe('2026-10');
  });

  it('ne contient ni id interne, ni owner, ni donnees des inscrits', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    await register(ctx, a.public_slug, { contact_email: 'secret.parent@mail.fr', participant_name: 'Enfant Secret' });
    const res = await get(a.public_slug);
    const txt = JSON.stringify(res.body);
    expect(txt).not.toContain('secret.parent@mail.fr');
    expect(txt).not.toContain('Enfant Secret');
    expect(res.body.activity.remaining_places).toBe(4);
    expect(res.body.activity).not.toHaveProperty('owner');
    expect(res.body.activity).not.toHaveProperty('id');
  });

  it('activite complete : is_full true, remaining_places 0', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    await register(ctx, a.public_slug, { contact_email: 'un@mail.fr' });
    const res = await get(a.public_slug);
    expect(res.body.activity).toMatchObject({ is_full: true, remaining_places: 0 });
  });

  it('activite fermee : fiche visible avec status closed', async () => {
    const a = await newActivity(ctx);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    const res = await get(a.public_slug);
    expect(res.status).toBe(200);
    expect(res.body.activity.status).toBe('closed');
  });

  it('brouillon : 404 not_found (invisible)', async () => {
    const a = await newActivity(ctx, { open: false });
    expectError(await get(a.public_slug), 404, 'not_found');
  });

  it('slug inconnu : 404 not_found', async () => {
    expectError(await get('inconnuinconn'), 404, 'not_found');
  });

  it('accessible sans cookie ; Cache-Control no-store', async () => {
    const a = await newActivity(ctx);
    const res = await get(a.public_slug);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});
