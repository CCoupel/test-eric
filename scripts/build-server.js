// build:server — copie src/server → dist/server (JS natif, migrations .sql incluses).
import { cpSync, rmSync } from 'node:fs';

rmSync('dist/server', { recursive: true, force: true });
cpSync('src/server', 'dist/server', { recursive: true });
console.log('dist/server prêt');
