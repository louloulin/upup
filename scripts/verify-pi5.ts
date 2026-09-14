import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Check = {
  id: `A${number}`;
  name: string;
  command?: string;
  args?: string[];
  commands?: readonly (readonly string[])[];
  verify?: () => void;
};

const root = process.cwd();

async function runCommand(check: Check): Promise<void> {
  if (check.verify) {
    check.verify();
    return;
  }
  const commands = check.commands ?? [[check.command!, ...(check.args ?? [])]];
  for (const command of commands) {
    const proc = Bun.spawn(command, {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      const output = `${stdout}\n${stderr}`.trim().slice(-4000);
      throw new Error(`${command.join(' ')} exited with ${exitCode}${output ? `\n${output}` : ''}`);
    }
  }
}

function verifyArchitectureDocs(): void {
  const requiredDocs = [
    'docs/architecture/pi5-runtime.md',
    'docs/architecture/plugin-ecosystem.md',
    'docs/architecture/finance-dataflow.md',
    'docs/architecture/session-lifecycle.md',
    'docs/architecture/multi-agent-dataflow.md',
    'docs/architecture/invest-workflow.md',
  ];
  for (const relativePath of requiredDocs) {
    if (!existsSync(join(root, relativePath))) throw new Error(`missing architecture document: ${relativePath}`);
  }
  const plan = readFileSync(join(root, 'pi5.md'), 'utf8');
  for (const marker of ['A1', 'A20', 'Pi Runtime', 'Pi Package', '独立语义验证']) {
    if (!plan.includes(marker)) throw new Error(`pi5.md is missing required marker: ${marker}`);
  }
  const packageManifest = JSON.parse(readFileSync(join(root, 'packages/pi-finance-sdk/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(packageManifest.pi?.[resourceKind]) || packageManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`finance Pi package does not declare ${resourceKind}`);
    }
  }
  const marketDataManifest = JSON.parse(readFileSync(join(root, 'packages/pi-market-data/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(marketDataManifest.pi?.[resourceKind]) || marketDataManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`market-data Pi package does not declare ${resourceKind}`);
    }
  }
  const marketDataExtension = readFileSync(join(root, 'packages/pi-market-data/extensions/index.ts'), 'utf8');
  for (const toolName of ['stock_screener', 'screen_astocks', 'get_sector_data', 'get_market_structure', 'get_technical_data', 'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days']) {
    if (!marketDataExtension.includes(`name: '${toolName}'`)) throw new Error(`market-data native calendar tool is not registered: ${toolName}`);
  }
  const ownership = readFileSync(join(root, 'src/runtime/pi/package-tool-ownership.ts'), 'utf8');
  if (!ownership.includes('packageProvidesNativeTool') || !ownership.includes("'check_trading_day'")) {
    throw new Error('market-data native ownership boundary is missing');
  }
  const investmentAnalysisManifest = JSON.parse(readFileSync(join(root, 'packages/pi-investment-analysis/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(investmentAnalysisManifest.pi?.[resourceKind]) || investmentAnalysisManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`investment-analysis Pi package does not declare ${resourceKind}`);
    }
  }
  const riskManifest = JSON.parse(readFileSync(join(root, 'packages/pi-risk/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(riskManifest.pi?.[resourceKind]) || riskManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`risk Pi package does not declare ${resourceKind}`);
    }
  }
  const portfolioManifest = JSON.parse(readFileSync(join(root, 'packages/pi-portfolio/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(portfolioManifest.pi?.[resourceKind]) || portfolioManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`portfolio Pi package does not declare ${resourceKind}`);
    }
  }
  const backtestManifest = JSON.parse(readFileSync(join(root, 'packages/pi-backtest/package.json'), 'utf8')) as {
    pi?: Record<string, unknown>;
  };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(backtestManifest.pi?.[resourceKind]) || backtestManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`backtest Pi package does not declare ${resourceKind}`);
    }
  }
  const platformManifest = JSON.parse(readFileSync(join(root, 'packages/pi-platform/package.json'), 'utf8')) as { pi?: Record<string, unknown> };
  for (const resourceKind of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals']) {
    if (!Array.isArray(platformManifest.pi?.[resourceKind]) || platformManifest.pi?.[resourceKind].length === 0) {
      throw new Error(`platform Pi package does not declare ${resourceKind}`);
    }
  }
}

const checks: readonly Check[] = [
  { id: 'A1', name: 'Pi Runtime 唯一入口', command: 'bun', args: ['test', 'src/runtime/pi/production-entry-contract.test.ts'] },
  { id: 'A2', name: '旧 Agent/LangChain/Paperclip 退出', command: 'bun', args: ['run', 'check:pi-migration'] },
  { id: 'A3', name: 'Pi 版本与 Node/Bun 运行时', command: 'bun', args: ['run', 'check:pi-runtime'] },
  { id: 'A4', name: 'Runtime Adapter 唯一 Factory', command: 'bun', args: ['test', 'src/runtime/pi/agent-session-factory.test.ts'] },
  { id: 'A5', name: 'UpUpAgentSpec 完整序列化', command: 'bun', args: ['test', 'src/runtime/pi/agent-spec.test.ts', 'src/runtime/pi/agent-catalog.test.ts'] },
  { id: 'A6', name: 'Pi 多轮 Tool/stream/abort/error loop', command: 'bun', args: ['test', 'src/runtime/pi/pi-fixture.test.ts', 'src/runtime/pi/event-stream.test.ts'] },
  { id: 'A7', name: 'Pi Model/Provider protocol', command: 'bun', args: ['test', 'src/runtime/pi/runner.test.ts', 'src/runtime/pi/reliability.test.ts'] },
  { id: 'A8', name: 'Pi Session tree/compact/recovery', commands: [['bun', '--cwd', 'packages/pi-session', 'test'], ['bun', 'test', 'src/runtime/pi/finance-context.test.ts', 'src/runtime/pi/reliability.test.ts']] },
  { id: 'A9', name: '五类金融 Tool Adapter', command: 'bun', args: ['test', 'src/runtime/pi/pi-fixture.test.ts', 'src/extensions/upup/index.test.ts'] },
  { id: 'A10', name: '金融 evidence/audit 脱敏', command: 'bun', args: ['test', 'src/runtime/pi/production-finance-contract.test.ts', 'src/runtime/pi/citation.test.ts'] },
  { id: 'A11', name: '投资 Profile allowlist', command: 'bun', args: ['test', 'src/runtime/pi/profile-registry-contract.test.ts', 'src/runtime/pi/agent-session-factory.test.ts'] },
  { id: 'A12', name: 'Pi Package/Extension/Skill/Prompt 生态', commands: [
    ['bun', 'run', 'check:pi-packages'],
    ['bun', '--cwd', 'packages/pi-finance-sdk', 'test'],
    ['bun', '--cwd', 'packages/pi-market-data', 'test'],
    ['bun', '--cwd', 'packages/pi-investment-analysis', 'test'],
    ['bun', '--cwd', 'packages/pi-risk', 'test'],
    ['bun', '--cwd', 'packages/pi-portfolio', 'test'],
    ['bun', '--cwd', 'packages/pi-backtest', 'test'],
    ['bun', '--cwd', 'packages/pi-platform', 'test'],
    ['bun', '--cwd', 'packages/pi-session', 'test', 'src/runtime/pi/package-catalog.test.ts', 'src/runtime/pi/package-tool-ownership.test.ts', 'src/runtime/pi/agent-spec.test.ts', 'src/runtime/pi/agent-session-factory.test.ts', 'packages/pi-finance-sdk/extensions/index.test.ts', 'packages/pi-risk/extensions/index.test.ts', 'packages/pi-portfolio/extensions/index.test.ts', 'packages/pi-backtest/extensions/index.test.ts', 'packages/pi-platform/extensions/index.test.ts'],
  ] },
  { id: 'A13', name: '四级金融权限策略', command: 'bun', args: ['test', 'src/runtime/pi/tool-contract.test.ts', 'src/runtime/pi/production-finance-contract.test.ts'] },
  { id: 'A14', name: '插件来源/沙箱/网络/凭证审计', command: 'bun', args: ['test', 'src/runtime/pi/plugin-trust.test.ts', 'src/runtime/pi/plugin-adapter.test.ts', 'src/runtime/pi/package-config.test.ts'] },
  { id: 'A15', name: '旧 Session → Pi 迁移', command: 'bun', args: ['test', 'src/session/pi-migration.test.ts'] },
  { id: 'A16', name: '/invest 五阶段状态机与命名投研场景', command: 'bun', args: ['test', 'src/runtime/pi/investment-workflow.test.ts', 'src/runtime/pi/investment-scenarios.pi.test.ts'] },
  { id: 'A17', name: 'Pi 多 Agent worker 生命周期', command: 'bun', args: ['test', 'src/runtime/pi/agent-session-factory.test.ts', 'packages/pi-platform/extensions/index.test.ts'] },
  { id: 'A18', name: 'CLI/Gateway/Cron/Daemon/Bridge/SDK/Eval 入口与命名场景', command: 'bun', args: ['test', 'src/runtime/pi/production-entry-contract.test.ts', 'src/gateway/agent-runner.pi.test.ts', 'src/cron/executor.pi.test.ts', 'src/controllers/agent-runner.pi.test.ts', 'src/components/chat-log.pi.test.ts', 'src/runtime/pi/investment-scenarios.pi.test.ts'] },
  {
    id: 'A19',
    name: '全部 Pi 迁移、类型与性能恢复门禁',
    commands: [
      ['bun', 'run', 'check:pi-migration'],
      ['bun', 'run', 'check:pi-packages'],
      ['bun', 'run', 'check:pi-runtime'],
      ['bun', 'run', 'typecheck'],
      ['bun', 'run', 'benchmark:pi5'],
    ],
  },
  { id: 'A20', name: '架构文档与 Pi 资源留档', verify: verifyArchitectureDocs },
];

const failures: Array<{ id: string; name: string; error: string }> = [];
for (const check of checks) {
  const startedAt = Date.now();
  try {
    await runCommand(check);
    console.log(`PASS ${check.id} ${check.name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: check.id, name: check.name, error: message });
    console.error(`FAIL ${check.id} ${check.name}\n${message}`);
  }
}

const passed = checks.length - failures.length;
console.log(`\nPi5 semantic acceptance: ${passed}/${checks.length} passed.`);
if (failures.length > 0) {
  console.error(`Failed acceptance IDs: ${failures.map(({ id }) => id).join(', ')}`);
  process.exit(1);
}
