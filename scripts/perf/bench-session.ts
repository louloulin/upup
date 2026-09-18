import { getInvestmentAgentSpec } from '../../packages/pi-investment-workflow/src/index';
import { PiAgentSessionFactory } from '../../packages/pi-session/src/index';
import { bootstrapPiNativeServices } from '../../packages/pi-app/src/default';

const t0 = Date.now();
bootstrapPiNativeServices();
console.log(`bootstrapPiNativeServices: ${Date.now() - t0}ms`);

const mk = (tools: string[]) => new PiAgentSessionFactory().createSession({
  ...getInvestmentAgentSpec('invest-explore'),
  packages: ['@upup/pi-market-data'],
  skills: [],
  tools,
}, {
  cwd: '/Users/louloulin/appx/upup',
  piPackagePaths: ['../../packages/pi-market-data'],
  piPackageTrust: {
    trustedPaths: ['../../packages/pi-market-data'],
    pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@earendil-works/pi-coding-agent': '0.85.1', typebox: '1.3.7' },
    allowedSources: { '@upup/pi-market-data': ['builtin:upup'] },
  },
});

for (let i = 1; i <= 3; i += 1) {
  const t = Date.now();
  const s = await mk(['get_sector_data']);
  console.log(`createSession #${i}: ${Date.now() - t}ms`);
  s.dispose();
}

const t2 = Date.now();
const s = await mk(['get_sector_data']);
console.log(`session ready (for latency tests): ${Date.now() - t2}ms`);
const t3 = Date.now();
s.getAvailableToolNames();
console.log(`getAvailableToolNames: ${Date.now() - t3}ms`);
console.log(`rss=${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB heap=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
s.dispose();
process.exit(0);
