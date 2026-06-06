/**
 * Coordinator mode for UpUp.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 *      openspec/changes/top-tier-investment-assistant/specs/subagent
 */

export {
  createCoordinator,
  type Coordinator,
  type CoordinatorRunResult,
  type WorkerExecutor,
} from './coordinator.js';

export {
  FileTaskList,
  createFileTaskList,
  type FileTaskListOptions,
} from './task-list.js';

export {
  InMemoryTaskList,
  createInMemoryTaskList,
} from './in-memory-task-list.js';

export {
  DEFAULT_WORKER_TEMPLATES,
  type CoordinatorDeps,
  type Phase,
  type ResearchResult,
  type Task,
  type TaskList,
  type TaskStatus,
  type WorkerConfig,
  type WorkerRole,
} from './types.js';

// CLI Session Controllers (moved from src/controllers/)
export { AgentRunnerController } from './agent-runner.js';
export { InputHistoryController } from './input-history.js';
export { ModelSelectionController } from './model-selection.js';
export { SessionSelectionController } from './session-selection.js';
