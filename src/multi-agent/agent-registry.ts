import type { AgentCapability } from '../agent/registry.js';
/**
 * Custom Agent Registry - 自定义Agent注册系统 (v1.0)
 * 
 * 支持自定义Agent的创建、注册、管理
 * 与现有的AgentRegistry和SwarmCoordinator集成
 */

import type { AgentDefinition } from '../agent/registry.js';
import { getAgentRegistry } from '../agent/registry.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';

// ============================================================================
// Custom Agent Types
// ============================================================================

export interface CustomAgentConfig {
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
}

export interface CustomAgent {
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
  defaultConfig: Partial<CustomAgentConfig>;
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
// Custom Agent Registry
// ============================================================================

export class CustomAgentRegistry {
  private static instance: CustomAgentRegistry | null = null;
  private customAgents: Map<string, CustomAgent> = new Map();
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
  static getInstance(): CustomAgentRegistry {
    if (!CustomAgentRegistry.instance) {
      CustomAgentRegistry.instance = new CustomAgentRegistry();
    }
    return CustomAgentRegistry.instance;
  }

  /**
   * Register a custom agent
   */
  register(config: CustomAgentConfig): CustomAgent {
    if (this.customAgents.has(config.id)) {
      warn('agent-registry', `Agent ${config.id} already registered, updating`);
    }

    const agent: CustomAgent = {
      id: config.id,
      name: config.name,
      description: config.description,
      systemPrompt: this.renderTemplate(config.systemPrompt, config.variables || {}),
      tools: config.tools || [],
      model: config.model,
      agentType: config.agentType || 'executor',
      context: config.context || 'inline',
      maxIterations: config.maxIterations || 10,
      timeoutMs: config.timeoutMs || 300000,
      createdAt: Date.now(),
      usageCount: 0,
    };

    this.customAgents.set(agent.id, agent);
    
    // Also register with global agent registry
    try {
      const registry = getAgentRegistry();
      registry.registerCustomAgent({
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
      info('agent-registry', `Registered custom agent: ${agent.name}`);
    } catch (error) {
      logError('agent-registry', `Failed to register with global registry`, error instanceof Error ? error : undefined);
    }

    return agent;
  }

  /**
   * Unregister a custom agent
   */
  unregister(agentId: string): boolean {
    const deleted = this.customAgents.delete(agentId);
    if (deleted) {
      info('agent-registry', `Unregistered agent: ${agentId}`);
    }
    return deleted;
  }

  /**
   * Get a custom agent by ID
   */
  getAgent(agentId: string): CustomAgent | undefined {
    return this.customAgents.get(agentId);
  }

  /**
   * Get all custom agents
   */
  getAllAgents(): CustomAgent[] {
    return Array.from(this.customAgents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(agentType: string): CustomAgent[] {
    return this.getAllAgents().filter(a => a.agentType === agentType);
  }

  /**
   * Get agents by context
   */
  getAgentsByContext(context: string): CustomAgent[] {
    return this.getAllAgents().filter(a => a.context === context);
  }

  /**
   * Update agent usage stats
   */
  recordUsage(agentId: string): void {
    const agent = this.customAgents.get(agentId);
    if (agent) {
      agent.usageCount++;
      agent.lastUsedAt = Date.now();
    }
  }

  /**
   * Create agent from template
   */
  createFromTemplate(templateId: string, overrides?: Partial<CustomAgentConfig>): CustomAgent | null {
    const template = this.templates.get(templateId);
    if (!template) {
      warn('agent-registry', `Template not found: ${templateId}`);
      return null;
    }

    const config: CustomAgentConfig = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  getMostUsed(limit: number = 5): CustomAgent[] {
    return this.getAllAgents()
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
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
  exportConfig(): CustomAgentConfig[] {
    return this.getAllAgents().map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
      model: agent.model,
      agentType: agent.agentType as any,
      context: agent.context as any,
      maxIterations: agent.maxIterations,
      timeoutMs: agent.timeoutMs,
    }));
  }

  /**
   * Import agents from config
   */
  importConfig(configs: CustomAgentConfig[]): number {
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
    this.customAgents.clear();
    info('agent-registry', 'Registry reset');
  }
}

/**
 * Get custom agent registry instance
 */
export function getCustomAgentRegistry(): CustomAgentRegistry {
  return CustomAgentRegistry.getInstance();
}
