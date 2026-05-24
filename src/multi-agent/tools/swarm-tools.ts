/**
 * Swarm Tools - 多智能体工具定义
 * 
 * 提供给LLM使用的工具:
 * - team_create: 创建团队
 * - team_add_member: 添加成员
 * - agent_spawn: spawn子Agent
 * - agent_message: Agent间消息
 * - agent_results: 获取结果
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getSwarmCoordinator } from '../coordinator.js';
import { getTeamManager } from '../team-manager.js';
import type {
  TeamCreateInput,
  TeamCreateOutput,
  AgentSpawnInput,
  AgentSpawnOutput,
  AgentMessageInput,
  AgentMessageOutput,
  AgentResultsInput,
  AgentResultsOutput,
} from '../types.js';

// ============================================================================
// Team Create Tool
// ============================================================================

export const teamCreateTool = new DynamicStructuredTool({
  name: 'team_create',
  description: 'Create a new multi-agent team for collaborative work. Teams allow multiple AI agents to work together on complex tasks.',
  
  schema: z.object({
    team_name: z.string().describe('Unique name for the team'),
    description: z.string().optional().describe('Team description/purpose'),
    agent_type: z.string().optional().describe('Type of lead agent (e.g., researcher, analyst, coordinator)'),
  }),

  func: async ({ team_name, description, agent_type }): Promise<string> => {
    try {
      const coordinator = getSwarmCoordinator();
      await coordinator.initialize();

      const team = coordinator.createTeam(team_name, description, agent_type);
      const teamPath = getTeamManager().getTeamFilePath(team.name);

      const result: TeamCreateOutput = {
        team_name: team.name,
        team_file_path: teamPath ?? '',
        lead_agent_id: team.lead,
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

// ============================================================================
// Agent Spawn Tool
// ============================================================================

export const agentSpawnTool = new DynamicStructuredTool({
  name: 'agent_spawn',
  description: 'Spawn a new agent in an existing team. The agent will work on the assigned task and can communicate with other team members.',
  
  schema: z.object({
    team_name: z.string().describe('Name of the team to spawn agent in'),
    agent_name: z.string().describe('Name/identifier for the agent'),
    role: z.string().describe('Role of the agent (e.g., researcher, coder, reviewer)'),
    prompt: z.string().describe('Task/prompt for the agent to work on'),
    tools: z.array(z.string()).optional().describe('Tools available to the agent (defaults to all)'),
    model: z.string().optional().describe('Model to use (defaults to parent model)'),
    max_turns: z.number().optional().describe('Maximum turns for agent (defaults to 10)'),
  }),

  func: async ({ team_name, agent_name, role, prompt, tools, model, max_turns }): Promise<string> => {
    try {
      const coordinator = getSwarmCoordinator();
      
      const agent = await coordinator.spawnAgent({
        teamId: team_name,
        name: agent_name,
        role,
        prompt,
        tools: tools ?? '*',
        model,
        maxTurns: max_turns ?? 10,
      });

      const result: AgentSpawnOutput = {
        agent_id: agent.id,
        team_name: team_name,
        status: agent.status as "pending" | "running",
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

// ============================================================================
// Agent Message Tool
// ============================================================================

export const agentMessageTool = new DynamicStructuredTool({
  name: 'agent_message',
  description: 'Send a message from one agent to another in the same team. Used for inter-agent communication and coordination.',
  
  schema: z.object({
    from_agent: z.string().describe('Source agent ID or name'),
    to_agent: z.string().describe('Target agent ID or name'),
    message: z.string().describe('Message content to send'),
  }),

  func: async ({ from_agent, to_agent, message }): Promise<string> => {
    try {
      const coordinator = getSwarmCoordinator();
      
      // Find agent IDs (could be name or ID)
      const agents = Array.from(coordinator.getTeamAgents(''));
      const from = agents.find(a => a.id === from_agent || a.name === from_agent)?.id ?? from_agent;
      const to = agents.find(a => a.id === to_agent || a.name === to_agent)?.id ?? to_agent;

      const success = coordinator.sendMessage(from, to, message);

      const result: AgentMessageOutput = {
        success,
        delivered: success,
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

// ============================================================================
// Agent Results Tool
// ============================================================================

export const agentResultsTool = new DynamicStructuredTool({
  name: 'agent_results',
  description: 'Get results from agents in a team. Can retrieve all agent results or a specific agent.',
  
  schema: z.object({
    team_name: z.string().describe('Name of the team'),
    agent_id: z.string().optional().describe('Specific agent ID (optional, returns all if not specified)'),
  }),

  func: async ({ team_name, agent_id }): Promise<string> => {
    try {
      const coordinator = getSwarmCoordinator();
      const agents = coordinator.getAgentResults(team_name, agent_id);

      const result: AgentResultsOutput = {
        team_name,
        agents: agents.map(a => ({
          id: a.id,
          name: a.name,
          status: a.status,
          result: a.result,
        })),
      };

      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

// ============================================================================
// Team List Tool
// ============================================================================

export const teamListTool = new DynamicStructuredTool({
  name: 'team_list',
  description: 'List all existing teams and their status.',
  
  schema: z.object({}),

  func: async (): Promise<string> => {
    try {
      const manager = getTeamManager();
      const teams = manager.listTeams();

      return JSON.stringify({
        teams: teams.map(t => ({
          name: t.name,
          description: t.description,
          member_count: t.members.length,
          status: t.status,
          created_at: new Date(t.createdAt).toISOString(),
        })),
      });
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  },
});

// ============================================================================
// Export all tools
// ============================================================================

export const swarmTools = [
  teamCreateTool,
  agentSpawnTool,
  agentMessageTool,
  agentResultsTool,
  teamListTool,
];
