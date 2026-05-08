/**
 * MonitorTool - System monitoring
 *
 * A tool that reports system resource usage including CPU, memory, and uptime.
 * Uses Node.js built-in os module - no external dependencies.
 */

import os from 'os';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// ============================================================================
// Schema & Description
// ============================================================================

export const MonitorToolSchema = z.object({
  /** Type of metric to retrieve */
  metric: z
    .enum(['all', 'cpu', 'memory', 'uptime'])
    .optional()
    .default('all')
    .describe('Type of metric: all, cpu, memory, or uptime'),
});

export type MonitorToolInput = z.infer<typeof MonitorToolSchema>;

export const MONITOR_TOOL_DESCRIPTION = `
Report current system resource usage.

Use this when:
- Checking CPU load and core count
- Checking memory usage (total/free/used)
- Checking system uptime
- Monitoring resource consumption

Returns detailed per-core CPU stats and memory breakdown in human-readable format.

Examples:
- Check CPU load: metric: 'cpu'
- Check memory: metric: 'memory'
- Full system report: metric: 'all' (default)`;

// ============================================================================
// Helper Functions
// ============================================================================

interface CpuCoreInfo {
  model: string;
  speed: number;
  times: {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  };
}

interface CpuSummary {
  model: string;
  cores: number;
  loadAvg: number[];
  detailedCores: Array<{
    core: number;
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  }>;
}

function getCpuInfo(): CpuSummary {
  const cpus: CpuCoreInfo[] = os.cpus();
  const loadAvg = os.loadavg();
  const firstCpu = cpus[0];
  const model = firstCpu?.model ?? 'Unknown';

  const detailedCores = cpus.map((cpu, i) => ({
    core: i,
    user: cpu.times.user,
    nice: cpu.times.nice,
    sys: cpu.times.sys,
    idle: cpu.times.idle,
    irq: cpu.times.irq,
  }));

  return {
    model,
    cores: cpus.length,
    loadAvg,
    detailedCores,
  };
}

function formatCpuInfo(): string {
  const cpu = getCpuInfo();
  const [load1, load5, load15] = cpu.loadAvg;

  let output = `CPU: ${cpu.model}\n`;
  output += `Cores: ${cpu.cores}\n`;
  output += `Load Average (1/5/15 min): ${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}\n\n`;
  output += `Per-Core Breakdown:\n`;

  for (const core of cpu.detailedCores) {
    const total =
      core.user + core.nice + core.sys + core.idle + core.irq;
    const idlePct = total > 0 ? ((core.idle / total) * 100).toFixed(1) : '0.0';
    output += `  Core ${core.core}: idle=${idlePct}% (user=${core.user}, sys=${core.sys})\n`;
  }

  return output;
}

function formatMemoryInfo(): string {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPct = ((used / total) * 100).toFixed(1);
  const freePct = ((free / total) * 100).toFixed(1);

  const fmt = (bytes: number): string => {
    const gb = bytes / 1024 / 1024 / 1024;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  return [
    `Memory (${fmt(total)} total):`,
    `  Used:  ${fmt(used)} (${usedPct}%)`,
    `  Free:  ${fmt(free)} (${freePct}%)`,
    `  Total: ${fmt(total)}`,
  ].join('\n');
}

function formatUptimeInfo(): string {
  let uptime = -1;
  try {
    uptime = os.uptime();
  } catch {
    // uptime may be unavailable in sandboxed environments
  }

  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const hostname = os.hostname();

  if (uptime < 0) {
    return [
      `System Uptime: (unavailable in this environment)`,
      `Platform: ${os.type()} ${release} (${arch})`,
      `Hostname: ${hostname}`,
    ].join('\n');
  }

  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const fmt = (val: number, unit: string): string =>
    val > 0 ? `${val} ${unit}` : '';

  const parts = [
    fmt(days, 'd'),
    fmt(hours, 'h'),
    fmt(minutes, 'm'),
    fmt(seconds, 's'),
  ].filter(Boolean);

  return [
    `System Uptime: ${parts.join(' ')} (${uptime.toLocaleString()} seconds)`,
    `Platform: ${os.type()} ${os.release()} (${os.arch()})`,
    `Hostname: ${os.hostname()}`,
  ].join('\n');
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createMonitorTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'monitor',
    description: MONITOR_TOOL_DESCRIPTION,
    schema: MonitorToolSchema,
    async func(input): Promise<string> {
      const { metric } = input;

      switch (metric) {
        case 'cpu':
          return formatCpuInfo();
        case 'memory':
          return formatMemoryInfo();
        case 'uptime':
          return formatUptimeInfo();
        case 'all':
        default: {
          const sections = [
            '=== System Monitor ===\n',
            formatCpuInfo(),
            '',
            formatMemoryInfo(),
            '',
            formatUptimeInfo(),
          ];
          return sections.join('\n');
        }
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
