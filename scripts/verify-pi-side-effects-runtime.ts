import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { getPiNativeApp } from '@upup/pi-app/default';

type AuditEntry = { decision?: string; tool?: string; effect?: string };
type CustomEntry = { data?: AuditEntry };
type ToolResult = { isError?: boolean; details?: { policyAudit?: AuditEntry }; content: readonly { type: string; text?: string }[] };

const cases = [
  { packageName: '@upup/pi-config', tool: 'config_set', input: { key: 'runtime.audit', value: true }, decision: 'denied', effect: 'filesystem-write' },
  { packageName: '@upup/pi-platform', tool: 'write_file', input: { path: 'blocked.txt', content: 'must not be written', confirm: true }, decision: 'approval_denied', effect: 'filesystem-write' },
  { packageName: '@upup/pi-platform', tool: 'mcp_auth_get', input: { server_name: 'blocked' }, decision: 'denied', effect: 'credential-access' },
  { packageName: '@upup/pi-notify', tool: 'notify', input: { channel: 'log', title: 'blocked', message: 'must not send' }, decision: 'approval_denied', effect: 'external-network' },
  { packageName: '@upup/pi-finance-sdk', tool: 'place_trade_order', input: { symbol: 'AAPL', side: 'buy', quantity: 1, type: 'market' }, decision: 'denied', effect: 'financial-write' },
] as const;

const text = (result: ToolResult): string => result.content.find((part) => part.type === 'text')?.text ?? '';

const root = await mkdtemp(join(process.cwd(), '.upup', 'pi-side-effects-runtime-'));
const app = getPiNativeApp();
try {
  const factory = app.getSessionFactory();
  const results: Array<Record<string, unknown>> = [];
  for (const current of cases) {
    const session = await factory.createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: `side-effects-${current.tool.replaceAll('_', '-')}`,
      packages: [current.packageName],
      skills: [],
      tools: [current.tool],
    }, { cwd: root, sessionPath: join(root, `${current.tool}.jsonl`) });
    try {
      const result = await session.executeTool(current.tool, `runtime-${current.tool}`, current.input) as ToolResult;
      const audits = session.getCustomEntries('upup_pi_policy_audit').map((entry) => (entry as CustomEntry).data ?? {}) as AuditEntry[];
      const audit = audits.at(-1);
      if (!result.isError || !audit || audit.tool !== current.tool || audit.effect !== current.effect || audit.decision !== current.decision) {
        throw new Error(`runtime side-effect policy mismatch for ${current.tool}: ${JSON.stringify({ result, audit })}`);
      }
      results.push({ tool: current.tool, packageName: current.packageName, decision: audit.decision, effect: audit.effect, auditCount: audits.length });
    } finally {
      session.dispose();
    }
  }
  if (existsSync(join(root, 'blocked.txt'))) throw new Error('runtime side-effect smoke wrote a blocked file');
  if (existsSync(join(root, 'mcp-auth'))) throw new Error('runtime side-effect smoke created credential state');
  console.log(JSON.stringify({ schema: 'upup.pi.side-effects-runtime.v1', status: 'passed', fixtureOnly: true, results }, null, 2));
} finally {
  await app.dispose();
  await rm(root, { recursive: true, force: true });
}
