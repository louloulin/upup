/**
 * Custom Agent Factory - 自定义Agent工厂 (v1.0)
 * 
 * 动态创建和管理自定义Agent
 * 支持模板、变量注入、配置覆盖
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCustomAgentRegistry, type CustomAgentConfig, type CustomAgent } from './agent-registry.js';
import { getSwarmCoordinator } from './coordinator.js';
import { info, warn } from '../utils/logging/logger.js';

/**
 * Create custom agent tool
 */
export const createAgentTool = new DynamicStructuredTool({
  name: 'agent_create',
  description: `Create a new custom agent for specialized tasks.
Use this to create agents with specific capabilities like:
- Financial researcher for stock analysis
- Code reviewer for PR reviews
- Bug hunter for debugging
- Task coordinator for managing other agents

Each custom agent can have:
- Custom system prompt with variable substitution
- Specific tools and permissions
- Preferred model and iteration limits`,
  
  schema: z.object({
    name: z.string().describe('Display name for the agent'),
    description: z.string().describe('Brief description of agent purpose'),
    agent_type: z.enum(['researcher', 'reviewer', 'debugger', 'coordinator', 'executor', 'analyst'])
      .describe('Type of agent'),
    system_prompt: z.string().optional()
      .describe('Custom system prompt (supports {variable} substitution)'),
    variables: z.record(z.string()).optional()
      .describe('Variables for system prompt substitution'),
    tools: z.array(z.string()).optional()
      .describe('Tools this agent can use'),
    model: z.string().optional()
      .describe('Preferred model (e.g., gpt-5.4, claude-sonnet-4-20250514)'),
    context: z.enum(['inline', 'fork', 'swarm']).optional()
      .describe('Execution context mode'),
    max_iterations: z.number().optional()
      .describe('Maximum iterations (default: 10)'),
    template_id: z.string().optional()
      .describe('Use a template instead of custom config'),
  }),

  func: async ({ name, description, agent_type, system_prompt, variables, tools, model, context, max_iterations, template_id }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      let agent: CustomAgent;

      if (template_id) {
        // Create from template
        agent = registry.createFromTemplate(template_id, {
          name,
          description,
          agentType: agent_type,
          systemPrompt: system_prompt,
          variables,
          tools,
          model,
          context,
          maxIterations: max_iterations,
        })!;
      } else {
        // Create custom agent
        const config: CustomAgentConfig = {
          id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          description,
          systemPrompt: system_prompt || `You are a ${agent_type} agent. ${description}`,
          agentType: agent_type,
          context: context || 'inline',
          maxIterations: max_iterations || 10,
          tools: tools || [],
          model,
          variables,
        };

        agent = registry.register(config);
      }

      return JSON.stringify({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.agentType,
          context: agent.context,
        },
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * List custom agents tool
 */
export const listAgentsTool = new DynamicStructuredTool({
  name: 'agent_list',
  description: 'List all custom agents, optionally filtered by type or context',
  
  schema: z.object({
    type: z.enum(['researcher', 'reviewer', 'debugger', 'coordinator', 'executor', 'analyst']).optional()
      .describe('Filter by agent type'),
    context: z.enum(['inline', 'fork', 'swarm']).optional()
      .describe('Filter by context mode'),
    include_usage: z.boolean().optional()
      .describe('Include usage statistics'),
  }),

  func: async ({ type, context, include_usage }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      let agents = registry.getAllAgents();

      if (type) {
        agents = agents.filter(a => a.agentType === type);
      }
      if (context) {
        agents = agents.filter(a => a.context === context);
      }

      const result = agents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        type: a.agentType,
        context: a.context,
        ...(include_usage ? { usageCount: a.usageCount, lastUsedAt: a.lastUsedAt } : {}),
      }));

      return JSON.stringify({
        count: result.length,
        agents: result,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Get agent details tool
 */
export const getAgentTool = new DynamicStructuredTool({
  name: 'agent_get',
  description: 'Get details of a specific custom agent',
  
  schema: z.object({
    agent_id: z.string().describe('Agent ID to retrieve'),
  }),

  func: async ({ agent_id }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const agent = registry.getAgent(agent_id);

      if (!agent) {
        return JSON.stringify({
          success: false,
          error: `Agent not found: ${agent_id}`,
        });
      }

      return JSON.stringify({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          type: agent.agentType,
          context: agent.context,
          systemPrompt: agent.systemPrompt,
          tools: agent.tools,
          model: agent.model,
          maxIterations: agent.maxIterations,
          timeoutMs: agent.timeoutMs,
          createdAt: agent.createdAt,
          usageCount: agent.usageCount,
          lastUsedAt: agent.lastUsedAt,
        },
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Spawn custom agent tool
 */
export const spawnAgentTool = new DynamicStructuredTool({
  name: 'agent_spawn_custom',
  description: 'Spawn a custom agent in a team for execution',
  
  schema: z.object({
    team_id: z.string().describe('Team ID to spawn agent in'),
    agent_id: z.string().describe('Custom agent ID to spawn'),
    task: z.string().describe('Task description for the agent'),
  }),

  func: async ({ team_id, agent_id, task }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const agent = registry.getAgent(agent_id);

      if (!agent) {
        return JSON.stringify({
          success: false,
          error: `Agent not found: ${agent_id}`,
        });
      }

      // Record usage
      registry.recordUsage(agent_id);

      // Spawn via coordinator
      const coordinator = getSwarmCoordinator();
      const instance = await coordinator.spawnAgent({
        teamId: team_id,
        name: agent.name,
        role: agent.agentType,
        prompt: `${agent.systemPrompt}\n\nTask: ${task}`,
        tools: agent.tools.length > 0 ? agent.tools : undefined,
        model: agent.model,
        maxTurns: agent.maxIterations,
        timeoutMs: agent.timeoutMs,
      });

      return JSON.stringify({
        success: true,
        instance: {
          id: instance.id,
          name: instance.name,
          status: instance.status,
        },
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Delete custom agent tool
 */
export const deleteAgentTool = new DynamicStructuredTool({
  name: 'agent_delete',
  description: 'Delete a custom agent',
  
  schema: z.object({
    agent_id: z.string().describe('Agent ID to delete'),
  }),

  func: async ({ agent_id }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const deleted = registry.unregister(agent_id);

      return JSON.stringify({
        success: deleted,
        message: deleted ? `Agent ${agent_id} deleted` : `Agent ${agent_id} not found`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * List agent templates tool
 */
export const listTemplatesTool = new DynamicStructuredTool({
  name: 'agent_templates',
  description: 'List available agent templates for quick creation',
  
  schema: z.object({
    category: z.enum(['research', 'analysis', 'execution', 'coordination', 'custom']).optional()
      .describe('Filter by category'),
  }),

  func: async ({ category }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      let templates = registry.getTemplates();

      if (category) {
        templates = templates.filter(t => t.category === category);
      }

      return JSON.stringify({
        count: templates.length,
        templates: templates.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          defaultConfig: t.defaultConfig,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Export all custom agents tool
 */
export const exportAgentsTool = new DynamicStructuredTool({
  name: 'agent_export',
  description: 'Export all custom agents as configuration',
  
  schema: z.object({}),

  func: async (): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const config = registry.exportConfig();

      return JSON.stringify({
        count: config.length,
        agents: config,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Import custom agents tool
 */
export const importAgentsTool = new DynamicStructuredTool({
  name: 'agent_import',
  description: 'Import custom agents from configuration',
  
  schema: z.object({
    agents: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      systemPrompt: z.string(),
      agentType: z.string(),
      context: z.string().optional(),
      tools: z.array(z.string()).optional(),
      model: z.string().optional(),
      maxIterations: z.number().optional(),
      timeoutMs: z.number().optional(),
    })).describe('Array of agent configurations to import'),
  }),

  func: async ({ agents }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const imported = registry.importConfig(agents.map(a => ({
        ...a,
        agentType: a.agentType as any,
        context: a.context as any,
      })));

      return JSON.stringify({
        success: true,
        imported,
        total: agents.length,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

// Export all custom agent tools
export const customAgentTools = [
  createAgentTool,
  listAgentsTool,
  getAgentTool,
  spawnAgentTool,
  deleteAgentTool,
  listTemplatesTool,
  exportAgentsTool,
  importAgentsTool,
];
