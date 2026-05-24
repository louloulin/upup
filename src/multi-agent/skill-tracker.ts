/**
 * Skill Execution Tracker - Skill执行追踪系统 (v2.0)
 * 
 * 追踪Skill执行历史、性能、依赖关系
 * 与EnhancedSkillDefinition真实集成，无硬编码
 */

import { getAllSpecializedSkills, getSkillByName } from '../skills/bundled/index.js';
import { info, warn } from '../utils/logging/logger.js';

export interface SkillExecutionRecord {
  id: string;
  skillName: string;
  skillType: string;
  agentType: string;
  context: 'inline' | 'fork' | 'swarm' | 'background';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface SkillDependency {
  skillName: string;
  dependsOn: string[];
  executedAt?: number;
  status?: 'pending' | 'executed' | 'failed';
}

export interface SkillStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDurationMs: number;
  lastExecuted?: number;
  mostUsedByAgent: Record<string, number>;
}

export interface SkillTrackerConfig {
  enableDependencyTracking: boolean;
  enablePerformanceTracking: boolean;
  retentionPeriodMs: number;
  maxRecords: number;
}

const DEFAULT_CONFIG: SkillTrackerConfig = {
  enableDependencyTracking: true,
  enablePerformanceTracking: true,
  retentionPeriodMs: 86400000, // 24 hours
  maxRecords: 1000,
};

export class SkillExecutionTracker {
  private static instance: SkillExecutionTracker | null = null;
  private config: SkillTrackerConfig;
  private executionHistory: SkillExecutionRecord[] = [];
  private activeExecutions: Map<string, SkillExecutionRecord> = new Map();
  private dependencies: Map<string, SkillDependency> = new Map();
  private skillStats: Map<string, SkillStats> = new Map();
  private initialized: boolean = false;

  private constructor(config: Partial<SkillTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config?: Partial<SkillTrackerConfig>): SkillExecutionTracker {
    if (!SkillExecutionTracker.instance) {
      SkillExecutionTracker.instance = new SkillExecutionTracker(config);
      SkillExecutionTracker.instance.initialize();
    }
    return SkillExecutionTracker.instance;
  }

  /**
   * Initialize stats from real skill definitions
   */
  private initialize(): void {
    if (this.initialized) return;
    
    try {
      const skills = getAllSpecializedSkills();
      for (const skill of skills) {
        // Skip if already has stats
        if (this.skillStats.has(skill.name)) continue;
        
        this.skillStats.set(skill.name, {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          averageDurationMs: 0,
          mostUsedByAgent: {},
        });
        
        // Register dependencies if defined
        if ((skill as any).dependsOn) {
          this.dependencies.set(skill.name, {
            skillName: skill.name,
            dependsOn: (skill as any).dependsOn,
            status: 'pending',
          });
        }
      }
      
      this.initialized = true;
      info('skill-tracker', `Initialized with ${skills.length} skills`);
    } catch (error) {
      warn('skill-tracker', `Failed to initialize skill stats: ${error}`);
      this.initialized = true;
    }
  }

  /**
   * Start tracking a skill execution with real skill metadata
   */
  trackExecutionStart(skillName: string, input: Record<string, unknown> = {}): string {
    // Get real skill definition for metadata
    const skill = getSkillByName(skillName);
    
    const record: SkillExecutionRecord = {
      id: crypto.randomUUID(),
      skillName,
      skillType: (skill as any)?.type || 'unknown',
      agentType: skill?.agent || 'default',
      context: skill?.context || 'inline',
      startTime: Date.now(),
      status: 'running',
      input,
    };

    this.activeExecutions.set(record.id, record);
    info('skill-tracker', `Started tracking: ${skillName} (${record.id})`);
    
    return record.id;
  }

  /**
   * Complete a skill execution
   */
  trackExecutionComplete(
    executionId: string,
    result?: string,
    output?: Record<string, unknown>
  ): void {
    const record = this.activeExecutions.get(executionId);
    if (!record) {
      warn('skill-tracker', `Unknown execution ID: ${executionId}`);
      return;
    }

    record.status = 'completed';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.result = result;
    record.output = output;

    this.finishExecution(record);
  }

  /**
   * Fail a skill execution
   */
  trackExecutionFail(executionId: string, error: string): void {
    const record = this.activeExecutions.get(executionId);
    if (!record) {
      warn('skill-tracker', `Unknown execution ID: ${executionId}`);
      return;
    }

    record.status = 'failed';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.error = error;

    this.finishExecution(record);
  }

  /**
   * Cancel a skill execution
   */
  trackExecutionCancel(executionId: string): void {
    const record = this.activeExecutions.get(executionId);
    if (!record) return;

    record.status = 'cancelled';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;

    this.finishExecution(record);
  }

  /**
   * Finish execution and update stats
   */
  private finishExecution(record: SkillExecutionRecord): void {
    this.activeExecutions.delete(record.id);
    
    // Add to history
    this.executionHistory.push(record);
    
    // Trim history if needed
    if (this.executionHistory.length > this.config.maxRecords) {
      this.executionHistory = this.executionHistory.slice(-this.config.maxRecords);
    }

    // Update stats
    this.updateStats(record);
    
    // Update dependency if tracking
    if (this.config.enableDependencyTracking) {
      const dep = this.dependencies.get(record.skillName);
      if (dep) {
        dep.executedAt = Date.now();
        dep.status = record.status === 'failed' ? 'failed' : 'executed';
      }
    }
  }

