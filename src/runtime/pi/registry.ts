/**
 * Agent Registry - Loucode-style built-in agent management
 *
 * Features:
 * - Built-in agent definitions
 * - Dynamic agent loading
 * - Task-based agent selection
 * - Agent metadata and versioning
 *
 * Reference: Loucode's built-in agents
 */

import { info, warn } from '../../utils/logging/logger.js';
import { PiAgentCatalog } from './agent-catalog.js';
import { agentDefinitionToPiSpec } from './agent-spec.js';
import type { UpUpAgentSpec } from '@upup/pi-runtime';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent capability
 */
export type AgentCapability =
  | 'research'
  | 'coding'
  | 'debugging'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'deployment'
  | 'review'
  | 'analysis';

/**
 * Agent definition
 */
export interface PiAgentMetadata {
  /** Unique agent ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Version */
  version: string;
  /** Capabilities */
  capabilities: AgentCapability[];
  /** Task types this agent handles */
  taskTypes: string[];
  /** System prompt template */
  systemPrompt: string;
  /** Model preference */
  preferredModel?: string;
  /** Configuration */
  config?: Record<string, unknown>;
  /** Whether this is a built-in agent */
  isBuiltIn: boolean;
}

/** Runtime boundary: registry metadata is converted before any Pi session starts. */
export function toPiAgentSpec(definition: PiAgentMetadata): UpUpAgentSpec {
  return agentDefinitionToPiSpec(definition);
}

/**
 * Built-in agent definition interface (from subagent.ts)
 */
export interface PiBuiltInAgentSpec {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  taskTypes: string[];
  systemPrompt: string;
  preferredModel?: string;
}

function fromPiAgentSpec(spec: UpUpAgentSpec, isBuiltIn: boolean): PiAgentMetadata {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    version: spec.version,
    capabilities: spec.capabilities.filter((capability): capability is AgentCapability =>
      ['research', 'coding', 'debugging', 'refactoring', 'testing', 'documentation', 'deployment', 'review', 'analysis'].includes(capability),
    ),
    taskTypes: [...spec.taskTypes],
    systemPrompt: spec.systemPrompt ?? '',
    ...(spec.model ? { preferredModel: spec.model } : {}),
    ...(spec.tools === '*' ? {} : { config: { tools: [...spec.tools] } }),
    isBuiltIn,
  };
}

// ============================================================================
// Built-in Agents
// ============================================================================

/**
 * Research agent - specialized for financial research
 */
const RESEARCH_AGENT: PiAgentMetadata = {
  id: 'research-agent',
  name: 'Research Agent',
  description: 'Specialized for deep financial research, data gathering, and analysis',
  version: '1.0.0',
  capabilities: ['research', 'analysis'],
  taskTypes: ['research', 'analysis', 'data-gathering', 'financial'],
  systemPrompt: `You are a specialized research agent for financial analysis.

Your strengths:
- Deep research on companies, sectors, and markets
- Data gathering from multiple sources
- Financial metric analysis
- Competitive landscape research
- Industry trend identification

Always provide data-driven insights with specific numbers and sources.`,
  preferredModel: 'deepseek-v3',
  isBuiltIn: true,
};

/**
 * Coding agent - specialized for code implementation
 */
const CODING_AGENT: PiAgentMetadata = {
  id: 'coding-agent',
  name: 'Coding Agent',
  description: 'Specialized for code implementation, feature development, and technical tasks',
  version: '1.0.0',
  capabilities: ['coding', 'refactoring'],
  taskTypes: ['implement', 'code', 'feature', 'refactor', 'build'],
  systemPrompt: `You are a specialized coding agent for software development.

Your strengths:
- Writing clean, maintainable code
- Following project conventions
- Implementing features end-to-end
- Writing tests
- Code refactoring

Always explain your implementation choices and consider edge cases.`,
  preferredModel: 'gpt-5.4',
  isBuiltIn: true,
};

/**
 * Debug agent - specialized for debugging and problem solving
 */
