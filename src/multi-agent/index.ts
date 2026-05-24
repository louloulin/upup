/**
 * Multi-Agent System - Main Export (v2.5)
 * 
 * Provides complete multi-agent orchestration with:
 * - Swarm Coordinator for agent lifecycle management
 * - Team Manager for team creation and persistence
 * - Backend Registry for multiple execution backends
 * - Monitoring system for real-time metrics
 * - Skill tracking for execution analytics
 * - Health checking for backend availability
 * - Custom Agent Registry and Factory for user-defined agents
 * - Markdown Agent Loader for project/global agents
 * - Agent Scheduler for priority-based scheduling
 * - Agent Lifecycle Manager for state management
 * - Agent Event Bus for pub/sub events
 * - Agent Persistence for state snapshots
 */

export * from './types.js';
export { TeamManager, getTeamManager } from './team-manager.js';
export { SwarmCoordinator, getSwarmCoordinator } from './coordinator.js';

// Backend exports
export { 
  getBackendRegistry, 
  initializeBackends, 
  getBackendForSpawn,
  type Backend,
  type BackendType,
} from './backends/index.js';
export { BackendHealthChecker, getBackendHealthChecker, type HealthCheckResult } from './backends/health-check.js';

// Tool exports
export * from './tools/swarm-tools.js';
export * from './tools/specialized-skills.js';

// Monitoring exports
export { MultiAgentMonitor, getMultiAgentMonitor, type AgentMetrics, type SystemMetrics } from './monitor.js';

// Skill tracking exports
export { SkillExecutionTracker, getSkillTracker, type SkillExecutionRecord } from './skill-tracker.js';

// Custom agent exports
export { 
  CustomAgentRegistry, 
  getCustomAgentRegistry,
  type CustomAgentConfig,
  type CustomAgent,
  type AgentTemplate,
} from './agent-registry.js';
export * from './agent-factory.js';

// Markdown agent loader exports
export { 
  AgentLoader, 
  getAgentLoader,
  resetAgentLoader,
  type MarkdownAgentDefinition,
} from './agent-loader.js';

// Scheduler exports
export { 
  AgentScheduler, 
  getAgentScheduler,
  type SchedulingPolicy,
  type QueuedAgent,
  type SchedulingDecision,
} from './scheduler.js';

// Lifecycle exports
export { 
  AgentLifecycleManager, 
  getLifecycleManager,
  type LifecycleEvent,
  type LifecycleEventType,
  type LifecyclePolicy,
} from './lifecycle.js';

// Event Bus exports
export { 
  AgentEventBus, 
  getEventBus,
  AgentEvents,
  type AgentEvent,
  type EventFilter,
  type EventHandler,
} from './event-bus.js';

// Persistence exports
export { 
  AgentPersistence, 
  getAgentPersistence,
  type AgentSnapshot,
  type PersistenceConfig,
} from './persistence.js';

// Tools exports
export { swarmTools } from './tools/swarm-tools.js';
export { specializedTools } from './tools/specialized-skills.js';

// CLI tools exports
export * from './agent-cli.js';

// Verification exports
export { AppScriptVerifier } from './appscript-verifier.js';
export { EnhancedVerifier, runEnhancedVerification } from './enhanced-verifier.js';
