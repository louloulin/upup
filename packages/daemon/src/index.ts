/**
 * @upup/daemon - Pi Native background task and worker pool runtime.
 *
 * Public surface for the UpUp daemon: supervisor, priority task queue,
 * worker pool, IPC router, and the bundled TasksWorker. The daemon never
 * imports root `src/` — it talks to the Pi runtime through the gateway
 * agent runtime port and the cron package public API. Bootstrap is the
 * caller's responsibility (see `bootstrapPiNativeServices` in root).
 */

// Core supervisor and queue
export {
  Supervisor,
  PriorityTaskQueue,
  TaskPriority,
  TaskStatus,
  DaemonEvent,
  getDefaultSupervisor,
  type Task,
  type TaskResult,
  type Worker,
  type WorkerHealth,
} from './supervisor';

// Worker pool
export {
  WorkerPool,
  getWorkerPool,
  resetWorkerPool,
  DEFAULT_WORKER_POOL_CONFIG,
  type WorkerPoolConfig,
  type DaemonWorker,
} from './worker-pool';

// IPC router
export {
  IPCRouter,
  IPCClient,
  IPCError,
  getIPCRouter,
  resetIPCRouter,
  type IPCHandler,
  type IPCMessage,
  type IPCResponse,
  type IPCErrorDetail,
} from './ipc';

// Tasks worker (bridge between Daemon and Cron Package)
export {
  TASKS_WORKER_KIND,
  TasksWorker,
  createTasksWorker,
  type DaemonBackgroundRuntimePort,
} from './workers/tasks';

// Additional worker types and factories
export {
  MonitorWorker,
  EvolutionWorker,
  BridgeWorker,
  createMonitorWorker,
  createEvolutionWorker,
  createBridgeWorker,
  additionalWorkers,
  type MonitorWorkerConfig,
  type MonitorTarget,
  type MonitorNotification,
  type EvolutionWorkerConfig,
  type EvolutionSuggestion,
  type BridgeWorkerConfig,
  type CCRCommand,
  type CCRResponse,
} from './workers/types';

// Common types
export {
  type WorkerStatus,
  type WorkerStats,
  type WorkerEventType,
  type WorkerEvent,
  type WorkerEventHandler,
  type DaemonSession,
  DaemonError,
  WorkerError,
  WorkerTimeoutError,
  WorkerHealthError,
} from './types';

// Fund monitor
export {
  startFundMonitor,
  stopFundMonitor,
  getMonitorStatus,
  triggerUpdate,
  updateFollowedFundValues,
  isMarketOpen,
  isMarketHours,
  type FundMonitorConfig,
} from './fund-monitor';