const DEBUGGING_AGENT: PiAgentMetadata = {
  id: 'debugging-agent',
  name: 'Debugging Agent',
  description: 'Specialized for debugging, error analysis, and problem resolution',
  version: '1.0.0',
  capabilities: ['debugging', 'analysis'],
  taskTypes: ['debug', 'fix', 'error', 'problem', 'troubleshoot'],
  systemPrompt: `You are a specialized debugging agent for problem resolution.

Your strengths:
- Analyzing error messages and stack traces
- Identifying root causes
- Systematic problem isolation
- Testing hypotheses
- Proposing and verifying fixes

Be methodical and provide clear explanations of your debugging process.`,
  preferredModel: 'claude-sonnet-4-20250514',
  isBuiltIn: true,
};

/**
 * Testing agent - specialized for testing and QA
 */
const TESTING_AGENT: PiAgentMetadata = {
  id: 'testing-agent',
  name: 'Testing Agent',
  description: 'Specialized for testing, QA, and quality assurance',
  version: '1.0.0',
  capabilities: ['testing', 'coding'],
  taskTypes: ['test', 'qa', 'verify', 'validate', 'quality'],
  systemPrompt: `You are a specialized testing agent for quality assurance.

Your strengths:
- Writing comprehensive tests
- Identifying edge cases
- Test coverage analysis
- Performance testing
- Security testing

Prioritize test quality over quantity. Ensure tests are maintainable.`,
  preferredModel: 'gpt-4o',
  isBuiltIn: true,
};

/**
 * Review agent - specialized for code review
 */
const REVIEW_AGENT: PiAgentMetadata = {
  id: 'review-agent',
  name: 'Review Agent',
  description: 'Specialized for code review, architecture review, and feedback',
  version: '1.0.0',
  capabilities: ['review', 'analysis'],
  taskTypes: ['review', 'feedback', 'architecture', 'design'],
  systemPrompt: `You are a specialized review agent for code and architecture review.

Your strengths:
- Code quality assessment
- Architecture patterns
- Security vulnerabilities
- Performance issues
- Best practices

Provide constructive, actionable feedback with specific examples.`,
  preferredModel: 'claude-sonnet-4-20250514',
  isBuiltIn: true,
};

/**
 * Documentation agent - specialized for documentation
 */
