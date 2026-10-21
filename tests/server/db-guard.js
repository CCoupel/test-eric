// Garde-fou : le setup global fait DROP SCHEMA public → uniquement sur une base dont le nom finit par `_test`.
export function assertSafeToReset(url, env = process.env) {
  if (env.ALLOW_DB_RESET === '1') return;
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL illisible : reset de la base refusé.');
  }
  if (!name.endsWith('_test')) {
    throw new Error(
      `Reset refusé : la base « ${name} » ne finit pas par _test (DROP SCHEMA public détruirait ses données). ` +
        'Utiliser une base dédiée aux tests, ou ALLOW_DB_RESET=1 pour forcer.',
    );
  }
}
