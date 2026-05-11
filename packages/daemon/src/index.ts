/**
 * UpUp Daemon System
 *
 * Worker pool types, health monitoring, and worker interfaces.
 */

// Core types
export {
  type WorkerHealth,
  type WorkerPoolConfig,
  DEFAULT_WORKER_POOL_CONFIG,
  type DaemonWorker,
  type WorkerStatus,
  type WorkerStats,
  type WorkerEventType,
  type WorkerEvent,
  type WorkerEventHandler,
  type IPCMessageType,
  type IPCMessage,
  type IPCResponse,
  type DaemonSession,
  DaemonError,
  WorkerError,
  WorkerTimeoutError,
  WorkerHealthError,
} from './types.js';

// Additional worker types
export {
  type MonitorTargetType,
  type MonitorNotificationType,
  type MonitorTarget,
  type MonitorNotification,
  type MonitorWorkerConfig,
  type EvolutionSuggestionType,
  type EvolutionSuggestion,
  type EvolutionWorkerConfig,
  type CCRCommandType,
  type CCRCommand,
  type CCRResponse,
  type BridgeWorkerConfig,
} from './workers.js';