const DOCUMENTATION_AGENT: PiAgentMetadata = {
  id: 'documentation-agent',
  name: 'Documentation Agent',
  description: 'Specialized for documentation, README, and API docs',
  version: '1.0.0',
  capabilities: ['documentation', 'coding'],
  taskTypes: ['docs', 'documentation', 'readme', 'api-docs'],
  systemPrompt: `You are a specialized documentation agent.

Your strengths:
- Writing clear documentation
- API documentation
- README files
- Code comments
- Examples and tutorials

Make documentation accessible to the target audience. Include examples.`,
  preferredModel: 'gpt-4o',
  isBuiltIn: true,
};

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private readonly catalog = new PiAgentCatalog('research-agent');

  constructor() {
    // Register built-in agents
    this.registerBuiltinAgents();
  }

  /**
   * Register built-in agents
   */
  private registerBuiltinAgents(): void {
    const builtInAgents = [
      RESEARCH_AGENT,
      CODING_AGENT,
      DEBUGGING_AGENT,
      TESTING_AGENT,
      REVIEW_AGENT,
      DOCUMENTATION_AGENT,
    ];

    for (const agent of builtInAgents) {
      this.register(agent);
    }

    info('agent', `Registered ${builtInAgents.length} built-in agents`);
  }

  /**
   * Register an agent
   */
  register(agent: PiAgentMetadata): void {
    if (this.catalog.has(agent.id)) {
      warn('agent', `Agent ${agent.id} already registered, overwriting`);
    }
    this.catalog.register(toPiAgentSpec(agent), { isBuiltIn: agent.isBuiltIn, source: 'registry' });
    info('agent', `Registered Pi agent: ${agent.id} (${agent.name})`);
  }

  /**
   * Unregister an agent
   */
  unregister(id: string, force: boolean = false): boolean {
    return this.catalog.unregister(id, force);
  }

  /**
   * Get an agent by ID
   */
  get(id: string): PiAgentMetadata | undefined {
    const record = this.catalog.get(id);
    return record ? fromPiAgentSpec(record.spec, record.isBuiltIn) : undefined;
  }

  /**
   * Get all agents
   */
  getAll(): PiAgentMetadata[] {
    return this.catalog.getAll().map(({ spec, isBuiltIn }) => fromPiAgentSpec(spec, isBuiltIn));
  }

  /**
   * Get agents by capability
   */
  getByCapability(capability: AgentCapability): PiAgentMetadata[] {
    return this.getAll().filter(agent =>
      agent.capabilities.includes(capability)
    );
  }

  /**
   * Get agents by task type
   */
  getByTaskType(taskType: string): PiAgentMetadata[] {
    return this.getAll().filter(agent =>
      agent.taskTypes.some(t => taskType.toLowerCase().includes(t.toLowerCase()))
    );
  }

  /**
   * Select best agent for a task
   */
  selectAgent(taskDescription: string): PiAgentMetadata {
    const taskType = taskDescription.toLowerCase();

    // Try to match by task type
    const byTaskType = this.getByTaskType(taskType);
    if (byTaskType.length > 0) {
      return byTaskType[0];
    }

    // Try to match by keywords
    const keywords: Record<string, AgentCapability> = {
      'research': 'research',
      'financial': 'research',
      'analysis': 'analysis',
      'implement': 'coding',
      'code': 'coding',
      'build': 'coding',
      'create': 'coding',
      'debug': 'debugging',
      'fix': 'debugging',
      'error': 'debugging',
      'test': 'testing',
      'verify': 'testing',
      'review': 'review',
      'check': 'review',
      'docs': 'documentation',
      'document': 'documentation',
      'readme': 'documentation',
    };

    for (const [keyword, capability] of Object.entries(keywords)) {
      if (taskType.includes(keyword)) {
        const byCapability = this.getByCapability(capability);
        if (byCapability.length > 0) {
          return byCapability[0];
        }
      }
    }

    // Fall back to default
    return this.getDefaultAgent();
  }

  /**
   * Get default agent
   */
  getDefaultAgent(): PiAgentMetadata {
    try {
      const record = this.catalog.getDefault();
      return fromPiAgentSpec(record.spec, record.isBuiltIn);
    } catch {
      return RESEARCH_AGENT;
    }
  }

  /**
   * Set default agent
   */
  setDefaultAgent(id: string): void {
    if (!this.catalog.has(id)) {
      warn('agent', `Agent ${id} not found, cannot set as default`);
      return;
    }
    this.catalog.setDefault(id);
    info('agent', `Default agent set to: ${id}`);
  }

  /**
   * Check if agent exists
   */
  has(id: string): boolean {
    return this.catalog.has(id);
  }

  /**
   * Get agent count
   */
  get count(): number {
    return this.catalog.count;
  }

  /**
   * Get built-in agents
   */
  getBuiltInAgents(): PiAgentMetadata[] {
    return this.getAll().filter(agent => agent.isBuiltIn);
  }

  /**
   * Get Pi agents
   */
  getUserAgents(): PiAgentMetadata[] {
    return this.getAll().filter(agent => !agent.isBuiltIn);
  }

  /**
   * Register a Pi agent from definition
   */
  registerPiAgent(definition: Omit<PiAgentMetadata, 'isBuiltIn'>): void {
    this.register({
      ...definition,
      isBuiltIn: false,
    });
  }
}

// ============================================================================
// Singleton
// ============================================================================

let agentRegistry: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!agentRegistry) {
    agentRegistry = new AgentRegistry();
  }
  return agentRegistry;
}

export function resetAgentRegistry(): void {
  agentRegistry = null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the best agent for a task
 */
export function selectAgentForTask(taskDescription: string): PiAgentMetadata {
  return getAgentRegistry().selectAgent(taskDescription);
}

/**
 * Get all available agent IDs
 */
export function getAvailableAgents(): string[] {
  return getAgentRegistry().getAll().map(a => a.id);
}
