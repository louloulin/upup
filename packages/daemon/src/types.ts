/**
 * UpUp Daemon System — Core Types
 *
 * Defines worker pool types, health monitoring, and worker interfaces.
 */

// ============================================================================
// Worker Types
// ============================================================================

/**
 * Worker health status
 */
export interface WorkerHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastHeartbeat: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  memoryUsageMB?: number;
}

/**
 * Worker config
 */
export interface WorkerPoolConfig {
  maxWorkers: number;
  heartbeatInterval: number;  // ms, default 30000
  staleThreshold: number;      // ms, default 90000
  restartDelay: number;       // ms, default 5000
  maxRestartAttempts: number; // default 3
}

/**
 * Default worker pool config
 */
export const DEFAULT_WORKER_POOL_CONFIG: WorkerPoolConfig = {
  maxWorkers: 10,
  heartbeatInterval: 30000,
  staleThreshold: 90000,
  restartDelay: 5000,
  maxRestartAttempts: 3,
};

/**
 * Daemon worker interface
 */
export interface DaemonWorker {
  id: string;
  kind: string;
  name: string;
  description: string;
  initialize(): Promise<void>;
  healthCheck(): Promise<WorkerHealth>;
  shutdown(): Promise<void>;
  canHandle(taskType: string): boolean;
  ping?(): Promise<boolean>;
  onTaskStart?(): void;
  onTaskComplete?(): void;
  onTaskFail?(error: Error): void;
}

// ============================================================================
// Worker Status
// ============================================================================

/**
 * Worker status
 */
export type WorkerStatus = 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * Worker stats
 */
export interface WorkerStats {
  id: string;
  status: WorkerStatus;
  lastHeartbeat: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  restartAttempts: number;
}

// ============================================================================
// Worker Events
// ============================================================================

/**
 * Worker event types
 */
export type WorkerEventType =
  | 'worker:start'
  | 'worker:stop'
  | 'worker:health'
  | 'worker:error'
  | 'worker:task'
  | 'pool:stats';

/**
 * Worker event data
 */
export interface WorkerEvent {
  type: WorkerEventType;
  workerId?: string;
  data?: unknown;
  timestamp: number;
}

/**
 * Worker event handler
 */
export type WorkerEventHandler = (event: WorkerEvent) => void;

// ============================================================================
// IPC Types
// ============================================================================

/**
 * IPC message types
 */
export type IPCMessageType =
  | 'ping'
  | 'pong'
  | 'execute'
  | 'result'
  | 'error'
  | 'health'
  | 'shutdown';

/**
 * IPC message
 */
export interface IPCMessage {
  id: string;
  type: IPCMessageType;
  payload?: unknown;
  timestamp: number;
}

/**
 * IPC response
 */
export interface IPCResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: number;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Daemon session state
 */
export interface DaemonSession {
  id: string;
  startedAt: number;
  lastActivity: number;
  activeWorkers: number;
  completedTasks: number;
  failedTasks: number;
  uptime: number;
}

// ============================================================================
// Errors
// ============================================================================

export class DaemonError extends Error {
  constructor(
    message: string,
    public code: string,
    public workerId?: string
  ) {
    super(message);
    this.name = 'DaemonError';
  }
}

export class WorkerError extends DaemonError {
  constructor(message: string, workerId?: string) {
    super(message, 'WORKER_ERROR', workerId);
  }
}

export class WorkerTimeoutError extends DaemonError {
  constructor(workerId: string, timeoutMs: number) {
    super(`Worker ${workerId} timeout after ${timeoutMs}ms`, 'WORKER_TIMEOUT', workerId);
  }
}

export class WorkerHealthError extends DaemonError {
  constructor(workerId: string, status: string) {
    super(`Worker ${workerId} health check failed: ${status}`, 'WORKER_HEALTH_ERROR', workerId);
  }
}