  /**
   * Update skill statistics
   */
  private updateStats(record: SkillExecutionRecord): void {
    let stats = this.skillStats.get(record.skillName);
    
    // Create stats if doesn't exist (dynamic skill tracking)
    if (!stats) {
      stats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDurationMs: 0,
        mostUsedByAgent: {},
      };
      this.skillStats.set(record.skillName, stats);
    }

    stats.totalExecutions++;
    
    if (record.status === 'completed') {
      stats.successfulExecutions++;
    } else if (record.status === 'failed') {
      stats.failedExecutions++;
    }

    // Update average duration
    const totalDuration = stats.averageDurationMs * (stats.totalExecutions - 1) + (record.durationMs || 0);
    stats.averageDurationMs = totalDuration / stats.totalExecutions;

    stats.lastExecuted = record.endTime;

    // Track agent usage
    const agentKey = record.agentType;
    stats.mostUsedByAgent[agentKey] = (stats.mostUsedByAgent[agentKey] || 0) + 1;
  }

  /**
   * Register skill dependency
   */
  registerDependency(skillName: string, dependsOn: string[]): void {
    this.dependencies.set(skillName, {
      skillName,
      dependsOn,
      status: 'pending',
    });
  }

  /**
   * Check if dependencies are met
   */
  checkDependencies(skillName: string): { met: boolean; missing: string[] } {
    const dep = this.dependencies.get(skillName);
    if (!dep) return { met: true, missing: [] };

    const missing: string[] = [];
    for (const depName of dep.dependsOn) {
      const depRecord = this.dependencies.get(depName);
      if (!depRecord || depRecord.status !== 'executed') {
        missing.push(depName);
      }
    }

    return { met: missing.length === 0, missing };
  }

  /**
   * Get skill stats from real tracking data
   */
  getSkillStats(skillName?: string): SkillStats | Record<string, SkillStats> {
    if (skillName) {
      return this.skillStats.get(skillName) || {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDurationMs: 0,
        mostUsedByAgent: {},
      };
    }
    return Object.fromEntries(this.skillStats);
  }

  /**
   * Get all available skills from registry
   */
  getAvailableSkills(): string[] {
    try {
      const skills = getAllSpecializedSkills();
      return skills.map(s => s.name);
    } catch {
      return [];
    }
  }

  /**
   * Get execution history from real storage
   */
  getExecutionHistory(limit?: number): SkillExecutionRecord[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): SkillExecutionRecord[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): SkillExecutionRecord | undefined {
    return this.activeExecutions.get(executionId) ||
      this.executionHistory.find(r => r.id === executionId);
  }

  /**
   * Get skills ranked by usage from real data
   */
  getSkillsRanking(): Array<{ skillName: string; executions: number; successRate: number }> {
    return Array.from(this.skillStats.entries())
      .map(([name, stats]) => ({
        skillName: name,
        executions: stats.totalExecutions,
        successRate: stats.totalExecutions > 0 
          ? (stats.successfulExecutions / stats.totalExecutions) * 100 
          : 0,
      }))
      .sort((a, b) => b.executions - a.executions);
  }

  /**
   * Generate tracking report from real data
   */
  generateReport(): string {
    const totalExecutions = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.status === 'completed').length;
    const failed = this.executionHistory.filter(e => e.status === 'failed').length;
    const active = this.activeExecutions.size;
    const availableSkills = this.getAvailableSkills();
    
    const avgDuration = totalExecutions > 0
      ? this.executionHistory.reduce((sum, e) => sum + (e.durationMs || 0), 0) / totalExecutions
      : 0;

    const lines = [
      '',
      '=== Skill Execution Tracking Report ===',
      '',
      'Summary:',
      `  Total Executions: ${totalExecutions}`,
      `  Successful: ${successful} (${totalExecutions > 0 ? ((successful / totalExecutions) * 100).toFixed(1) : 0}%)`,
      `  Failed: ${failed}`,
      `  Active: ${active}`,
      `  Avg Duration: ${avgDuration.toFixed(0)}ms`,
      '',
      `Available Skills: ${availableSkills.length}`,
      `  ${availableSkills.slice(0, 5).join(', ')}${availableSkills.length > 5 ? '...' : ''}`,
      '',
      'Skills Ranking:',
      ...this.getSkillsRanking().slice(0, 5).map((s, i) => 
        `  ${i + 1}. ${s.skillName}: ${s.executions} runs, ${s.successRate.toFixed(1)}% success`
      ),
    ];

    return lines.join('\n');
  }

  /**
   * Cleanup old records
   */
  cleanup(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;
    
    // Remove old history
    this.executionHistory = this.executionHistory.filter(r => r.startTime > cutoff);
    
    // Reset old dependencies
    for (const [name, dep] of this.dependencies.entries()) {
      if (dep.executedAt && dep.executedAt < cutoff) {
        this.dependencies.set(name, { ...dep, status: 'pending', executedAt: undefined });
      }
    }
  }

  /**
   * Reset instance
   */
  static reset(): void {
    if (SkillExecutionTracker.instance) {
      SkillExecutionTracker.instance.executionHistory = [];
      SkillExecutionTracker.instance.activeExecutions.clear();
      SkillExecutionTracker.instance.initialized = false;
    }
  }
}

/**
 * Get tracker instance
 */
export function getSkillTracker(): SkillExecutionTracker {
  return SkillExecutionTracker.getInstance();
}
