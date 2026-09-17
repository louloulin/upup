import { createRequire } from 'node:module';
import { types } from 'node:util';
import gfsEmbedded from 'graceful-fs';
import * as php from 'proper-lockfile';

console.log('embedded proper-lockfile.lock =', typeof php.lock);
console.log('embedded graceful-fs isProxy =', types.isProxy(gfsEmbedded));

// Resolution from a foreign base with graceful-fs + proper-lockfile embedded.
const req = createRequire('/tmp/no-such-dir/consumer.js');
for (const id of ['graceful-fs', 'proper-lockfile', 'proper-lockfile/lib/mtime-precision']) {
  try { console.log('foreign-base resolve', id, '=>', req.resolve(id)); }
  catch (e) { console.log('foreign-base resolve', id, '=> FAIL:', (e as Error).message.split('\n')[0]); }
}

// Resolution from the user tree base.
const ureq = createRequire('/Users/louloulin/.upup/agent/npm/node_modules/proper-lockfile/lib/lockfile.js');
for (const id of ['graceful-fs', 'proper-lockfile']) {
  try { const m = ureq(id); console.log('user-tree', id, '=> OK typeof', typeof m, 'isProxy', types.isProxy(m)); }
  catch (e) { console.log('user-tree', id, '=> FAIL:', (e as Error).message.split('\n')[0]); }
}
