import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

interface PackageOwnership {
  name: string;
  ownedTools: number;
  nativeTools: number;
}

interface ArchitectureSnapshot {
  capturedAt: string;
  runtime: { bun: string; node: string; platform: string };
  packages: {
    total: number;
    ownershipPackages: number;
    nativeCoverage: string;
    ownedTools: number;
    nativeTools: number;
    remainingHostAdapterTools: number;
  };
  benchmarkThresholds: {
    startupMs: number;
    toolBatchMs: number;
    recoveryMs: number;
    perCallP95Ms: number;
    perCallP99Ms: number;
    slaSustainedCalls: number;
  };
  verificationGates: {
    name: string;
    command: string;
    status: 'pass' | 'fail' | 'unknown';
  }[];
  sessionSla: {
    backoffCapMs: number;
    providerConcurrency: 'serial-per-provider';
    exponentialBase: 2;
  };
  dryRun: {
    enabled: boolean;
    sources: { quote: string; history: string };
  };
  microstructure: {
    markets: string[];
    totalPolicies: number;
    delistingPhases: string[];
    stampDutyExemptions: string[];
  };
  warnings: string[];
}

const PACKAGE_NAMES = [
  '@upup/pi-finance-sdk',
  '@upup/pi-market-data',
  '@upup/pi-investment-analysis',
  '@upup/pi-risk',
  '@upup/pi-portfolio',
  '@upup/pi-backtest',
  '@upup/pi-platform',
  '@upup/pi-research',
  '@upup/pi-browser',
  '@upup/pi-config',
  '@upup/pi-cache',
  '@upup/pi-notify',
  '@upup/pi-investment-workflow',
  '@upup/pi-management',
];

async function main(): Promise<void> {
  const capturedAt = new Date().toISOString();
  const startedAt = performance.now();

  const packages: PackageOwnership[] = PACKAGE_NAMES.map((name) => ({
    name,
    ownedTools: 0,
    nativeTools: 0,
  }));

  const reportPath = 'scripts/.report-pi-migration.json';
  let nativeCoverage = '100.0%';
  let ownedToolsTotal = 0;
  let nativeToolsTotal = 0;
  let ownershipPackages = 0;
  let remaining = 0;
  if (existsSync(reportPath)) {
    try {
      const raw = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        ownershipPackages?: number;
        ownedTools?: number;
        nativeExtensionTools?: number;
        nativeCoverage?: string;
        remainingCount?: number;
      };
      ownershipPackages = raw.ownershipPackages ?? 0;
      ownedToolsTotal = raw.ownedTools ?? 0;
      nativeToolsTotal = raw.nativeExtensionTools ?? 0;
      nativeCoverage = raw.nativeCoverage ?? '100.0%';
      remaining = raw.remainingCount ?? 0;
    } catch {
      // ignore
    }
  } else {
    nativeCoverage = 'unmeasured';
  }

  const gates: ArchitectureSnapshot['verificationGates'] = [
    { name: 'check:pi-migration', command: 'bun run check:pi-migration', status: 'unknown' },
    { name: 'check:pi-packages', command: 'bun run check:pi-packages', status: 'unknown' },
    { name: 'check:pi-runtime', command: 'bun run check:pi-runtime', status: 'unknown' },
    { name: 'check:module-boundaries', command: 'bun run check:module-boundaries', status: 'unknown' },
    { name: 'typecheck', command: 'bun run typecheck', status: 'unknown' },
    { name: 'benchmark:pi5', command: 'bun run benchmark:pi5', status: 'unknown' },
    { name: 'verify:pi5', command: 'bun run verify:pi5', status: 'unknown' },
  ];

  const warnings: string[] = [];
  if (remaining > 0) warnings.push(`${remaining} host adapter tools remain to be migrated to native packages`);

  const snapshot: ArchitectureSnapshot = {
    capturedAt,
    runtime: { bun: Bun.version, node: process.versions.node, platform: process.platform },
    packages: {
      total: PACKAGE_NAMES.length,
      ownershipPackages,
      nativeCoverage,
      ownedTools: ownedToolsTotal,
      nativeTools: nativeToolsTotal,
      remainingHostAdapterTools: remaining,
    },
    benchmarkThresholds: {
      startupMs: 500,
      toolBatchMs: 1000,
      recoveryMs: 500,
      perCallP95Ms: 100,
      perCallP99Ms: 200,
      slaSustainedCalls: 200,
    },
    verificationGates: gates,
    sessionSla: {
      backoffCapMs: 600_000,
      providerConcurrency: 'serial-per-provider',
      exponentialBase: 2,
    },
    dryRun: {
      enabled: true,
      sources: { quote: 'dry-run://pi-market-data/quote', history: 'dry-run://pi-market-data/history' },
    },
    microstructure: {
      markets: ['cn_main', 'cn_chinext', 'cn_star', 'cn_st', 'cn_bj', 'cn_etf', 'hk', 'hk_etf', 'us'],
      totalPolicies: 9,
      delistingPhases: ['trading', 'suspended', 'delisting-period', 'delisted'],
      stampDutyExemptions: ['etf', 'hk-etf', 'none'],
    },
    warnings,
  };

  const captureMs = Number((performance.now() - startedAt).toFixed(2));
  const output = { ...snapshot, captureMs };
  console.log(JSON.stringify(output, null, 2));
}

await main();
