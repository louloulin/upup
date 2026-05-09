/**
 * Team Coordination - Loucode-style multi-agent coordination
 *
 * Features:
 * - Team formation and management
 * - Task distribution
 * - Communication protocols
 * - Conflict resolution
 * - Status tracking
 *
 * Reference: Loucode's team coordination
 */

import { info, warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Team member role
 */
export type TeamRole =
  | 'coordinator'    // Orchestrates team
  | 'worker'         // Executes tasks
  | 'reviewer'        // Reviews work
  | 'specialist';     // Domain expert

/**
 * Team member
 */
export interface TeamMember {
  /** Unique member ID */
  id: string;
  /** Member name */
  name: string;
  /** Member role */
  role: TeamRole;
  /** Capabilities */
  capabilities: string[];
  /** Current status */
  status: 'idle' | 'busy' | 'offline';
  /** Active tasks */
  activeTasks: string[];
  /** Completed tasks */
  completedTasks: string[];
}

/**
 * Team task
 */
export interface TeamTask {
  /** Unique task ID */
  id: string;
  /** Task description */
  description: string;
  /** Required capabilities */
  requiredCapabilities: string[];
  /** Assigned member */
  assignedTo?: string;
  /** Task status */
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  /** Priority (1-10, higher = more important) */
  priority: number;
  /** Dependencies */
  dependencies: string[];
  /** Created at */
  createdAt: number;
  /** Completed at */
  completedAt?: number;
}

/**
 * Team message
 */
export interface TeamMessage {
  /** Message ID */
  id: string;
  /** Sender ID */
  from: string;
  /** Recipient ID (or 'all') */
  to: string;
  /** Message type */
  type: 'task' | 'status' | 'request' | 'response' | 'broadcast';
  /** Message content */
  content: string;
  /** Timestamp */
  timestamp: number;
  /** Related task ID */
  taskId?: string;
}

/**
 * Team configuration
 */
export interface TeamConfig {
  /** Team name */
  name: string;
  /** Maximum team size */
  maxSize: number;
  /** Task distribution strategy */
  distributionStrategy: 'round_robin' | 'capability_based' | 'load_balanced';
  /** Enable conflict resolution */
  enableConflictResolution: boolean;
}

// ============================================================================
// Team Coordinator
// ============================================================================

/**
 * Team coordinator for managing multi-agent teams
 */
export class TeamCoordinator {
  private members: Map<string, TeamMember> = new Map();
  private tasks: Map<string, TeamTask> = new Map();
  private messages: TeamMessage[] = [];
  private config: TeamConfig;

  constructor(config: Partial<TeamConfig> = {}) {
    this.config = {
      name: config.name || 'Default Team',
      maxSize: config.maxSize || 10,
      distributionStrategy: config.distributionStrategy || 'capability_based',
      enableConflictResolution: config.enableConflictResolution ?? true,
    };
  }

  // -------------------------------------------------------------------------
  // Member Management
  // -------------------------------------------------------------------------

  /**
   * Add team member
   */
  addMember(member: TeamMember): boolean {
    if (this.members.size >= this.config.maxSize) {
      warn('subagent', `Team ${this.config.name} is at max capacity`);
      return false;
    }

    if (this.members.has(member.id)) {
      warn('subagent', `Member ${member.id} already exists`);
      return false;
    }

    this.members.set(member.id, { ...member });
    info('subagent', `Added member ${member.name} to team ${this.config.name}`);

    return true;
  }

  /**
   * Remove team member
   */
  removeMember(memberId: string): boolean {
    const member = this.members.get(memberId);
    if (!member) {
      return false;
    }

    // Reassign active tasks
    for (const taskId of member.activeTasks) {
      this.unassignTask(taskId);
    }

    this.members.delete(memberId);
    info('subagent', `Removed member ${memberId} from team`);

    return true;
  }

  /**
   * Get member by ID
   */
  getMember(memberId: string): TeamMember | undefined {
    return this.members.get(memberId);
  }

  /**
   * Get all members
   */
  getMembers(): TeamMember[] {
    return Array.from(this.members.values());
  }

  /**
   * Get available members
   */
  getAvailableMembers(): TeamMember[] {
    return this.getMembers().filter(m => m.status === 'idle');
  }

  /**
   * Update member status
   */
  updateMemberStatus(memberId: string, status: TeamMember['status']): boolean {
    const member = this.members.get(memberId);
    if (!member) {
      return false;
    }

    member.status = status;
    return true;
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  /**
   * Create task
   */
  createTask(task: Omit<TeamTask, 'id' | 'status' | 'createdAt'>): TeamTask {
    const fullTask: TeamTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.tasks.set(fullTask.id, fullTask);
    info('subagent', `Created task: ${fullTask.description}`);

    return fullTask;
  }

  /**
   * Assign task to member
   */
  assignTask(taskId: string, memberId: string): boolean {
    const task = this.tasks.get(taskId);
    const member = this.members.get(memberId);

    if (!task || !member) {
      return false;
    }

    // Check dependencies
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (depTask && depTask.status !== 'completed') {
        warn('subagent', `Task ${taskId} has incomplete dependency ${depId}`);
        return false;
      }
    }

    // Check capabilities
    const hasCapabilities = task.requiredCapabilities.every(cap =>
      member.capabilities.includes(cap)
    );
    if (!hasCapabilities) {
      warn('subagent', `Member ${memberId} lacks required capabilities`);
      return false;
    }

    // Assign
    task.assignedTo = memberId;
    task.status = 'assigned';
    member.activeTasks.push(taskId);

    // Send notification
    this.sendMessage({
      from: 'coordinator',
      to: memberId,
      type: 'task',
      content: `Assigned task: ${task.description}`,
      taskId,
    });

    info('subagent', `Assigned task ${taskId} to ${memberId}`);

    return true;
  }

  /**
   * Unassign task
   */
  unassignTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || !task.assignedTo) {
      return false;
    }

    const member = this.members.get(task.assignedTo);
    if (member) {
      member.activeTasks = member.activeTasks.filter(id => id !== taskId);
    }

    task.assignedTo = undefined;
    task.status = 'pending';

    return true;
  }

  /**
   * Start task
   */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'assigned') {
      return false;
    }

    task.status = 'in_progress';
    return true;
  }

  /**
   * Complete task
   */
  completeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'in_progress') {
      return false;
    }

    task.status = 'completed';
    task.completedAt = Date.now();

    // Update member
    if (task.assignedTo) {
      const member = this.members.get(task.assignedTo);
      if (member) {
        member.activeTasks = member.activeTasks.filter(id => id !== taskId);
        member.completedTasks.push(taskId);
      }
    }

    // Send notification
    this.sendMessage({
      from: 'coordinator',
      to: 'all',
      type: 'status',
      content: `Task ${taskId} completed`,
      taskId,
    });

    info('subagent', `Task ${taskId} completed`);

    return true;
  }

  /**
   * Fail task
   */
  failTask(taskId: string, reason?: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.status = 'failed';

    // Update member
    if (task.assignedTo) {
      const member = this.members.get(task.assignedTo);
      if (member) {
        member.activeTasks = member.activeTasks.filter(id => id !== taskId);
      }
    }

    warn('subagent', `Task ${taskId} failed: ${reason}`);

    return true;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): TeamTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getTasks(): TeamTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TeamTask['status']): TeamTask[] {
    return this.getTasks().filter(t => t.status === status);
  }

  /**
   * Get tasks assigned to member
   */
  getMemberTasks(memberId: string): TeamTask[] {
    return this.getTasks().filter(t => t.assignedTo === memberId);
  }

  // -------------------------------------------------------------------------
  // Task Distribution
  // -------------------------------------------------------------------------

  /**
   * Distribute tasks to available members
   */
  distributeTasks(): void {
    const pendingTasks = this.getTasksByStatus('pending');

    for (const task of pendingTasks) {
      const assignee = this.selectAssignee(task);
      if (assignee) {
        this.assignTask(task.id, assignee.id);
      }
    }
  }

  /**
   * Select best assignee for task
   */
  private selectAssignee(task: TeamTask): TeamMember | undefined {
    const available = this.getAvailableMembers();

    if (available.length === 0) {
      return undefined;
    }

    switch (this.config.distributionStrategy) {
      case 'round_robin':
        return this.roundRobinSelect(available);

      case 'capability_based':
        return this.capabilityBasedSelect(task, available);

      case 'load_balanced':
        return this.loadBalancedSelect(available);

      default:
        return available[0];
    }
  }

  /**
   * Round-robin selection
   */
  private roundRobinSelect(members: TeamMember[]): TeamMember {
    return members[0];
  }

  /**
   * Capability-based selection
   */
  private capabilityBasedSelect(task: TeamTask, members: TeamMember[]): TeamMember {
    // Filter by capabilities
    const qualified = members.filter(m =>
      task.requiredCapabilities.every(cap => m.capabilities.includes(cap))
    );

    if (qualified.length === 0) {
      return members[0];
    }

    // Prefer member with most matching capabilities
    return qualified.reduce((best, current) => {
      const bestMatch = task.requiredCapabilities.filter(cap =>
        best.capabilities.includes(cap)
      ).length;
      const currentMatch = task.requiredCapabilities.filter(cap =>
        current.capabilities.includes(cap)
      ).length;

      return currentMatch > bestMatch ? current : best;
    });
  }

  /**
   * Load-balanced selection
   */
  private loadBalancedSelect(members: TeamMember[]): TeamMember {
    return members.reduce((leastBusy, current) =>
      current.activeTasks.length < leastBusy.activeTasks.length
        ? current
        : leastBusy
    );
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  /**
   * Send message
   */
  sendMessage(message: Omit<TeamMessage, 'id' | 'timestamp'>): TeamMessage {
    const fullMessage: TeamMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };

    this.messages.push(fullMessage);

    // Trim message history if too long
    if (this.messages.length > 1000) {
      this.messages = this.messages.slice(-500);
    }

    return fullMessage;
  }

  /**
   * Get messages
   */
  getMessages(filter?: { from?: string; to?: string; taskId?: string }): TeamMessage[] {
    let filtered = this.messages;

    if (filter?.from) {
      filtered = filtered.filter(m => m.from === filter.from);
    }
    if (filter?.to) {
      filtered = filtered.filter(m => m.to === filter.to || m.to === 'all');
    }
    if (filter?.taskId) {
      filtered = filtered.filter(m => m.taskId === filter.taskId);
    }

    return filtered;
  }

  // -------------------------------------------------------------------------
  // Team Status
  // -------------------------------------------------------------------------

  /**
   * Get team status
   */
  getTeamStatus(): {
    name: string;
    memberCount: number;
    taskCount: number;
    completedCount: number;
    failedCount: number;
    pendingCount: number;
  } {
    const tasks = this.getTasks();

    return {
      name: this.config.name,
      memberCount: this.members.size,
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === 'completed').length,
      failedCount: tasks.filter(t => t.status === 'failed').length,
      pendingCount: tasks.filter(t => t.status === 'pending' || t.status === 'assigned').length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let teamCoordinator: TeamCoordinator | null = null;

export function getTeamCoordinator(config?: Partial<TeamConfig>): TeamCoordinator {
  if (!teamCoordinator) {
    teamCoordinator = new TeamCoordinator(config);
  }
  return teamCoordinator;
}

export function resetTeamCoordinator(): void {
  teamCoordinator = null;
}

// ============================================================================
// Module Exports
// ============================================================================

export const teamCoordination = {
  TeamCoordinator,
  getTeamCoordinator,
  resetTeamCoordinator,
};
