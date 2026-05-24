/**
 * Agent CLI Tools - Agent命令行工具 (v1.0)
 * 
 * 提供命令行接口管理Agent:
 * - 列出所有Agent
 * - 查看Agent状态
 * - 管理队列
 * - 查看调度策略
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCustomAgentRegistry } from './agent-registry.js';
import { getAgentLoader } from './agent-loader.js';
import { getAgentScheduler } from './scheduler.js';
import { getSwarmCoordinator } from './coordinator.js';

/**
 * List all agents tool
 */
export const listAllAgentsTool = new DynamicStructuredTool({
  name: 'agent_list_all',
  description: 'List all agents including custom, bundled, and queued agents with their status',
  
  schema: z.object({
    filter: z.enum(['all', 'active', 'queued', 'custom', 'bundled']).optional()
      .describe('Filter by agent type/status'),
    format: z.enum(['summary', 'detailed']).optional()
      .describe('Output format'),
  }),

  func: async ({ filter = 'all', format = 'summary' }): Promise<string> => {
    try {
      const results: string[] = [];
      const registry = getCustomAgentRegistry();
      const loader = getAgentLoader();
      const scheduler = getAgentScheduler();
      const coordinator = getSwarmCoordinator();

      results.push('=== Agent Overview ===\n');

      // Custom agents
      if (filter === 'all' || filter === 'custom') {
        const customAgents = registry.getAllAgents();
        results.push(`Custom Agents (${customAgents.length}):`);
        for (const agent of customAgents.slice(0, 10)) {
          results.push(`  - ${agent.name} (${agent.agentType}) - ${agent.usageCount} uses`);
        }
        if (customAgents.length > 10) {
          results.push(`  ... and ${customAgents.length - 10} more`);
        }
        results.push('');
      }

      // Bundled agents
      if (filter === 'all' || filter === 'bundled') {
        const bundledAgents = loader.getAllAgents();
        results.push(`Bundled Agents (${bundledAgents.length}):`);
        for (const agent of bundledAgents.slice(0, 10)) {
          const skills = agent.skills?.length ? `[${agent.skills.join(', ')}]` : '';
          results.push(`  - ${agent.name} (${agent.agentType}) ${skills}`);
        }
        if (bundledAgents.length > 10) {
          results.push(`  ... and ${bundledAgents.length - 10} more`);
        }
        results.push('');
      }

      // Scheduler status
      if (filter === 'all' || filter === 'active' || filter === 'queued') {
        const status = scheduler.getQueueStatus();
        results.push(`Scheduler Status:`);
        results.push(`  Active: ${status.activeCount}`);
        results.push(`  Queued: ${status.queueLength}`);
        results.push(`  Type Counters: ${JSON.stringify(status.typeCounters)}`);
        if (status.nextInQueue) {
          results.push(`  Next: ${status.nextInQueue.agent.name || status.nextInQueue.id}`);
        }
        results.push('');
      }

      return results.join('\n');
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Get agent status tool
 */
export const getAgentStatusTool = new DynamicStructuredTool({
  name: 'agent_status',
  description: 'Get detailed status of a specific agent or the overall system',
  
  schema: z.object({
    agent_id: z.string().optional()
      .describe('Agent ID to check (optional for system status)'),
    include_metrics: z.boolean().optional()
      .describe('Include performance metrics'),
  }),

  func: async ({ agent_id, include_metrics = false }): Promise<string> => {
    try {
      const scheduler = getAgentScheduler();
      const status = scheduler.getQueueStatus();
      
      if (agent_id) {
        // Find specific agent
        const registry = getCustomAgentRegistry();
        const agent = registry.getAgent(agent_id);
        
        if (!agent) {
          return JSON.stringify({ success: false, error: 'Agent not found' });
        }

        const result: Record<string, unknown> = {
          id: agent.id,
          name: agent.name,
          type: agent.agentType,
          context: agent.context,
          createdAt: agent.createdAt,
          lastUsedAt: agent.lastUsedAt,
          usageCount: agent.usageCount,
          systemPrompt: agent.systemPrompt.slice(0, 200) + '...',
        };

        if (include_metrics) {
          result.metrics = {
            avgDuration: agent.usageCount > 0 ? 'N/A' : 'No usage data',
          };
        }

        return JSON.stringify({ success: true, agent: result }, null, 2);
      }

      // System status
      const policy = scheduler.getPolicy();
      return JSON.stringify({
        success: true,
        system: {
          activeAgents: status.activeCount,
          queuedAgents: status.queueLength,
          maxConcurrent: policy.maxConcurrentAgents,
          typeQuotas: policy.agentTypeQuota,
          resourceLimits: policy.resourceLimit,
        },
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Manage scheduler tool
 */
export const manageSchedulerTool = new DynamicStructuredTool({
  name: 'agent_scheduler',
  description: 'Manage the agent scheduler - view or update scheduling policy',
  
  schema: z.object({
    action: z.enum(['get', 'update', 'reset', 'stats']).optional()
      .describe('Action to perform'),
    max_concurrent: z.number().optional()
      .describe('Update max concurrent agents'),
    reset_queues: z.boolean().optional()
      .describe('Reset all queues'),
  }),

  func: async ({ action = 'get', max_concurrent, reset_queues }): Promise<string> => {
    try {
      const scheduler = getAgentScheduler();

      if (action === 'get') {
        const policy = scheduler.getPolicy();
        const status = scheduler.getQueueStatus();
        
        return JSON.stringify({
          success: true,
          policy,
          status,
        }, null, 2);
      }

      if (action === 'update') {
        if (max_concurrent !== undefined) {
          scheduler.updatePolicy({ maxConcurrentAgents: max_concurrent });
        }
        
        return JSON.stringify({
          success: true,
          message: 'Policy updated',
          policy: scheduler.getPolicy(),
        }, null, 2);
      }

      if (action === 'reset') {
        if (reset_queues) {
          scheduler.reset();
        }
        
        return JSON.stringify({
          success: true,
          message: 'Scheduler reset',
        });
      }

      if (action === 'stats') {
        const status = scheduler.getQueueStatus();
        return JSON.stringify({
          success: true,
          stats: {
            ...status,
            utilizationPercent: ((status.activeCount / scheduler.getPolicy().maxConcurrentAgents) * 100).toFixed(1),
          },
        }, null, 2);
      }

      return JSON.stringify({ success: false, error: 'Unknown action' });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Create agent from template tool
 */
export const createFromTemplateTool = new DynamicStructuredTool({
  name: 'agent_create_from_template',
  description: 'Create a new custom agent from a predefined template',
  
  schema: z.object({
    template_id: z.string()
      .describe('Template ID (financial-researcher, code-reviewer, bug-hunter, task-coordinator, batch-processor, portfolio-analyst)'),
    name: z.string().optional()
      .describe('Custom name for the agent'),
    description: z.string().optional()
      .describe('Custom description'),
  }),

  func: async ({ template_id, name, description }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();
      const agent = registry.createFromTemplate(template_id, { name, description });

      if (!agent) {
        return JSON.stringify({
          success: false,
          error: `Template not found: ${template_id}`,
          available: registry.getTemplates().map(t => t.id),
        });
      }

      return JSON.stringify({
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          type: agent.agentType,
          context: agent.context,
        },
      }, null, 2);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

/**
 * Export/Import agents tool
 */
export const exportAgentsConfigTool = new DynamicStructuredTool({
  name: 'agent_export_import',
  description: 'Export all custom agents to config or import from config',
  
  schema: z.object({
    action: z.enum(['export', 'import', 'list_templates']).optional()
      .describe('Action to perform'),
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
    })).optional()
      .describe('Agents to import (for import action)'),
  }),

  func: async ({ action = 'export', agents }): Promise<string> => {
    try {
      const registry = getCustomAgentRegistry();

      if (action === 'export') {
        const config = registry.exportConfig();
        return JSON.stringify({
          success: true,
          count: config.length,
          agents: config,
        }, null, 2);
      }

      if (action === 'import') {
        if (!agents || agents.length === 0) {
          return JSON.stringify({ success: false, error: 'No agents to import' });
        }

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
      }

      if (action === 'list_templates') {
        const templates = registry.getTemplates();
        return JSON.stringify({
          success: true,
          templates: templates.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
          })),
        }, null, 2);
      }

      return JSON.stringify({ success: false, error: 'Unknown action' });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

// Export all CLI tools
export const agentCliTools = [
  listAllAgentsTool,
  getAgentStatusTool,
  manageSchedulerTool,
  createFromTemplateTool,
  exportAgentsConfigTool,
];
