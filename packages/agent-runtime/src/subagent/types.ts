/**
 * Subagent System - Enhanced Features
 *
 * Extensions to the base subagent system:
 * - forkSubagent: Fork with full context inheritance
 * - resumeAgent: Resume paused/stopped agents
 * - agentMemory: Agent-specific memory management
 * - builtInAgents: Built-in specialized agent types
 * - loadAgentsDir: Load agents from a directory
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  SubagentRunner,
  getDefaultSubagentRunner,
  resetDefaultSubagentRunner,
} from '../subagent-runner';
import type {
  SubagentConfig,
  SubagentContext,
  SubagentResult,
  SubagentTask,
  SubagentTaskStatus,
} from '.';
import { info, warn } from '@upup/utils/logging';
import { randomUUID } from 'crypto';

// ============================================================================
// Agent Memory System
// ============================================================================

export interface AgentMemory {
  /** Memory ID */
  id: string;
  /** Agent/session ID this memory belongs to */
  agentId: string;
  /** Memory content */
  content: string;
  /** Memory type */
  type: 'context' | 'result' | 'intermediate' | 'summary';
  /** Created at */
  createdAt: Date;
  /** Access count */
  accessCount: number;
}

class AgentMemoryStore {
  private memories: Map<string, AgentMemory> = new Map();
  private byAgent: Map<string, Set<string>> = new Map();

  create(memory: Omit<AgentMemory, 'accessCount'>): AgentMemory {
    const entry: AgentMemory = { ...memory, accessCount: 0 };

    // Add to main store
    this.memories.set(entry.id, entry);

    // Add to agent index
    if (!this.byAgent.has(entry.agentId)) {
      this.byAgent.set(entry.agentId, new Set());
    }
    this.byAgent.get(entry.agentId)!.add(entry.id);

    return entry;
  }

  get(id: string): AgentMemory | undefined {
    const memory = this.memories.get(id);
    if (memory) {
      memory.accessCount++;
    }
    return memory;
  }

  getByAgent(agentId: string): AgentMemory[] {
    const ids = this.byAgent.get(agentId);
    if (!ids) return [];

    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is AgentMemory => m !== undefined)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  update(id: string, updates: Partial<AgentMemory>): boolean {
    const memory = this.memories.get(id);
    if (!memory) return false;

    this.memories.set(id, { ...memory, ...updates });
    return true;
  }

  delete(id: string): boolean {
    const memory = this.memories.get(id);
    if (!memory) return false;

    this.memories.delete(id);
    this.byAgent.get(memory.agentId)?.delete(id);

    return true;
  }

  deleteByAgent(agentId: string): number {
    const ids = this.byAgent.get(agentId);
    if (!ids) return 0;

    let deleted = 0;
    for (const id of ids) {
      if (this.memories.delete(id)) deleted++;
    }
    this.byAgent.delete(agentId);

    return deleted;
  }

  getContext(agentId: string, maxAge?: number): string {
    const memories = this.getByAgent(agentId);
    const now = Date.now();

    const relevant = memories.filter(m => {
      if (maxAge) {
        const age = now - m.createdAt.getTime();
        if (age > maxAge) return false;
      }
      return m.type === 'context' || m.type === 'result' || m.type === 'summary';
    });

    return relevant
      .map(m => `[${m.type}] ${m.content}`)
      .join('\n\n');
  }

  clear(): void {
    this.memories.clear();
    this.byAgent.clear();
  }
}

const agentMemoryStore = new AgentMemoryStore();

// ============================================================================
// Built-in Agent Definitions
// ============================================================================

