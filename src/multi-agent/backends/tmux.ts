/**
 * TmuxBackend - Tmux终端执行后端
 * 
 * 使用Tmux会话执行子Agent
 * 支持实时输出捕获和进程管理
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { exec, spawn, execSync as nodeExecSync } from 'child_process';
import { promisify } from 'util';
import { info, warn, error as logError } from '../../utils/logging/logger.js';
import { createPiWorker, extractPiAssistantText } from './pi-worker.js';
import type { UpUpAgentSession } from '../../runtime/pi/index.js';

const execAsync = promisify(exec);

export class TmuxBackend implements Backend {
  readonly type = 'tmux' as const;
  readonly name = 'Tmux Backend';
  
  private agents: Map<string, AgentInstance & { sessionName?: string }> = new Map();
  private sessions: Map<string, UpUpAgentSession> = new Map();
  
  /**
   * 检查Tmux是否可用
   */
  isAvailable(): boolean {
    try {
      // 检查tmux命令是否存在
      nodeExecSync('which tmux', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 获取所有Tmux会话
   */
  private async listSessions(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
  
  /**
   * 创建Tmux会话执行Agent
   */
  async spawn(params: SpawnAgentParams): Promise<AgentInstance> {
    const agentId = randomUUID();
    const sessionName = `upup-agent-${agentId.slice(0, 8)}`;
    
    const agent: AgentInstance & { sessionName: string } = {
      id: agentId,
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
      sessionName,
    };
    
    this.agents.set(agentId, agent);
    
    // 创建Tmux会话并执行
    this.executeInTmux(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
      logError('agent', `Tmux agent failed: ${agent.name}`, err);
    });
    
    return agent;
  }
  
  /**
   * 在Tmux会话中执行Agent
   */
  private async executeInTmux(
    agent: AgentInstance & { sessionName: string },
    params: SpawnAgentParams
  ): Promise<void> {
    const timeout = params.timeoutMs ?? 300000;
    const startTime = Date.now();
    
    try {
      // 创建新的Tmux会话 (分离模式)
      const createCmd = `tmux new-session -d -s "${agent.sessionName}" "sleep 1" 2>/dev/null || true`;
      await execAsync(createCmd);
      
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      info('agent', `Tmux session created: ${agent.sessionName} for agent ${agent.name}`);
      
      const session = await createPiWorker(params);
      this.sessions.set(agent.id, session);
      agent.piSpec = session.spec;
      agent.piSessionId = session.id;
      agent.piToolNames = session.getAvailableToolNames();
      await session.prompt(params.prompt || `You are a ${params.role || 'agent'} named ${params.name}.`);
      await session.waitForIdle();
      if (Date.now() - startTime > timeout) {
        agent.status = 'failed';
        agent.error = 'Timeout exceeded';
      } else if (extractPiAssistantText(session.getMessages())) {
        agent.status = 'completed';
        agent.result = extractPiAssistantText(session.getMessages());
      } else {
        agent.status = 'failed';
        agent.error = 'Pi session completed without an assistant result';
      }
      agent.completedAt = Date.now();
      info('agent', `Tmux agent completed: ${agent.name}`);
      
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.sessions.get(agent.id)?.dispose();
      this.sessions.delete(agent.id);
      // 清理Tmux会话
      try {
        await execAsync(`tmux kill-session -t "${agent.sessionName}" 2>/dev/null || true`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  
  /**
   * 终止Agent (杀死Tmux会话)
   */
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId) as AgentInstance & { sessionName?: string } | undefined;
    if (!agent) return;
    
    try {
      await this.sessions.get(agentId)?.abort();
      this.sessions.get(agentId)?.dispose();
      this.sessions.delete(agentId);
      if (agent.sessionName) {
        await execAsync(`tmux kill-session -t "${agent.sessionName}" 2>/dev/null || true`);
      }
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      this.agents.delete(agentId);
      info('agent', `Agent terminated via Tmux: ${agentId}`);
    } catch (error) {
      warn('agent', `Failed to kill Tmux session: ${agentId}`);
    }
  }
  
  /**
   * 列出活动的Agent
   */
  async listActive(): Promise<AgentInstance[]> {
    const activeSessions = await this.listSessions();
    return Array.from(this.agents.values()).filter(a => 
      a.status === 'running' && activeSessions.includes((a as any).sessionName)
    );
  }
  
  /**
   * 获取Tmux会话输出
   */
  async captureOutput(agentId: string): Promise<string> {
    const agent = this.agents.get(agentId) as AgentInstance & { sessionName?: string } | undefined;
    if (!agent?.sessionName) return '';
    
    try {
      const { stdout } = await execAsync(`tmux capture-pane -t "${agent.sessionName}" -p 2>/dev/null || true`);
      return stdout;
    } catch {
      return '';
    }
  }
}
