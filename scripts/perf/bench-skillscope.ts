import { PiAgentSessionFactory } from '../../packages/pi-session/src/index';
import { getInvestmentAgentSpec } from '../../packages/pi-investment-workflow/src/index';
import { bootstrapPiNativeServices } from '../../packages/pi-app/src/default';
import { join } from 'node:path';

// Repo root from this file's location, so the script runs from any cwd.
const REPO_ROOT = new URL('../../', import.meta.url).pathname;

bootstrapPiNativeServices();
const base = {
  cwd: REPO_ROOT,
  piPackagePaths: [join(REPO_ROOT, 'packages/pi-market-data'), join(REPO_ROOT, 'packages/pi-finance-sdk')],
  piPackageTrust: {
    trustedPaths: [join(REPO_ROOT, 'packages/pi-market-data'), join(REPO_ROOT, 'packages/pi-finance-sdk')],
    pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.85.1', typebox: '1.3.7' },
    allowedSources: { '@upup/pi-market-data': ['builtin:upup'], '@upup/pi-finance-sdk': ['builtin:upup'] },
  },
};
const run = async (userSkills: 'include' | 'whitelist-only') => {
  const t = Date.now();
  const s = await new PiAgentSessionFactory().createSession({
    ...getInvestmentAgentSpec('invest-explore'),
    packages: ['@upup/pi-market-data', '@upup/pi-finance-sdk'], tools: ['get_sector_data'], userSkills,
  }, base as never);
  const ms = Date.now() - t;
  const rl = (s as unknown as { resourceLoader?: { getSkills(): { skills: { name: string }[] } } }).resourceLoader;
  const n = rl?.getSkills?.().skills?.length ?? -1;
  s.dispose();
  return { ms, n };
};
// warm up (cold JIT + module graph)
await run('include'); await run('whitelist-only');
const inc: number[] = []; const wl: number[] = [];
for (let i = 0; i < 6; i += 1) {
  inc.push((await run('include')).ms);
  wl.push((await run('whitelist-only')).ms);
}
const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
console.log(`userSkills=include        : ${inc.join(', ')}  avg=${avg(inc)}ms  skills=${(await run('include')).n}`);
console.log(`userSkills=whitelist-only : ${wl.join(', ')}  avg=${avg(wl)}ms  skills=${(await run('whitelist-only')).n}`);
process.exit(0);
