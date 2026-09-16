import { spawnPiRpcStdio } from './pi-rpc-stdio-client';
const client = spawnPiRpcStdio({ root: process.cwd(), env: { UPUP_SESSION_DIR: '/tmp/upup-rpc-smoke' } });
client.write('{not-json}');
const response = await client.call({ type: 'get_state' });
console.log('RESULT', JSON.stringify(response).slice(0, 400));
console.log('FRAMES', client.frames().length);
const code = await client.close();
console.log('EXIT', code);
