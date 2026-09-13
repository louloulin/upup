import type { AgentCapability } from '../runtime/pi/registry.js';

import type { PiAgentMetadata } from '../runtime/pi/registry.js';
import { getAgentRegistry } from '../runtime/pi/registry.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';
import type {
  UpUpAgentMode,
  UpUpAgentSpec,
  UpUpDataPolicy,
  UpUpOutputContract,
  UpUpPermissionProfile,
} from '../runtime/pi/types.js';
import { agentDefinitionToPiSpec } from '../runtime/pi/agent-spec.js';
import { PiAgentCatalog } from '../runtime/pi/agent-catalog.js';

// ============================================================================
// Pi Agent Types
// ============================================================================

export interface PiAgentSpecInput {
  /** Unique ID for the agent */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** System prompt template (supports {variables}) */
  systemPrompt: string;
  /** Tools this agent can use */
  tools?: string[];
  /** Preferred model */
  model?: string;
  /** Agent type (researcher/reviewer/debugger/coordinator) */
  agentType?: 'researcher' | 'reviewer' | 'debugger' | 'coordinator' | 'executor' | 'analyst';
  /** Context mode (inline/fork/swarm) */
  context?: 'inline' | 'fork' | 'swarm';
  /** Max iterations */
  maxIterations?: number;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Variables for system prompt template */
  variables?: Record<string, string>;
  /** Capabilities */
  capabilities?: string[];
  /** Task types */
  taskTypes?: string[];
  /** Pi-native skills and workflow resources */
  skills?: string[];
  workflow?: string;
  mode?: UpUpAgentMode;
  permissions?: UpUpPermissionProfile;
  dataPolicy?: UpUpDataPolicy;
  outputContract?: UpUpOutputContract;
}

export interface PiAgentRecord {
  /** Unique agent ID */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** System prompt (rendered with variables) */
  systemPrompt: string;
  /** Tools this agent can use */
  tools: string[];
  /** Preferred model */
  model?: string;
  /** Agent type */
  agentType: string;
  /** Context mode */
  context: string;
  /** Max iterations */
  maxIterations: number;
  /** Timeout */
  timeoutMs: number;
  /** Created at timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Usage count */
  usageCount: number;
  /** Authoritative Pi executable specification. */
  spec: UpUpAgentSpec;
}

// ============================================================================
// Agent Templates
// ============================================================================

export interface AgentTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Default configuration */
  defaultConfig: Partial<PiAgentSpecInput>;
  /** Category */
  category: 'research' | 'analysis' | 'execution' | 'coordination' | 'custom';
}

// Pre-defined templates
const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'financial-researcher',
    name: 'Financial Researcher',
    description: 'Specialized for financial research and data analysis',
    category: 'research',
    defaultConfig: {
      agentType: 'researcher',
      context: 'fork',
      maxIterations: 20,
      capabilities: ['financial-research', 'data-analysis', 'web-search'],
    },
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews code for bugs, security issues, and best practices',
    category: 'analysis',
    defaultConfig: {
      agentType: 'reviewer',
      context: 'inline',
      maxIterations: 10,
      capabilities: ['code-analysis', 'security-scan', 'best-practices'],
    },
  },
  {
    id: 'bug-hunter',
    name: 'Bug Hunter',
    description: 'Identifies and diagnoses software bugs',
    category: 'analysis',
    defaultConfig: {
      agentType: 'debugger',
      context: 'inline',
      maxIterations: 15,
      capabilities: ['debugging', 'root-cause', 'fix-suggestion'],
    },
  },
  {
    id: 'task-coordinator',
    name: 'Task Coordinator',
    description: 'Coordinates multiple agents for complex tasks',
    category: 'coordination',
    defaultConfig: {
      agentType: 'coordinator',
      context: 'swarm',
      maxIterations: 5,
      capabilities: ['task-decomposition', 'agent-management', 'result-aggregation'],
    },
  },
  {
    id: 'batch-processor',
    name: 'Batch Processor',
    description: 'Processes multiple tasks in parallel',
    category: 'execution',
    defaultConfig: {
      agentType: 'executor',
      context: 'swarm',
      maxIterations: 10,
      capabilities: ['parallel-execution', 'batch-processing'],
    },
  },
  {
    id: 'portfolio-analyst',
    name: 'Portfolio Analyst',
    description: 'Analyzes investment portfolios and provides recommendations',
    category: 'analysis',
    defaultConfig: {
      agentType: 'analyst',
      context: 'inline',
      maxIterations: 12,
      capabilities: ['portfolio-analysis', 'risk-assessment', 'recommendations'],
    },
  },
];

// ============================================================================
// Pi Agent Registry
// ============================================================================