export const BUILT_IN_AGENTS: Record<string, {
  description: string;
  systemPrompt: string;
  tools: string[] | '*';
  maxTurns: number;
}> = {
  'code-reviewer': {
    description: 'Specialized in code review, bug detection, and quality analysis',
    systemPrompt: `You are a code reviewer agent. Focus on:
- Identifying bugs, security issues, and code smells
- Checking code style consistency
- Verifying tests coverage
- Suggesting improvements and best practices
- Analyzing complexity and maintainability

Be thorough but constructive. Always cite specific lines when suggesting changes.`,
    tools: ['read_file', 'glob', 'grep', 'edit_file'],
    maxTurns: 30,
  },
  'researcher': {
    description: 'Specialized in web research, information gathering, and synthesis',
    systemPrompt: `You are a research agent. Focus on:
- Searching for relevant information
- Synthesizing findings from multiple sources
- Providing well-sourced answers
- Identifying knowledge gaps
- Organizing information clearly

Always cite your sources. Be comprehensive but concise.`,
    tools: ['web_search', 'web_fetch', 'memory_search'],
    maxTurns: 40,
  },
  'tester': {
    description: 'Specialized in writing and running tests',
    systemPrompt: `You are a testing agent. Focus on:
- Writing comprehensive unit and integration tests
- Identifying edge cases
- Mocking external dependencies
- Following testing best practices
- Achieving high coverage

Write tests that are maintainable and informative when they fail.`,
    tools: ['read_file', 'glob', 'write_file', 'edit_file'],
    maxTurns: 50,
  },
  'architect': {
    description: 'Specialized in system design and architecture decisions',
    systemPrompt: `You are a software architect agent. Focus on:
- System design and component relationships
- Scalability and performance considerations
- Trade-offs and alternatives
- Best practices and design patterns
- Technical debt assessment

Provide clear rationale for recommendations.`,
    tools: ['read_file', 'glob', 'grep', 'write_file'],
    maxTurns: 20,
  },
  'debugger': {
    description: 'Specialized in debugging and problem diagnosis',
    systemPrompt: `You are a debugging agent. Focus on:
- Reproducing and isolating issues
- Identifying root causes
- Finding related error patterns
- Suggesting fixes with confidence levels
- Verifying fixes work

Be systematic. Start with the most likely causes.`,
    tools: ['read_file', 'grep', 'bash'],
    maxTurns: 30,
  },
  'refactorer': {
    description: 'Specialized in code refactoring and improvement',
    systemPrompt: `You are a refactoring agent. Focus on:
- Improving code structure and readability
- Reducing duplication
- Improving naming and documentation
- Modernizing legacy code
- Maintaining backward compatibility

Make small, safe changes. Verify each change doesn't break existing behavior.`,
    tools: ['read_file', 'glob', 'grep', 'edit_file', 'write_file'],
    maxTurns: 50,
  },
};

// ============================================================================
// Agent Directory Loader
// ============================================================================

export interface LoadedAgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[] | '*';
  maxTurns: number;
  source: 'builtin' | 'file';
}

class AgentDirectoryLoader {
  private loadedAgents: Map<string, LoadedAgentDefinition> = new Map();
  private initialized = false;

  async loadFromDirectory(dirPath: string): Promise<number> {
    // In a real implementation, this would read from filesystem
    // For now, we'll add built-in agents
    let count = 0;

    for (const [name, agent] of Object.entries(BUILT_IN_AGENTS)) {
      this.loadedAgents.set(name, {
        name,
        ...agent,
        source: 'builtin',
      });
      count++;
    }

    this.initialized = true;
    return count;
  }

  get(name: string): LoadedAgentDefinition | undefined {
    return this.loadedAgents.get(name);
  }

  list(): LoadedAgentDefinition[] {
    return Array.from(this.loadedAgents.values());
  }

  listBuiltIn(): LoadedAgentDefinition[] {
    return this.list().filter(a => a.source === 'builtin');
  }

  listFromFiles(): LoadedAgentDefinition[] {
    return this.list().filter(a => a.source === 'file');
  }

  register(agent: LoadedAgentDefinition): void {
    this.loadedAgents.set(agent.name, agent);
  }

  unregister(name: string): boolean {
    return this.loadedAgents.delete(name);
  }

  clear(): void {
    this.loadedAgents.clear();
    this.initialized = false;
  }
}

const agentDirectoryLoader = new AgentDirectoryLoader();

// ============================================================================
// Enhanced Subagent Runner
// ============================================================================

