import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnPiRpcStdio } from './pi-rpc-stdio-client';
const dir = await mkdtemp(join(process.cwd(), '.upup', 'smoke2-'));
const client = spawnPiRpcStdio({ root: process.cwd(), env: { UPUP_SESSION_DIR: dir } });
client.write('{not-json}');
try {
  const r = await client.call({ type: 'get_state' });
  console.log('OK', JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log('ERR', (e as Error).message);
  console.log('FRAMES', JSON.stringify(client.frames()).slice(0, 800));
  console.log('STDERR tail', client.stderr().slice(-600));
}
await client.close();
