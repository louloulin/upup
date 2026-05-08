/**
 * Unit tests for Agent Registry
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  AgentRegistry,
  getAgentRegistry,
  resetAgentRegistry,
  selectAgentForTask,
  getAvailableAgents,
  type AgentDefinition,
} from './registry.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('Built-in agents', () => {
    test('has built-in research agent', () => {
      const agent = registry.get('research-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Research Agent');
      expect(agent?.isBuiltIn).toBe(true);
    });

    test('has built-in coding agent', () => {
      const agent = registry.get('coding-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Coding Agent');
      expect(agent?.isBuiltIn).toBe(true);
    });

    test('has built-in debugging agent', () => {
      const agent = registry.get('debugging-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Debugging Agent');
    });

    test('has built-in testing agent', () => {
      const agent = registry.get('testing-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Testing Agent');
    });

    test('has built-in review agent', () => {
      const agent = registry.get('review-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Review Agent');
    });

    test('has built-in documentation agent', () => {
      const agent = registry.get('documentation-agent');
      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Documentation Agent');
    });

    test('registers 6 built-in agents', () => {
      expect(registry.count).toBe(6);
    });

    test('getBuiltInAgents returns only built-ins', () => {
      const builtIns = registry.getBuiltInAgents();
      expect(builtIns).toHaveLength(6);
      expect(builtIns.every(a => a.isBuiltIn)).toBe(true);
    });

    test('getCustomAgents returns empty array initially', () => {
      const custom = registry.getCustomAgents();
      expect(custom).toHaveLength(0);
    });
  });

  describe('Agent registration', () => {
    test('register adds new agent', () => {
      const customAgent: AgentDefinition = {
        id: 'custom-agent',
        name: 'Custom Agent',
        description: 'A custom agent',
        version: '1.0.0',
        capabilities: ['research'],
        taskTypes: ['custom'],
        systemPrompt: 'You are custom',
        isBuiltIn: false,
      };

      registry.register(customAgent);
      expect(registry.count).toBe(7);
      expect(registry.get('custom-agent')).toEqual(customAgent);
    });

    test('register overwrites existing agent', () => {
      const replacement: AgentDefinition = {
        id: 'research-agent',
        name: 'Modified Research Agent',
        description: 'Modified',
        version: '2.0.0',
        capabilities: ['research'],
        taskTypes: ['research'],
        systemPrompt: 'Modified prompt',
        isBuiltIn: true,
      };

      registry.register(replacement);
      expect(registry.get('research-agent')?.name).toBe('Modified Research Agent');
    });

    test('unregister removes custom agent', () => {
      registry.register({
        id: 'temp-agent',
        name: 'Temp',
        description: 'Temp',
        version: '1.0.0',
        capabilities: [],
        taskTypes: [],
        systemPrompt: '',
        isBuiltIn: false,
      });

      expect(registry.has('temp-agent')).toBe(true);
      const removed = registry.unregister('temp-agent');
      expect(removed).toBe(true);
      expect(registry.has('temp-agent')).toBe(false);
    });

    test('unregister cannot remove built-in agent', () => {
      const removed = registry.unregister('research-agent');
      expect(removed).toBe(false);
      expect(registry.has('research-agent')).toBe(true);
    });
  });

  describe('Agent selection', () => {
    test('selectAgentForTask selects research agent for research task', () => {
      const agent = registry.selectAgent('financial research on tech companies');
      expect(agent.id).toBe('research-agent');
    });

    test('selectAgentForTask selects coding agent for code task', () => {
      const agent = registry.selectAgent('implement a new feature');
      expect(agent.id).toBe('coding-agent');
    });

    test('selectAgentForTask selects debugging agent for debug task', () => {
      const agent = registry.selectAgent('debug the error in login');
      expect(agent.id).toBe('debugging-agent');
    });

    test('selectAgentForTask selects testing agent for test task', () => {
      const agent = registry.selectAgent('write tests for the API');
      expect(agent.id).toBe('testing-agent');
    });

    test('selectAgentForTask selects review agent for review task', () => {
      const agent = registry.selectAgent('review the pull request');
      expect(agent.id).toBe('review-agent');
    });

    test('selectAgentForTask selects documentation agent for docs task', () => {
      const agent = registry.selectAgent('update the README documentation');
      expect(agent.id).toBe('documentation-agent');
    });

    test('selectAgentForTask falls back to default for unknown task', () => {
      const agent = registry.selectAgent('some random task');
      expect(agent.id).toBe('research-agent'); // Default
    });
  });

  describe('getByCapability', () => {
    test('finds agents by capability', () => {
      const agents = registry.getByCapability('research');
      expect(agents.length).toBeGreaterThan(0);
      expect(agents.some(a => a.id === 'research-agent')).toBe(true);
    });
  });

  describe('getByTaskType', () => {
    test('finds agents by task type', () => {
      const agents = registry.getByTaskType('financial');
      expect(agents.some(a => a.id === 'research-agent')).toBe(true);
    });
  });

  describe('Default agent', () => {
    test('getDefaultAgent returns research agent', () => {
      const agent = registry.getDefaultAgent();
      expect(agent.id).toBe('research-agent');
    });

    test('setDefaultAgent changes default', () => {
      registry.setDefaultAgent('coding-agent');
      expect(registry.getDefaultAgent().id).toBe('coding-agent');
    });
  });

  describe('getAll', () => {
    test('returns all agents', () => {
      const agents = registry.getAll();
      expect(agents).toHaveLength(6);
    });
  });

  describe('has', () => {
    test('returns true for existing agent', () => {
      expect(registry.has('research-agent')).toBe(true);
    });

    test('returns false for non-existing agent', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });
});

describe('Singleton getAgentRegistry', () => {
  test('returns same instance', () => {
    resetAgentRegistry();
    const reg1 = getAgentRegistry();
    const reg2 = getAgentRegistry();
    expect(reg1).toBe(reg2);
  });
});

describe('Helper functions', () => {
  test('selectAgentForTask works globally', () => {
    resetAgentRegistry();
    const agent = selectAgentForTask('implement login feature');
    expect(agent.id).toBe('coding-agent');
  });

  test('getAvailableAgents returns IDs', () => {
    resetAgentRegistry();
    const ids = getAvailableAgents();
    expect(ids).toContain('research-agent');
    expect(ids).toContain('coding-agent');
    expect(ids).toHaveLength(6);
  });
});

describe('Agent capabilities', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  test('research agent has research capability', () => {
    const agent = registry.get('research-agent')!;
    expect(agent.capabilities).toContain('research');
    expect(agent.taskTypes).toContain('research');
  });

  test('coding agent has coding capability', () => {
    const agent = registry.get('coding-agent')!;
    expect(agent.capabilities).toContain('coding');
    expect(agent.taskTypes).toContain('implement');
  });

  test('all agents have version', () => {
    const agents = registry.getAll();
    expect(agents.every(a => a.version.length > 0)).toBe(true);
  });

  test('all agents have system prompt', () => {
    const agents = registry.getAll();
    expect(agents.every(a => a.systemPrompt.length > 0)).toBe(true);
  });
});
