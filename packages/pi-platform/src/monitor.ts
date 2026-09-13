import os from 'node:os';

export type PlatformMonitorMetric = 'all' | 'cpu' | 'memory' | 'uptime';

export const PLATFORM_MONITOR_DESCRIPTION = 'Report current CPU, memory, uptime, and host information.';

function formatBytes(bytes: number): string {
  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 1) return `${gigabytes.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function formatCpu(): string {
  const cpus = os.cpus();
  const [load1, load5, load15] = os.loadavg();
  const model = cpus[0]?.model ?? 'Unknown';
  const cores = cpus.map((cpu, index) => {
    const total = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    const idle = total > 0 ? ((cpu.times.idle / total) * 100).toFixed(1) : '0.0';
    return `  Core ${index}: idle=${idle}% (user=${cpu.times.user}, sys=${cpu.times.sys})`;
  });
  return [`CPU: ${model}`, `Cores: ${cpus.length}`, `Load Average (1/5/15 min): ${load1.toFixed(2)}, ${load5.toFixed(2)}, ${load15.toFixed(2)}`, '', 'Per-Core Breakdown:', ...cores].join('\n');
}

function formatMemory(): string {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return [`Memory (${formatBytes(total)} total):`, `  Used:  ${formatBytes(used)} (${((used / total) * 100).toFixed(1)}%)`, `  Free:  ${formatBytes(free)} (${((free / total) * 100).toFixed(1)}%)`, `  Total: ${formatBytes(total)}`].join('\n');
}

function formatUptime(): string {
  const uptime = os.uptime();
  const days = Math.floor(uptime / 86_400);
  const hours = Math.floor((uptime % 86_400) / 3_600);
  const minutes = Math.floor((uptime % 3_600) / 60);
  const seconds = Math.floor(uptime % 60);
  const duration = [`${days} d`, `${hours} h`, `${minutes} m`, `${seconds} s`].join(' ');
  return [`System Uptime: ${duration} (${uptime.toLocaleString()} seconds)`, `Platform: ${os.type()} ${os.release()} (${os.arch()})`, `Hostname: ${os.hostname()}`].join('\n');
}

export function platformMonitor(metric: PlatformMonitorMetric = 'all'): string {
  if (!['all', 'cpu', 'memory', 'uptime'].includes(metric)) throw new Error(`unsupported monitor metric: ${metric}`);
  if (metric === 'cpu') return formatCpu();
  if (metric === 'memory') return formatMemory();
  if (metric === 'uptime') return formatUptime();
  return ['=== System Monitor ===', '', formatCpu(), '', formatMemory(), '', formatUptime()].join('\n');
}
