// Integration : validation stricte de POST /api/mailings (E1 : injection d'en-tetes, champs fournis par le client).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { mailingSetup, uniq } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Mailing - validation', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await mailingSetup();
  });
  afterAll(() => closeApp(ctx));

  const nombre = async () => (await ctx.pool.query('SELECT count(*)::int AS n FROM mailings')).rows[0].n;

  it.each([
    ['sujet vide', { subject: '' }],
    ['sujet absent', { subject: undefined }],
    ['sujet > 200 caracteres', { subject: 'x'.repeat(201) }],
    ['sujet avec CRLF (injection d\'en-tete)', { subject: 'Bonjour\r\nBcc: victime@mail.fr' }],
    ['sujet avec LF', { subject: 'ligne 1\nligne 2' }],
    ['sujet avec CR', { subject: 'ligne 1\rligne 2' }],
    ['sujet avec tabulation', { subject: 'a\tb' }],
    ['sujet avec NUL', { subject: 'a\u0000b' }],
    ['sujet avec separateur de ligne U+2028', { subject: 'a b' }],
    ['sujet non texte', { subject: 42 }],
    ['corps vide', { body: '' }],
    ['corps absent', { body: undefined }],
    ['corps > 20000 caracteres', { body: 'x'.repeat(20001) }],
    ['activity_ids vide', { activity_ids: [] }],
    ['activity_ids absent', { activity_ids: undefined }],
    ['activity_ids non uuid', { activity_ids: ['abc'] }],
    ['activity_ids en doublon', { activity_ids: ['ID', 'ID'] }],
    ['plus de 20 activites', { activity_ids: Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }],
    ['champ from fourni par le client', { from: 'pirate@evil.example' }],
    ['champ to', { to: 'victime@mail.fr' }],
    ['champ bcc', { bcc: 'victime@mail.fr' }],
    ['champ cc', { cc: 'victime@mail.fr' }],
    ['champ reply_to', { reply_to: 'pirate@evil.example' }],
    ['champ headers', { headers: { Bcc: 'victime@mail.fr' } }],
  ])('400 validation_error : %s', async (_nom, over) => {
    const base = ctx.body();
    const body = { ...base, ...over };
    if (body.activity_ids?.[0] === 'ID') body.activity_ids = [ctx.activity.id, ctx.activity.id];
    const avant = await nombre();
    const res = await ctx.send(body);
    expectError(res, 400, 'validation_error');
    expect(typeof res.body.message).toBe('string');
    expect(await nombre()).toBe(avant);
  });

  it('corps JSON invalide : 400', async () => {
    const res = await ctx.api('post', '/api/mailings').set('Content-Type', 'application/json').send('{pas du json');
    expectError(res, 400, 'validation_error');
  });

  it('sujet de 200 caracteres et corps de 20000 caracteres acceptes', async () => {
    const res = await ctx.send(ctx.body({ subject: `${uniq()}`.padEnd(200, 'x'), body: 'y'.repeat(20000) }));
    expect(res.status).toBe(201);
  });

  it('corps multi-ligne CRLF accepte (sauts de ligne normalises)', async () => {
    const res = await ctx.send(ctx.body({ body: 'ligne 1\r\n\r\nligne 2\r\nligne 3' }));
    expect(res.status).toBe(201);
    const { rows } = await ctx.pool.query('SELECT body FROM mailings WHERE id = $1', [res.body.mailing.id]);
    expect(rows[0].body).not.toContain('\r');
  });

  it('caracteres speciaux et accents acceptes dans le sujet', async () => {
    const res = await ctx.send(ctx.body({ subject: `${uniq('Réunion')} : <b>éàü</b> & « guillemets »` }));
    expect(res.status).toBe(201);
  });
});
