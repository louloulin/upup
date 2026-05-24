/**
 * Multi-Agent Monitor - 多智能体监控增强 (v2.0)
 * 
 * 实时监控Agent状态、事件、性能指标
 * 参考Claude Code设计提供完整的可观测性
 * 无mock数据，全部真实集成
 */

import type { AgentInstance, CoordinatorEvent } from './types.js';
import { getSwarmCoordinator, type SwarmCoordinator } from './coordinator.js';
import { getTeamManager, type TeamManager } from './team-manager.js';
import { getBackendHealthChecker, type BackendHealthChecker } from './backends/health-check.js';
import { getBackendRegistry, type BackendRegistry } from './backends/index.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';

export interface AgentMetrics {
  agentId: string;
  name: string;
  role: string;
  status: AgentInstance['status'];
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

const DEFAULT_CONFIG: MonitoringConfig = {
  enableMetrics: true,
  enableHealthCheck: true,
  metricsIntervalMs: 5000,
  retentionPeriodMs: 3600000, // 1 hour
};

export class MultiAgentMonitor {
  private static instance: MultiAgentMonitor | null = null;
  private config: MonitoringConfig;
  private eventLog: CoordinatorEvent[] = [];
  private eventCounts: Map<string, number> = new Map();
  private startTime: number = 0;
  private metricsInterval?: ReturnType<typeof setInterval> = undefined;
  private coordinator: SwarmCoordinator | null = null;
  private teamManager: TeamManager | null = null;
  private registry: BackendRegistry | null = null;
  private healthChecker: BackendHealthChecker | null = null;
  private initialized: boolean = false;

  private constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<MonitoringConfig>): MultiAgentMonitor {
    if (!MultiAgentMonitor.instance) {
      MultiAgentMonitor.instance = new MultiAgentMonitor(config);
    }
    return MultiAgentMonitor.instance;
  }

  /**
   * Initialize monitor with real dependencies
   */
  initialize(): void {
    if (this.initialized) return;
    
    this.coordinator = getSwarmCoordinator();
    this.teamManager = getTeamManager();
    this.registry = getBackendRegistry();
    this.healthChecker = getBackendHealthChecker();
    
    this.initialized = true;
    info('monitor', 'MultiAgentMonitor initialized with real dependencies');
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.metricsInterval) return;
    
    this.initialize();
    this.startTime = Date.now();
    
    // Subscribe to coordinator events for real-time tracking
    if (this.coordinator) {
      this.coordinator.subscribe('agent_spawned', (e) => this.recordEvent(e));
      this.coordinator.subscribe('agent_completed', (e) => this.recordEvent(e));
      this.coordinator.subscribe('agent_failed', (e) => this.recordEvent(e));
      this.coordinator.subscribe('message_sent', (e) => this.recordEvent(e));
      this.coordinator.subscribe('team_created', (e) => this.recordEvent(e));
    }
    
    // Start metrics collection interval
    if (this.config.enableMetrics) {
      this.metricsInterval = setInterval(() => {
        this.collectMetrics();
      }, this.config.metricsIntervalMs);
    }
    
    info('monitor', 'MultiAgentMonitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }
    info('monitor', 'MultiAgentMonitor stopped');
  }

  /**
   * Record an event from real coordinator
   */
  recordEvent(event: CoordinatorEvent): void {
    this.eventLog.push(event);
    
    // Update event counts
    const count = this.eventCounts.get(event.type) || 0;
    this.eventCounts.set(event.type, count + 1);
  }

  /**
   * Collect current metrics from real sources
   */
  private collectMetrics(): void {
    if (!this.config.enableMetrics) return;
    
    // Real metrics collection happens in getSystemMetrics()
    // This method is for background cleanup and maintenance
    this.cleanup();
  }

  /**
   * Get agent metrics from real coordinator
   */
  getAgentMetrics(): AgentMetrics[] {
    if (!this.coordinator) {
      this.initialize();
    }
    
    if (!this.coordinator) return [];
    
    const agents = this.coordinator.getAgents?.() || [];
    const metrics: AgentMetrics[] = [];
    
    for (const agent of agents) {
      metrics.push({
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        teamId: agent.teamId,
        createdAt: agent.createdAt,
        startedAt: agent.startedAt,
        completedAt: agent.completedAt,
        durationMs: agent.completedAt && agent.startedAt 
          ? agent.completedAt - agent.startedAt 
          : agent.completedAt 
            ? agent.completedAt - agent.createdAt 
            : undefined,
        lastActivity: agent.lastActivity,
        result: agent.result,
        error: agent.error,
      });
    }
    
    return metrics;
  }

  /**
   * Get specific agent metric
   */
  getAgentMetric(agentId: string): AgentMetrics | undefined {
    const agents = this.getAgentMetrics();
    return agents.find(a => a.agentId === agentId);
  }