export class EnhancedSubagentRunner extends SubagentRunner {
  private memoryStore: AgentMemoryStore;
  private directoryLoader: AgentDirectoryLoader;
  private pausedAgents: Map<string, {
    config: SubagentConfig;
    prompt: string;
    context?: SubagentContext;
    checkpoint: string;
    pausedAt: Date;
  }> = new Map();

  constructor() {
    super();
    this.memoryStore = agentMemoryStore;
    this.directoryLoader = agentDirectoryLoader;
  }

  /**
   * Fork a subagent with full context inheritance
   */
  async fork(
    parentAgentId: string,
    prompt: string,
    options?: {
      tools?: string[] | '*';
      maxTurns?: number;
      cwd?: string;
    }
  ): Promise<SubagentResult> {
    // Get parent's context/memory
    const parentMemory = this.memoryStore.getContext(parentAgentId);

    // Build fork config
    const config: SubagentConfig = {
      type: 'fork',
      tools: options?.tools || '*',
      maxTurns: options?.maxTurns || 200,
      cwd: options?.cwd,
      systemPrompt: parentMemory ? `CONTEXT FROM PARENT AGENT:\n${parentMemory}\n\n---\n\n` : undefined,
    };

    return this.run(config, prompt);
  }

  /**
   * Pause an agent and save checkpoint
   */
  pause(taskId: string, checkpoint: string): boolean {
    const task = this.getTask(taskId);
    if (!task || task.status !== 'running') return false;

    this.pausedAgents.set(taskId, {
      config: task.config,
      prompt: task.prompt,
      pausedAt: new Date(),
      checkpoint,
    });

    // Cancel the running task but save state
    this.cancelTask(taskId).catch(() => {});
    return true;
  }

  /**
   * Resume a paused agent
   */
  async resume(taskId: string, additionalPrompt?: string): Promise<string> {
    const paused = this.pausedAgents.get(taskId);
    if (!paused) {
      throw new Error(`No paused task found for: ${taskId}`);
    }

    // Clear paused state
    this.pausedAgents.delete(taskId);

    // Build resumed prompt
    const resumedPrompt = `${paused.checkpoint}\n\n---\n\nPREVIOUS STATE: Task was paused. Please continue from where it left off.\n\n${additionalPrompt || ''}`;

    // Run with same config
    return this.runAsync(paused.config, resumedPrompt);
  }

  /**
   * Get paused agent info
   */
  getPausedAgent(taskId: string): { checkpoint: string; pausedAt: Date } | undefined {
    const paused = this.pausedAgents.get(taskId);
    if (!paused) return undefined;

    return {
      checkpoint: paused.checkpoint,
      pausedAt: paused.pausedAt,
    };
  }

  /**
   * Store agent memory
   */
  storeMemory(
    agentId: string,
    content: string,
    type: AgentMemory['type'] = 'intermediate'
  ): AgentMemory {
    return this.memoryStore.create({
      id: randomUUID(),
      agentId,
      content,
      type,
      createdAt: new Date(),
    });
  }

  /**
   * Get agent memory context
   */
  getMemoryContext(agentId: string, maxAgeMs?: number): string {
    return this.memoryStore.getContext(agentId, maxAgeMs);
  }

  /**
   * List built-in agents
   */
  listBuiltInAgents(): LoadedAgentDefinition[] {
    return this.directoryLoader.listBuiltIn();
  }

  /**
   * Get agent definition
   */
  getAgentDefinition(name: string): LoadedAgentDefinition | undefined {
    return this.directoryLoader.get(name);
  }

  /**
   * Run a built-in agent type
   */
  async runBuiltIn(
    agentType: string,
    prompt: string,
    options?: {
      maxTurns?: number;
      cwd?: string;
    }
  ): Promise<SubagentResult> {
    const definition = this.directoryLoader.get(agentType);
    if (!definition) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    const config: SubagentConfig = {
      type: 'specialized',
      name: agentType,
      tools: definition.tools,
      maxTurns: options?.maxTurns || definition.maxTurns,
      cwd: options?.cwd,
      systemPrompt: definition.systemPrompt,
    };

    return this.run(config, prompt);
  }

