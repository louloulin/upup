import { applyProperLockfileBunShim } from '@upup/pi-runtime/proper-lockfile-bun-shim';
import { createRequire } from 'node:module';
import { types } from 'node:util';
import { writeFileSync } from 'node:fs';

const r = await applyProperLockfileBunShim();
console.log('SHIM RESULT =', JSON.stringify(r));

const req = createRequire('/Users/louloulin/.upup/agent/npm/node_modules/proper-lockfile/lib/lockfile.js');
let lockfile: any;
try { lockfile = req('proper-lockfile'); console.log('proper-lockfile loaded via user tree =', typeof lockfile.lock); }
catch (e) { console.log('proper-lockfile LOAD FAILED:', (e as Error).message); }

const target = '/tmp/plrepro/locktarget2.json';
writeFileSync(target, '{}\n');
if (lockfile) {
  for (let i = 1; i <= 2; i++) {
    try {
      await lockfile.lock(target, { retries: 0, stale: 20000 });
      console.log('lock', i, 'OK');
      await lockfile.unlock(target);
      console.log('unlock', i, 'OK');
    } catch (e) {
      console.log('lock', i, 'CRASH:', (e as Error).constructor.name, (e as Error).message);
      break;
    }
  }
}
