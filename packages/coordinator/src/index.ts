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
} from '@upup/./coordinator';

export {
  FileTaskList,
  createFileTaskList,
  type FileTaskListOptions,
} from '@upup/./task-list';

export {
  InMemoryTaskList,
  createInMemoryTaskList,
} from '@upup/./in-memory-task-list';

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
} from '@upup/./types';
