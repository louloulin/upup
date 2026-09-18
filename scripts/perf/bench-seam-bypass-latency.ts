import { resolveEastmoneyUsSecid } from '../../packages/pi-market-data/src/screen-eastmoney';
// The real network call that quote.ts:433 makes behind the test's back.
const times: number[] = [];
for (let i = 0; i < 6; i += 1) {
  const t = Date.now();
  try { await resolveEastmoneyUsSecid('AAPL'); } catch {}
  const ms = Date.now() - t;
  times.push(ms);
  console.log(`call ${i + 1}: ${ms}ms`);
  await new Promise((r) => setTimeout(r, 700));
}
console.log(`\nmin=${Math.min(...times)}ms max=${Math.max(...times)}ms  <-- test timeout is 5000ms`);