export class PiAgentRegistry {
  private static instance: PiAgentRegistry | null = null;
  private readonly catalog = new PiAgentCatalog('');
  private readonly usage = new Map<string, { createdAt: number; usageCount: number; lastUsedAt?: number }>();
  private templates: Map<string, AgentTemplate> = new Map();

  private constructor() {
    // Initialize with templates
    for (const template of AGENT_TEMPLATES) {
      this.templates.set(template.id, template);
    }
    info('agent-registry', `Initialized with ${AGENT_TEMPLATES.length} templates`);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PiAgentRegistry {
    if (!PiAgentRegistry.instance) {
      PiAgentRegistry.instance = new PiAgentRegistry();
    }
    return PiAgentRegistry.instance;
  }

  /**
   * Register a Pi agent
   */
  register(config: PiAgentSpecInput): PiAgentRecord {
    if (this.catalog.has(config.id)) {
      warn('agent-registry', `Agent ${config.id} already registered, updating`);
    }

    const systemPrompt = this.renderTemplate(config.systemPrompt, config.variables || {});
    const spec = agentDefinitionToPiSpec({
      id: config.id,
      name: config.name,
      description: config.description,
      systemPrompt,
      preferredModel: config.model,
      capabilities: config.capabilities,
      taskTypes: config.taskTypes,
      skills: config.skills,
      mode: config.mode,
      permissions: config.permissions,
      workflow: config.workflow,
      dataPolicy: config.dataPolicy,
      outputContract: config.outputContract,
      timeoutMs: config.timeoutMs,
      config: config.tools?.length ? { tools: config.tools } : undefined,
    });
    this.catalog.register(spec, { source: 'pi-agent' });
    const previous = this.usage.get(config.id);
    this.usage.set(config.id, previous ?? { createdAt: Date.now(), usageCount: 0 });
    const agent = this.toAgentRecord(spec);
    
    // Also register with global agent registry
    try {
      const registry = getAgentRegistry();
      registry.registerPiAgent({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        version: '1.0.0',
        systemPrompt: agent.systemPrompt,
        capabilities: (config.capabilities || []).filter((c: string) => ["research", "coding", "debugging", "refactoring", "testing", "documentation", "deployment", "review", "analysis"].includes(c)) as AgentCapability[],
        taskTypes: config.taskTypes || [],
        preferredModel: agent.model,
        config: {
          tools: agent.tools,
          maxIterations: agent.maxIterations,
          agentType: agent.agentType,
          context: agent.context,
        },
      });
      info('agent-registry', `Registered Pi agent: ${agent.name}`);
    } catch (error) {
      logError('agent-registry', `Failed to register with global registry`, error instanceof Error ? error : undefined);
    }

    return agent;
  }

  /**
   * Unregister a Pi agent
   */
  unregister(agentId: string): boolean {
    const deleted = this.catalog.unregister(agentId, true);
    this.usage.delete(agentId);
    getAgentRegistry().unregister(agentId, true);
    if (deleted) {
      info('agent-registry', `Unregistered agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Get a Pi agent by ID
   */
  getAgent(agentId: string): PiAgentRecord | undefined {
    const record = this.catalog.get(agentId);
    return record ? this.toAgentRecord(record.spec) : undefined;
  }

  /**
   * Get all Pi agents
   */
  getAllAgents(): PiAgentRecord[] {
    return this.catalog.getAll().map(({ spec }) => this.toAgentRecord(spec));
  }

  /**
   * Get agents by type
   */
  getAgentsByType(agentType: string): PiAgentRecord[] {
    return this.getAllAgents().filter(a => a.agentType === agentType);
  }

  /**
   * Get agents by context
   */
  getAgentsByContext(context: string): PiAgentRecord[] {
    return this.getAllAgents().filter(a => a.context === context);
  }

  /**
   * Update agent usage stats
   */
  recordUsage(agentId: string): void {
    const stats = this.usage.get(agentId);
    if (stats) {
      stats.usageCount++;
      stats.lastUsedAt = Date.now();
    }
  }

  /**
   * Create agent from template
   */
  createFromTemplate(templateId: string, overrides?: Partial<PiAgentSpecInput>): PiAgentRecord | null {
    const template = this.templates.get(templateId);
    if (!template) {
      warn('agent-registry', `Template not found: ${templateId}`);
      return null;
    }

    const config: PiAgentSpecInput = {
      id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides?.name || template.name,
      description: overrides?.description || template.description,
      systemPrompt: overrides?.systemPrompt || this.getDefaultSystemPrompt(template),
      ...template.defaultConfig,
      ...overrides,
    };

    return this.register(config);
  }

  /**
   * Get all templates
   */
  getTemplates(): AgentTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: AgentTemplate['category']): AgentTemplate[] {
    return this.getTemplates().filter(t => t.category === category);
  }

  /**
   * Get most used agents
   */
  getMostUsed(limit: number = 5): PiAgentRecord[] {
    return this.getAllAgents()
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  private toAgentRecord(spec: UpUpAgentSpec): PiAgentRecord {
    const stats = this.usage.get(spec.id) ?? { createdAt: Date.now(), usageCount: 0 };
    const agentType = spec.capabilities[0] ?? 'executor';
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      systemPrompt: spec.systemPrompt ?? '',
      tools: spec.tools === '*' ? [] : [...spec.tools],
      ...(spec.model ? { model: spec.model } : {}),
      agentType,
      context: spec.mode === 'worker' ? 'swarm' : 'inline',
      maxIterations: 10,
      timeoutMs: spec.timeoutMs ?? 300000,
      createdAt: stats.createdAt,
      ...(stats.lastUsedAt ? { lastUsedAt: stats.lastUsedAt } : {}),
      usageCount: stats.usageCount,
      spec,
    };
  }

  /**
   * Render system prompt template
   */
  private renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return rendered;
  }

  /**
   * Get default system prompt for template
   */
  private getDefaultSystemPrompt(template: AgentTemplate): string {
    const prompts: Record<string, string> = {
      'financial-researcher': `You are a specialized financial researcher agent.
Your role: {role}
Focus areas: financial research, data gathering, and analysis.

Guidelines:
- Use web search and financial tools to gather data
- Provide accurate and well-sourced information
- Format results in clear markdown tables
- Think step by step before responding`,

      'code-reviewer': `You are a code review agent.
Your role: {role}
Focus: reviewing code for quality, bugs, and best practices.

Guidelines:
- Check for security vulnerabilities
- Verify code follows best practices
- Look for potential bugs and edge cases
- Provide constructive feedback`,

      'bug-hunter': `You are a bug hunting agent.
Your role: {role}
Focus: identifying and diagnosing software issues.

Guidelines:
- Reproduce the issue when possible
- Trace the root cause systematically
- Suggest specific fixes
- Test your hypotheses`,

      'task-coordinator': `You are a task coordination agent.
Your role: {role}
Focus: coordinating multiple agents for complex tasks.

Guidelines:
- Break down complex tasks into subtasks
- Assign work to appropriate agents
- Monitor progress and handle failures
- Aggregate and present final results`,

      'batch-processor': `You are a batch processing agent.
Your role: {role}
Focus: processing multiple items efficiently.

Guidelines:
- Process items in parallel when possible
- Track progress and handle failures
- Report results concisely`,

      'portfolio-analyst': `You are a portfolio analysis agent.
Your role: {role}
Focus: analyzing investment portfolios and providing recommendations.

Guidelines:
- Analyze portfolio composition and risk
- Calculate key metrics (Sharpe, VaR, etc.)
- Compare against benchmarks
- Provide actionable recommendations`,
    };

    return prompts[template.id] || `You are a ${template.name} agent.\n${template.description}`;
  }

  /**
   * Export all agents as config
   */
  exportConfig(): PiAgentSpecInput[] {
    return this.catalog.getAll().map(({ spec }) => ({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      systemPrompt: spec.systemPrompt ?? '',
      tools: spec.tools === '*' ? undefined : [...spec.tools],
      model: spec.model,
      agentType: spec.capabilities[0] as PiAgentSpecInput['agentType'],
      context: spec.mode === 'worker' ? 'swarm' : spec.mode === 'subagent' ? 'fork' : 'inline',
      maxIterations: 10,
      timeoutMs: spec.timeoutMs,
      skills: spec.skills ? [...spec.skills] : undefined,
      capabilities: [...spec.capabilities],
      taskTypes: [...spec.taskTypes],
      mode: spec.mode,
      permissions: spec.permissions,
      workflow: spec.workflow,
      dataPolicy: spec.dataPolicy,
      outputContract: spec.outputContract,
    }));
  }

  /**
   * Import agents from config
   */
  importConfig(configs: PiAgentSpecInput[]): number {
    let imported = 0;
    for (const config of configs) {
      try {
        this.register(config);
        imported++;
      } catch (error) {
        logError('agent-registry', `Failed to import agent ${config.id}`, error instanceof Error ? error : undefined);
      }
    }
    return imported;
  }

  /**
   * Reset registry
   */
  reset(): void {
    for (const record of this.catalog.getAll()) {
      this.catalog.unregister(record.spec.id, true);
      getAgentRegistry().unregister(record.spec.id, true);
    }
    this.usage.clear();
    info('agent-registry', 'Registry reset');
  }
}

/**
 * Get Pi agent registry instance
 */
export function getPiAgentRegistry(): PiAgentRegistry {
  return PiAgentRegistry.getInstance();
}