  /**
   * Get system metrics from real sources
   */
  getSystemMetrics(): SystemMetrics {
    if (!this.initialized) {
      this.initialize();
    }
    
    const agents = this.getAgentMetrics();
    const uptime = this.startTime > 0 ? Date.now() - this.startTime : 0;
    
    // Get real backend health
    const backendHealth: Record<string, { healthy: boolean; latencyMs: number }> = {};
    if (this.healthChecker) {
      const healthResults = this.healthChecker.getAllHealth();
      for (const [type, result] of healthResults.entries()) {
        backendHealth[type] = {
          healthy: result.healthy,
          latencyMs: result.latencyMs,
        };
      }
    }
    
    // Get real teams count
    let teamsCount = 0;
    if (this.teamManager) {
      const teams = this.teamManager.listTeams?.() || [];
      teamsCount = teams.length;
    }
    
    // Get messages count
    let messagesCount = 0;
    if (this.coordinator) {
      messagesCount = this.coordinator.getMessageCount?.() || 0;
    }
    
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'running').length,
      completedAgents: agents.filter(a => a.status === 'completed').length,
      failedAgents: agents.filter(a => a.status === 'failed').length,
      pendingAgents: agents.filter(a => a.status === 'pending').length,
      uptime,
      eventsPerSecond: this.calculateEventsPerSecond(),
      backendHealth,
      teamsCount,
      messagesCount,
    };
  }

  /**
   * Calculate events per second from real event log
   */
  private calculateEventsPerSecond(): number {
    const uptime = (Date.now() - this.startTime) / 1000;
    if (uptime <= 0) return 0;
    
    const totalEvents = Array.from(this.eventCounts.values()).reduce((a, b) => a + b, 0);
    return uptime > 0 ? totalEvents / uptime : 0;
  }

  /**
   * Get event log
   */
  getEventLog(limit?: number): CoordinatorEvent[] {
    if (limit) {
      return this.eventLog.slice(-limit);
    }
    return [...this.eventLog];
  }

  /**
   * Get event counts
   */
  getEventCounts(): Record<string, number> {
    return Object.fromEntries(this.eventCounts);
  }

  /**
   * Get teams overview from real TeamManager
   */
  getTeamsOverview(): Array<{ name: string; memberCount: number; status: string }> {
    if (!this.teamManager) {
      this.initialize();
    }
    
    if (!this.teamManager) return [];
    
    const teams = this.teamManager.listTeams?.() || [];
    return teams.map(team => ({
      name: team.name,
      memberCount: team.members?.length || 0,
      status: team.status,
    }));
  }

  /**
   * Generate monitoring report from real data
   */
  generateReport(): string {
    const system = this.getSystemMetrics();
    const teams = this.getTeamsOverview();
    const eventCounts = this.getEventCounts();
    const agents = this.getAgentMetrics();
    
    const lines = [
      '',
      '=== Multi-Agent Monitoring Report ===',
      '',
      'System Metrics:',
      `  Total Agents: ${system.totalAgents}`,
      `  Active: ${system.activeAgents}`,
      `  Completed: ${system.completedAgents}`,
      `  Failed: ${system.failedAgents}`,
      `  Pending: ${system.pendingAgents}`,
      `  Uptime: ${Math.floor(system.uptime / 1000)}s`,
      `  Events/s: ${system.eventsPerSecond.toFixed(2)}`,
      `  Teams: ${system.teamsCount}`,
      `  Messages: ${system.messagesCount}`,
      '',
      'Backend Health:',
      ...Object.entries(system.backendHealth).map(([type, health]) => 
        `  ${health.healthy ? '✅' : '❌'} ${type}: ${health.latencyMs}ms`
      ),
      '',
      'Teams:',
      ...teams.length > 0 
        ? teams.map(t => `  - ${t.name}: ${t.memberCount} members (${t.status})`)
        : ['  (no teams)'],
      '',
      'Event Counts:',
      ...Object.entries(eventCounts).length > 0
        ? Object.entries(eventCounts).map(([type, count]) => `  ${type}: ${count}`)
        : ['  (no events)'],
    ];
    
    return lines.join('\n');
  }

  /**
   * Cleanup old data from event log
   */
  cleanup(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;
    this.eventLog = this.eventLog.filter(e => e.timestamp > cutoff);
  }

  /**
   * Reset instance (for testing)
   */
  static reset(): void {
    if (MultiAgentMonitor.instance) {
      MultiAgentMonitor.instance.stop();
    }
    MultiAgentMonitor.instance = null;
  }
}

/**
 * Get monitor instance
 */
export function getMultiAgentMonitor(): MultiAgentMonitor {
  return MultiAgentMonitor.getInstance();
}
