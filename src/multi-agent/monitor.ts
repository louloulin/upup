import { getPiBackgroundService, type PiBackgroundTask } from '../runtime/pi/background-service.js';

export interface AgentMetrics {
  agentId: string;
  name: string;
  role: string;
  status: PiBackgroundTask['status'];
  teamId: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  lastActivity?: number;
  result?: string;
  error?: string;
}

export interface SystemMetrics {
  totalAgents: number;
  activeAgents: number;
  completedAgents: number;
  failedAgents: number;
  pendingAgents: number;
  uptime: number;
  eventsPerSecond: number;
  backendHealth: Record<string, { healthy: boolean; latencyMs: number }>;
  teamsCount: number;
  messagesCount: number;
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  enableHealthCheck: boolean;
  metricsIntervalMs: number;
  retentionPeriodMs: number;
}

const DEFAULT_CONFIG: MonitoringConfig = { enableMetrics: true, enableHealthCheck: false, metricsIntervalMs: 5000, retentionPeriodMs: 3600000 };

function taskToMetric(task: PiBackgroundTask): AgentMetrics {
  const completedAt = task.completedAt;
  return {
    agentId: task.id,
    name: `pi-worker-${task.id.slice(0, 8)}`,
    role: 'pi-background-worker',
    status: task.status,
    teamId: 'pi-session',
    createdAt: task.createdAt,
    ...(task.status !== 'pending' ? { startedAt: task.createdAt } : {}),
    ...(completedAt ? { completedAt, durationMs: completedAt - task.createdAt } : {}),
    lastActivity: completedAt ?? task.createdAt,
    ...(task.result ? { result: task.result } : {}),
    ...(task.error ? { error: task.error } : {}),
  };
}

export class MultiAgentMonitor {
  private static instance: MultiAgentMonitor | null = null;
  private readonly config: MonitoringConfig;
  private readonly background = getPiBackgroundService();
  private readonly startTime = Date.now();
  private metricsInterval?: ReturnType<typeof setInterval>;

  private constructor(config: Partial<MonitoringConfig> = {}) { this.config = { ...DEFAULT_CONFIG, ...config }; }

  static getInstance(config?: Partial<MonitoringConfig>): MultiAgentMonitor {
    MultiAgentMonitor.instance ??= new MultiAgentMonitor(config);
    return MultiAgentMonitor.instance;
  }

  initialize(): void {}
  start(): void {
    if (this.metricsInterval || !this.config.enableMetrics) return;
    this.metricsInterval = setInterval(() => this.cleanup(), this.config.metricsIntervalMs);
  }
  stop(): void { if (this.metricsInterval) clearInterval(this.metricsInterval); this.metricsInterval = undefined; }
  getAgentMetrics(): AgentMetrics[] { return this.background.list().map(taskToMetric); }

  getSystemMetrics(): SystemMetrics {
    const agents = this.getAgentMetrics();
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((agent) => agent.status === 'running').length,
      completedAgents: agents.filter((agent) => agent.status === 'completed').length,
      failedAgents: agents.filter((agent) => agent.status === 'failed').length,
      pendingAgents: agents.filter((agent) => agent.status === 'pending').length,
      uptime: Date.now() - this.startTime,
      eventsPerSecond: 0,
      backendHealth: {},
      teamsCount: 0,
      messagesCount: 0,
    };
  }

  getEventLog(): readonly [] { return []; }
  getEventCounts(): Record<string, number> { return {}; }
  getTeamsOverview(): Array<{ name: string; memberCount: number; status: string }> { return []; }

  generateReport(): string {
    const system = this.getSystemMetrics();
    return ['', '=== Pi Background Monitoring Report ===', '', `Total Pi Workers: ${system.totalAgents}`, `Active: ${system.activeAgents}`, `Completed: ${system.completedAgents}`, `Failed: ${system.failedAgents}`, `Pending: ${system.pendingAgents}`, `Uptime: ${Math.floor(system.uptime / 1000)}s`, '', ...this.getAgentMetrics().slice(0, 20).map((agent) => `- ${agent.name}: ${agent.status}`)].join('\n');
  }

  cleanup(): void { void this.config.retentionPeriodMs; }
  static reset(): void { MultiAgentMonitor.instance?.stop(); MultiAgentMonitor.instance = null; }
}

export function getMultiAgentMonitor(): MultiAgentMonitor { return MultiAgentMonitor.getInstance(); }
