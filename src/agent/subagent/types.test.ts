/**
 * Tests for enhanced subagent types and tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BUILT_IN_AGENTS,
  EnhancedSubagentRunner,
  agentMemoryStore,
  agentDirectoryLoader,
  createForkSubagentTool,
  createResumeAgentTool,
  createAgentMemoryTool,
  createListAgentsTool,
  createRunBuiltInAgentTool,
  FORK_SUBAGENT_DESCRIPTION,
  RESUME_AGENT_DESCRIPTION,
  AGENT_MEMORY_DESCRIPTION,
  LIST_AGENTS_DESCRIPTION,
  RUN_BUILTIN_AGENT_DESCRIPTION,
  ForkSubagentSchema,
  ResumeAgentSchema,
  AgentMemorySchema,
  ListAgentsSchema,
  RunBuiltInAgentSchema,
} from './types.js';

// ============================================================================
// agentMemoryStore Tests (module singleton)
// ============================================================================

describe('agentMemoryStore', () => {
  beforeEach(() => {
    agentMemoryStore.clear();
  });

  describe('create', () => {
    it('should create a memory entry', () => {
      const memory = agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Test content',
        type: 'context',
        createdAt: new Date(),
      });

      expect(memory.id).toBe('test-1');
      expect(memory.accessCount).toBe(0);
    });

    it('should index memory by agent', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Content 1',
        type: 'context',
        createdAt: new Date(),
      });
      agentMemoryStore.create({
        id: 'test-2',
        agentId: 'agent-2',
        content: 'Content 2',
        type: 'result',
        createdAt: new Date(),
      });

      const agent1Memories = agentMemoryStore.getByAgent('agent-1');
      expect(agent1Memories).toHaveLength(1);
      expect(agent1Memories[0].content).toBe('Content 1');
    });
  });

  describe('get', () => {
    it('should retrieve memory by id and increment access count', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Test content',
        type: 'context',
        createdAt: new Date(),
      });

      const memory = agentMemoryStore.get('test-1');
      expect(memory).toBeDefined();
      expect(memory!.content).toBe('Test content');
      expect(memory!.accessCount).toBe(1);

      const second = agentMemoryStore.get('test-1');
      expect(second!.accessCount).toBe(2);
    });

    it('should return undefined for non-existent memory', () => {
      const memory = agentMemoryStore.get('non-existent');
      expect(memory).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update memory fields', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Original',
        type: 'context',
        createdAt: new Date(),
      });

      const updated = agentMemoryStore.update('test-1', { content: 'Updated' });
      expect(updated).toBe(true);

      const memory = agentMemoryStore.get('test-1');
      expect(memory!.content).toBe('Updated');
    });

    it('should return false for non-existent memory', () => {
      const updated = agentMemoryStore.update('non-existent', { content: 'New' });
      expect(updated).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete memory and remove from agent index', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Test',
        type: 'context',
        createdAt: new Date(),
      });

      const deleted = agentMemoryStore.delete('test-1');
      expect(deleted).toBe(true);
      expect(agentMemoryStore.get('test-1')).toBeUndefined();
      expect(agentMemoryStore.getByAgent('agent-1')).toHaveLength(0);
    });

    it('should return false for non-existent memory', () => {
      const deleted = agentMemoryStore.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getContext', () => {
    it('should return formatted context string', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'First context',
        type: 'context',
        createdAt: new Date(),
      });
      agentMemoryStore.create({
        id: 'test-2',
        agentId: 'agent-1',
        content: 'Some result',
        type: 'result',
        createdAt: new Date(),
      });
      agentMemoryStore.create({
        id: 'test-3',
        agentId: 'agent-1',
        content: 'Intermediate step',
        type: 'intermediate',
        createdAt: new Date(),
      });

      const context = agentMemoryStore.getContext('agent-1');
      expect(context).toContain('[context] First context');
      expect(context).toContain('[result] Some result');
      expect(context).not.toContain('Intermediate step');
    });

    it('should filter by maxAge', () => {
      const now = Date.now();
      agentMemoryStore.create({
        id: 'test-old',
        agentId: 'agent-1',
        content: 'Old content',
        type: 'context',
        createdAt: new Date(now - 120000), // 2 minutes ago
      });
      agentMemoryStore.create({
        id: 'test-new',
        agentId: 'agent-1',
        content: 'New content',
        type: 'context',
        createdAt: new Date(now - 30000), // 30 seconds ago
      });

      const context = agentMemoryStore.getContext('agent-1', 60000); // 1 minute max
      expect(context).toContain('New content');
      expect(context).not.toContain('Old content');
    });

    it('should return empty string for unknown agent', () => {
      const context = agentMemoryStore.getContext('unknown-agent');
      expect(context).toBe('');
    });
  });

  describe('deleteByAgent', () => {
    it('should delete all memories for an agent', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Content 1',
        type: 'context',
        createdAt: new Date(),
      });
      agentMemoryStore.create({
        id: 'test-2',
        agentId: 'agent-1',
        content: 'Content 2',
        type: 'result',
        createdAt: new Date(),
      });

      const deleted = agentMemoryStore.deleteByAgent('agent-1');
      expect(deleted).toBe(2);
      expect(agentMemoryStore.getByAgent('agent-1')).toHaveLength(0);
    });

    it('should return 0 for unknown agent', () => {
      const deleted = agentMemoryStore.deleteByAgent('unknown-agent');
      expect(deleted).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all memories', () => {
      agentMemoryStore.create({
        id: 'test-1',
        agentId: 'agent-1',
        content: 'Content',
        type: 'context',
        createdAt: new Date(),
      });

      agentMemoryStore.clear();
      expect(agentMemoryStore.getByAgent('agent-1')).toHaveLength(0);
    });
  });
});

// ============================================================================
// BUILT_IN_AGENTS Tests
// ============================================================================

describe('BUILT_IN_AGENTS', () => {
  it('should have all 6 built-in agents', () => {
    const expectedAgents = [
      'code-reviewer',
      'researcher',
      'tester',
      'architect',
      'debugger',
      'refactorer',
    ];

    for (const agent of expectedAgents) {
      expect(BUILT_IN_AGENTS).toHaveProperty(agent);
    }
  });

  it('should have required fields for each agent', () => {
    for (const [, agent] of Object.entries(BUILT_IN_AGENTS)) {
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('systemPrompt');
      expect(agent).toHaveProperty('tools');
      expect(agent).toHaveProperty('maxTurns');
      expect(typeof agent.description).toBe('string');
      expect(typeof agent.systemPrompt).toBe('string');
      expect(agent.maxTurns).toBeGreaterThan(0);
    }
  });

  it('should have meaningful system prompts', () => {
    for (const agent of Object.values(BUILT_IN_AGENTS)) {
      expect(agent.systemPrompt.length).toBeGreaterThan(50);
      expect(agent.systemPrompt).toContain('Focus on:');
    }
  });

  it('should define specific tools for each agent', () => {
    const codeReviewer = BUILT_IN_AGENTS['code-reviewer'];
    expect(codeReviewer.tools).toContain('read_file');
    expect(codeReviewer.tools).toContain('grep');

    const researcher = BUILT_IN_AGENTS['researcher'];
    expect(researcher.tools).toContain('web_search');
  });
});

// ============================================================================
// AgentDirectoryLoader Tests
// ============================================================================

describe('agentDirectoryLoader', () => {
  beforeEach(() => {
    agentDirectoryLoader.clear();
  });

  describe('loadFromDirectory', () => {
    it('should load all built-in agents', async () => {
      const count = await agentDirectoryLoader.loadFromDirectory('/some/path');

      expect(count).toBe(6);
      for (const name of Object.keys(BUILT_IN_AGENTS)) {
        expect(agentDirectoryLoader.get(name)).toBeDefined();
      }
    });

    it('should mark loaded agents as builtin source', async () => {
      await agentDirectoryLoader.loadFromDirectory('/some/path');

      for (const agent of agentDirectoryLoader.list()) {
        expect(agent.source).toBe('builtin');
      }
    });
  });

  describe('get/list', () => {
    it('should return undefined for unknown agent', () => {
      const agent = agentDirectoryLoader.get('non-existent');
      expect(agent).toBeUndefined();
    });

    it('should list all loaded agents', async () => {
      await agentDirectoryLoader.loadFromDirectory('/some/path');

      const agents = agentDirectoryLoader.list();
      expect(agents.length).toBe(6);
    });

    it('should filter by source', async () => {
      await agentDirectoryLoader.loadFromDirectory('/some/path');

      const builtin = agentDirectoryLoader.listBuiltIn();
      expect(builtin.length).toBe(6);

      const fromFiles = agentDirectoryLoader.listFromFiles();
      expect(fromFiles.length).toBe(0);
    });
  });

  describe('register/unregister', () => {
    it('should register and retrieve a custom agent', async () => {
      await agentDirectoryLoader.loadFromDirectory('/some/path');

      agentDirectoryLoader.register({
        name: 'custom-agent',
        description: 'A custom agent',
        systemPrompt: 'Custom system prompt',
        tools: ['bash'],
        maxTurns: 10,
        source: 'file',
      });

      const agent = agentDirectoryLoader.get('custom-agent');
      expect(agent).toBeDefined();
      expect(agent!.source).toBe('file');
    });

    it('should unregister an agent', async () => {
      await agentDirectoryLoader.loadFromDirectory('/some/path');

      const unregistered = agentDirectoryLoader.unregister('code-reviewer');
      expect(unregistered).toBe(true);
      expect(agentDirectoryLoader.get('code-reviewer')).toBeUndefined();
    });

    it('should return false when unregistering non-existent', () => {
      const unregistered = agentDirectoryLoader.unregister('non-existent');
      expect(unregistered).toBe(false);
    });
  });
});

// ============================================================================
// EnhancedSubagentRunner Tests
// ============================================================================

describe('EnhancedSubagentRunner', () => {
  let runner: EnhancedSubagentRunner;

  beforeEach(() => {
    runner = new EnhancedSubagentRunner();
    agentMemoryStore.clear();
    agentDirectoryLoader.clear();
  });

  describe('storeMemory/getMemoryContext', () => {
    it('should store and retrieve memory', () => {
      const memory = runner.storeMemory('agent-1', 'Test memory content', 'context');
      expect(memory.id).toBeDefined();
      expect(memory.content).toBe('Test memory content');
      expect(memory.type).toBe('context');

      const context = runner.getMemoryContext('agent-1');
      expect(context).toContain('Test memory content');
    });

    it('should filter by maxAge using global store', () => {
      const now = Date.now();
      agentMemoryStore.create({
        id: 'old-mem',
        agentId: 'agent-1',
        content: 'Old memory',
        type: 'context',
        createdAt: new Date(now - 120000),
      });
      agentMemoryStore.create({
        id: 'new-mem',
        agentId: 'agent-1',
        content: 'New content',
        type: 'context',
        createdAt: new Date(now - 30000),
      });

      const context = runner.getMemoryContext('agent-1', 60000);
      expect(context).toContain('New content');
      expect(context).not.toContain('Old memory');
    });
  });

  describe('listBuiltInAgents', () => {
    it('should list built-in agents after initialization', async () => {
      await runner.initializeAgents();

      const agents = runner.listBuiltInAgents();
      expect(agents.length).toBe(6);
    });
  });

  describe('getAgentDefinition', () => {
    it('should return definition for built-in agent', async () => {
      await runner.initializeAgents();

      const def = runner.getAgentDefinition('code-reviewer');
      expect(def).toBeDefined();
      expect(def!.description).toContain('code review');
    });

    it('should return undefined for unknown agent', async () => {
      await runner.initializeAgents();

      const def = runner.getAgentDefinition('non-existent');
      expect(def).toBeUndefined();
    });
  });

  describe('pause/resume/getPausedAgent', () => {
    it('should return undefined for non-paused task', () => {
      const paused = runner.getPausedAgent('non-existent-task');
      expect(paused).toBeUndefined();
    });
  });

  describe('initializeAgents', () => {
    it('should load all built-in agents', async () => {
      const count = await runner.initializeAgents();
      expect(count).toBe(6);
    });
  });
});

// ============================================================================
// Tool Schema Tests
// ============================================================================

describe('Tool Schemas', () => {
  describe('ForkSubagentSchema', () => {
    it('should parse valid input', () => {
      const result = ForkSubagentSchema.safeParse({
        prompt: 'Do something',
        tools: ['read_file'],
        max_turns: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should require prompt field', () => {
      const result = ForkSubagentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const result = ForkSubagentSchema.safeParse({ prompt: 'Simple task' });
      expect(result.success).toBe(true);
    });
  });

  describe('ResumeAgentSchema', () => {
    it('should parse valid input', () => {
      const result = ResumeAgentSchema.safeParse({
        task_id: 'task-123',
        additional_prompt: 'Continue from here',
      });
      expect(result.success).toBe(true);
    });

    it('should require task_id field', () => {
      const result = ResumeAgentSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('AgentMemorySchema', () => {
    it('should parse valid store action', () => {
      const result = AgentMemorySchema.safeParse({
        action: 'store',
        content: 'Some memory',
        memory_type: 'context',
      });
      expect(result.success).toBe(true);
    });

    it('should parse valid list action', () => {
      const result = AgentMemorySchema.safeParse({
        action: 'list',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = AgentMemorySchema.safeParse({
        action: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid memory types', () => {
      const types = ['context', 'result', 'intermediate', 'summary'];
      for (const type of types) {
        const result = AgentMemorySchema.safeParse({
          action: 'store',
          content: 'Test',
          memory_type: type,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ListAgentsSchema', () => {
    it('should parse valid filter options', () => {
      const filters = ['all', 'builtin', 'custom'];
      for (const filter of filters) {
        const result = ListAgentsSchema.safeParse({ filter });
        expect(result.success).toBe(true);
      }
    });

    it('should allow empty filter', () => {
      const result = ListAgentsSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('RunBuiltInAgentSchema', () => {
    it('should parse valid input', () => {
      const result = RunBuiltInAgentSchema.safeParse({
        agent_type: 'code-reviewer',
        prompt: 'Review my code',
        max_turns: 20,
      });
      expect(result.success).toBe(true);
    });

    it('should require agent_type and prompt', () => {
      const result = RunBuiltInAgentSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Tool Description Tests
// ============================================================================

describe('Tool Descriptions', () => {
  it('should have non-empty descriptions', () => {
    expect(FORK_SUBAGENT_DESCRIPTION.length).toBeGreaterThan(10);
    expect(RESUME_AGENT_DESCRIPTION.length).toBeGreaterThan(10);
    expect(AGENT_MEMORY_DESCRIPTION.length).toBeGreaterThan(10);
    expect(LIST_AGENTS_DESCRIPTION.length).toBeGreaterThan(10);
    expect(RUN_BUILTIN_AGENT_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should describe fork_subagent capabilities', () => {
    expect(FORK_SUBAGENT_DESCRIPTION).toContain('Fork');
    expect(FORK_SUBAGENT_DESCRIPTION).toContain('context');
  });

  it('should describe resume_agent capabilities', () => {
    expect(RESUME_AGENT_DESCRIPTION).toContain('Resume');
    expect(RESUME_AGENT_DESCRIPTION).toContain('paused');
  });

  it('should describe agent_memory capabilities', () => {
    expect(AGENT_MEMORY_DESCRIPTION).toContain('Store');
    expect(AGENT_MEMORY_DESCRIPTION).toContain('retrieve');
  });

  it('should list built-in agents in description', () => {
    expect(LIST_AGENTS_DESCRIPTION).toContain('code-reviewer');
    expect(LIST_AGENTS_DESCRIPTION).toContain('researcher');
    expect(LIST_AGENTS_DESCRIPTION).toContain('tester');
  });
});

// ============================================================================
// Tool Factory Tests
// ============================================================================

describe('Tool Factories', () => {
  describe('createForkSubagentTool', () => {
    it('should create a tool with correct name', () => {
      const tool = createForkSubagentTool();
      expect(tool.name).toBe('fork_subagent');
    });

    it('should have a callable func', () => {
      const tool = createForkSubagentTool();
      expect(typeof tool.func).toBe('function');
    });
  });

  describe('createResumeAgentTool', () => {
    it('should create a tool with correct name', () => {
      const tool = createResumeAgentTool();
      expect(tool.name).toBe('resume_agent');
    });

    it('should have a callable func', () => {
      const tool = createResumeAgentTool();
      expect(typeof tool.func).toBe('function');
    });
  });

  describe('createAgentMemoryTool', () => {
    it('should create a tool with correct name', () => {
      const tool = createAgentMemoryTool();
      expect(tool.name).toBe('agent_memory');
    });

    it('should have a callable func', () => {
      const tool = createAgentMemoryTool();
      expect(typeof tool.func).toBe('function');
    });
  });

  describe('createListAgentsTool', () => {
    it('should create a tool with correct name', () => {
      const tool = createListAgentsTool();
      expect(tool.name).toBe('list_agents');
    });

    it('should have a callable func', () => {
      const tool = createListAgentsTool();
      expect(typeof tool.func).toBe('function');
    });
  });

  describe('createRunBuiltInAgentTool', () => {
    it('should create a tool with correct name', () => {
      const tool = createRunBuiltInAgentTool();
      expect(tool.name).toBe('run_builtin_agent');
    });

    it('should have a callable func', () => {
      const tool = createRunBuiltInAgentTool();
      expect(typeof tool.func).toBe('function');
    });
  });
});