  /**
   * Initialize directory loader
   */
  async initializeAgents(dirPath?: string): Promise<number> {
    return this.directoryLoader.loadFromDirectory(dirPath || '');
  }
}

// ============================================================================
// Tool Schemas
// ============================================================================

export const FORK_SUBAGENT_DESCRIPTION = `
Fork a subagent with full context inheritance from the parent agent.

Use this when you want to continue work in a new agent while preserving
all context, memory, and state from the parent agent.

Examples:
- Continue a complex task with fresh perspective
- Work on a subtask while preserving parent context
- Branch exploration while keeping original task state`;

export const ForkSubagentSchema = z.object({
  prompt: z.string().describe('The task for the forked agent'),
  tools: z.array(z.string()).optional().describe('Tools to make available'),
  max_turns: z.number().optional().describe('Maximum turns'),
  cwd: z.string().optional().describe('Working directory'),
});

export const RESUME_AGENT_DESCRIPTION = `
Resume a previously paused agent to continue its task.

Use this when an agent was paused (e.g., waiting for user input)
and you want to continue its execution.

Examples:
- Continue after user provides additional information
- Resume after approval is granted
- Complete a partial task`;

export const ResumeAgentSchema = z.object({
  task_id: z.string().describe('The task ID to resume'),
  additional_prompt: z.string().optional().describe('Additional context or instructions'),
});

export const AGENT_MEMORY_DESCRIPTION = `
Store or retrieve memory associated with an agent session.

Use this to:
- Save intermediate results between agent runs
- Store context for future reference
- Share information between agents
- Track agent progress

Examples:
- Save a draft for later review
- Store extracted data
- Save analysis results`;

export const AgentMemorySchema = z.object({
  action: z.enum(['store', 'get', 'list', 'clear']).describe('Action to perform'),
  content: z.string().optional().describe('Memory content to store'),
  memory_type: z.enum(['context', 'result', 'intermediate', 'summary']).optional().describe('Type of memory'),
  max_age_minutes: z.number().optional().describe('Max age for retrieval (minutes)'),
});

export const LIST_AGENTS_DESCRIPTION = `
List available built-in agent types.

Use this to discover specialized agents for specific tasks:
- code-reviewer: Code review and quality analysis
- researcher: Web research and information synthesis
- tester: Test writing and execution
- architect: System design and architecture
- debugger: Problem diagnosis and debugging
- refactorer: Code improvement and refactoring`;

export const ListAgentsSchema = z.object({
  filter: z.enum(['all', 'builtin', 'custom']).optional().describe('Filter agent list'),
});

export const RUN_BUILTIN_AGENT_DESCRIPTION = `
Run a built-in specialized agent for specific task types.

Examples:
- code-reviewer: Review a file or PR
- researcher: Research a topic thoroughly
- tester: Write tests for a module
- architect: Design a system component
- debugger: Debug an issue
- refactorer: Improve code quality`;

export const RunBuiltInAgentSchema = z.object({
  agent_type: z.string().describe('The built-in agent type to run'),
  prompt: z.string().describe('The task for the agent'),
  max_turns: z.number().optional().describe('Maximum turns'),
  cwd: z.string().optional().describe('Working directory'),
});

// ============================================================================
// Tool Factories
// ============================================================================

export function createForkSubagentTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'fork_subagent',
    description: FORK_SUBAGENT_DESCRIPTION,
    schema: ForkSubagentSchema,
    async func(input): Promise<string> {
      const runner = getDefaultSubagentRunner() as EnhancedSubagentRunner;
      // Use session ID as parent agent ID so memory context is inherited
      const agentId = process.env.UPUP_SESSION_ID || 'default';

      const result = await runner.fork(agentId, input.prompt, {
        tools: input.tools,
        maxTurns: input.max_turns,
        cwd: input.cwd,
      });

      if (result.success) {
        return `Fork completed.\n\nOutput:\n${result.output}`;
      } else {
        return `Fork failed: ${result.error}`;
      }
    },
  });
}

