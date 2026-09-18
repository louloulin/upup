import { ensureUpupAgentDir } from './packages/pi-app/src/bootstrap-agent';
import { applyProperLockfileBunShim } from '@upup/pi-runtime/proper-lockfile-bun-shim';
import { createRequire } from 'node:module';
import { types } from 'node:util';
import { writeFileSync } from 'node:fs';

const LOG: string[] = [];
const log = (s: string) => { LOG.push(s); };

ensureUpupAgentDir();
const r = await applyProperLockfileBunShim();
log('shim = ' + JSON.stringify(r));

const base = '/Users/louloulin/.upup/agent/npm/node_modules/proper-lockfile/lib/lockfile.js';
const req = createRequire(base);
for (const id of ['graceful-fs', 'graceful-fs/graceful-fs.js', 'proper-lockfile', 'proper-lockfile/lib/mtime-precision']) {
  try { log(`resolve(${id}) = ${req.resolve(id)}`); }
  catch (e) { log(`resolve(${id}) FAIL: ${(e as Error).message.split('\n')[0]}`); }
}
// In the real binary this is what lockfile.js does:
try {
  const gfs: any = req('graceful-fs');
  log(`user-tree graceful-fs typeof=${typeof gfs} isProxy=${types.isProxy(gfs)} gracefulify=${typeof gfs.gracefulify} sameAsNodeFs=${gfs === require('node:fs')}`);
  const s = Symbol('probe');
  try {
    Object.defineProperty(gfs, s, { value: 'ms' });
    log(`  define+read1 = ${gfs[s]}`);
    log(`  read2 = ${gfs[s]}`);
    log(`  read3 = ${gfs[s]}`);
  } catch (e) { log(`  PROXY CRASH: ${(e as Error).constructor.name}: ${(e as Error).message}`); }
} catch (e) { log(`user-tree graceful-fs FAIL: ${(e as Error).message.split('\n')[0]}`); }

// Was the shim actually in the cache?
try {
  const mtimePath = req.resolve('proper-lockfile/lib/mtime-precision');
  const cached = (req as any).cache?.[mtimePath];
  log(`cache has mtime entry = ${Boolean(cached)}`);
  if (cached) log(`  probe marked = ${Boolean(cached.exports?.probe?.mark ?? cached.exports?.probe?.[Symbol.for('upup.proper-lockfile.bun-shim')])}`);
} catch (e) { log('cache probe FAIL: ' + (e as Error).message.split('\n')[0]); }

await import('@earendil-works/pi-coding-agent');
log('pi-coding-agent imported');

// After Pi loads, re-check.
try {
  const gfs2: any = req('graceful-fs');
  log(`post-pi graceful-fs isProxy=${types.isProxy(gfs2)}`);
} catch (e) { log('post-pi graceful-fs FAIL: ' + (e as Error).message.split('\n')[0]); }

writeFileSync('/tmp/plrepro/diag.log', LOG.join('\n') + '\n');
