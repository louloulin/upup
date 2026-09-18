import { getInvestmentAgentSpec } from '../../packages/pi-investment-workflow/src/index';
import { PiAgentSessionFactory } from '../../packages/pi-session/src/index';
import { bootstrapPiNativeServices } from '../../packages/pi-app/src/default';
bootstrapPiNativeServices();
const rss = () => Math.round(process.memoryUsage().rss / 1024 / 1024);
console.log(`startup RSS: ${rss()}MB`);
const sessions = [];
for (let i = 0; i < 5; i += 1) {
  const s = await new PiAgentSessionFactory().createSession({
    ...getInvestmentAgentSpec('invest-explore'),
    packages: ['@upup/pi-market-data'], skills: [],
    tools: ['get_sector_data', 'get_market_structure'],
  }, {
    cwd: '/Users/louloulin/appx/upup',
    piPackagePaths: ['../../packages/pi-market-data'],
    piPackageTrust: {
      trustedPaths: ['../../packages/pi-market-data'],
      pinnedPackages: { '@upup/pi-market-data': '0.1.0', '@earendil-works/pi-coding-agent': '0.85.1', typebox: '1.3.7' },
      allowedSources: { '@upup/pi-market-data': ['builtin:upup'] },
    },
  });
  sessions.push(s);
  console.log(`after session #${i + 1}: RSS ${rss()}MB  (heapUsed ${Math.round(process.memoryUsage().heapUsed/1024/1024)}MB)`);
}
for (const s of sessions) s.dispose();
console.log(`after disposing all: RSS ${rss()}MB`);
process.exit(0);