export function createResumeAgentTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'resume_agent',
    description: RESUME_AGENT_DESCRIPTION,
    schema: ResumeAgentSchema,
    async func(input): Promise<string> {
      const runner = getDefaultSubagentRunner() as EnhancedSubagentRunner;

      const paused = runner.getPausedAgent(input.task_id);
      if (!paused) {
        return `No paused task found for: ${input.task_id}`;
      }

      const taskId = await runner.resume(input.task_id, input.additional_prompt);

      return `Agent resumed: ${taskId}\n\nUse task_get or task_list to check progress.`;
    },
  });
}

export function createAgentMemoryTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'agent_memory',
    description: AGENT_MEMORY_DESCRIPTION,
    schema: AgentMemorySchema,
    async func(input): Promise<string> {
      const runner = getDefaultSubagentRunner() as EnhancedSubagentRunner;
      const agentId = 'default'; // Could be tied to session

      switch (input.action) {
        case 'store': {
          if (!input.content) {
            return 'Error: content is required for store action';
          }
          const memory = runner.storeMemory(
            agentId,
            input.content,
            input.memory_type as AgentMemory['type'] || 'intermediate'
          );
          return `Memory stored.\n\nID: ${memory.id}\nType: ${memory.type}\nContent: ${memory.content.slice(0, 100)}...`;
        }

        case 'get': {
          const maxAge = input.max_age_minutes ? input.max_age_minutes * 60 * 1000 : undefined;
          const context = runner.getMemoryContext(agentId, maxAge);
          if (!context) {
            return 'No memory found.';
          }
          return `Memory Context:\n\n${context}`;
        }

        case 'list': {
          const memories = agentMemoryStore.getByAgent(agentId);
          if (memories.length === 0) {
            return 'No memories stored.';
          }
          return `Stored Memories:\n\n${memories.map(m =>
            `- [${m.type}] ${m.content.slice(0, 80)}... (accessed ${m.accessCount}x)`
          ).join('\n')}`;
        }

        case 'clear': {
          const deleted = agentMemoryStore.deleteByAgent(agentId);
          return `Cleared ${deleted} memories.`;
        }
      }
      return 'Unknown action';
    },
  });
}

export function createListAgentsTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_agents',
    description: LIST_AGENTS_DESCRIPTION,
    schema: ListAgentsSchema,
    async func(input): Promise<string> {
      const runner = getDefaultSubagentRunner() as EnhancedSubagentRunner;

      await runner.initializeAgents();
      const agents = runner.listBuiltInAgents();

      const filtered = input.filter === 'custom'
        ? agents.filter(a => a.source === 'file')
        : input.filter === 'builtin'
          ? agents.filter(a => a.source === 'builtin')
          : agents;

      if (filtered.length === 0) {
        return 'No agents found.';
      }

      return `Available Agents:\n\n${filtered.map(a =>
        `**${a.name}**\n  ${a.description}\n  Tools: ${Array.isArray(a.tools) ? a.tools.join(', ') : 'all'}\n`
      ).join('\n')}`;
    },
  });
}

export function createRunBuiltInAgentTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'run_builtin_agent',
    description: RUN_BUILTIN_AGENT_DESCRIPTION,
    schema: RunBuiltInAgentSchema,
    async func(input): Promise<string> {
      const runner = getDefaultSubagentRunner() as EnhancedSubagentRunner;

      try {
        await runner.initializeAgents();
        const result = await runner.runBuiltIn(input.agent_type, input.prompt, {
          maxTurns: input.max_turns,
          cwd: input.cwd,
        });

        if (result.success) {
          return `${input.agent_type} completed:\n\n${result.output}`;
        } else {
          return `${input.agent_type} failed: ${result.error}`;
        }
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================

export {
  agentMemoryStore,
  agentDirectoryLoader,
};

export function resetEnhancedSubagentRunner(): void {
  agentMemoryStore.clear();
  agentDirectoryLoader.clear();
  resetDefaultSubagentRunner();
}
