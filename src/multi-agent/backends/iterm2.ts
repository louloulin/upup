/**
 * ITerm2Backend - iTerm2终端执行后端
 * 
 * 使用iTerm2集成执行子Agent
 * 支持AppleScript自动化和新窗口/标签页管理
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { info, warn, error as logError } from '../../utils/logging/logger.js';
import { createPiWorker, extractPiAssistantText } from './pi-worker.js';
import type { UpUpAgentSession } from '../../runtime/pi/index.js';

const execAsync = promisify(exec);

export class ITerm2Backend implements Backend {
  readonly type = 'iterm2' as const;
  readonly name = 'iTerm2 Backend';
  
  private agents: Map<string, AgentInstance & { sessionId?: string }> = new Map();
  private sessions: Map<string, UpUpAgentSession> = new Map();
  
  isAvailable(): boolean {
    try {
      execSync('which osascript', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  
  async spawn(params: SpawnAgentParams): Promise<AgentInstance> {
    const agentId = randomUUID();
    
    const agent: AgentInstance & { sessionId: string } = {
      id: agentId,
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
      sessionId: `iterm-${agentId.slice(0, 8)}`,
    };
    
    this.agents.set(agentId, agent);
    
    this.executeInITerm2(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
      logError('iterm2', `Agent failed: ${agent.name}`, err);
    });
    
    return agent;
  }
  
  private async executeInITerm2(
    agent: AgentInstance & { sessionId: string },
    params: SpawnAgentParams
  ): Promise<void> {
    const timeout = params.timeoutMs ?? 300000;
    
    try {
      // 检查iTerm2是否运行
      const itermRunning = await this.checkITerm2Running();
      
      if (itermRunning) {
        await this.createITerm2Session(agent, params);
      } else {
        await this.launchITerm2();
      }
      
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      info('iterm2', `iTerm2 session created for: ${agent.name}`);
      
      const prompt = params.prompt || `You are a ${params.role || 'agent'} named ${params.name}.`;
      const session = await createPiWorker(params);
      this.sessions.set(agent.id, session);
      agent.piSpec = session.spec;
      agent.piSessionId = session.id;
      agent.piToolNames = session.getAvailableToolNames();
      await session.prompt(prompt);
      await session.waitForIdle();
      const output = extractPiAssistantText(session.getMessages());
      if (output) {
        agent.status = 'completed';
        agent.result = output;
      } else {
        agent.status = 'failed';
        agent.error = 'Pi session completed without an assistant result';
      }
      agent.completedAt = Date.now();
      session.dispose();
      this.sessions.delete(agent.id);
      info('iterm2', `iTerm2 Pi agent completed: ${agent.name} in ${Date.now() - (agent.startedAt ?? Date.now())}ms`);
      
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      agent.completedAt = Date.now();
    }
  }
  
  private async checkITerm2Running(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        'osascript -e \'tell application "System Events" to return (exists (process "iTerm2")) or (exists (process "iTerm"))\''
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }
  
  private async createITerm2Session(agent: AgentInstance & { sessionId: string }, params: SpawnAgentParams): Promise<void> {
    const escapedName = params.name.replace(/"/g, '\\"').replace(/'/g, "\\'");
    const script = `osascript -e '
      tell application "iTerm2"
        activate
        tell current window
          create tab with default profile
          tell current session
            set name to "${escapedName}"
          end tell
        end tell
      end tell
    ' 2>/dev/null || true`;
    
    try {
      await execAsync(script);
    } catch (err) {
      warn('iterm2', `Failed to create iTerm2 session: ${err}`);
    }
  }
  
  private async launchITerm2(): Promise<void> {
    const script = `osascript -e '
      tell application "iTerm2"
        activate
      end tell
    ' 2>/dev/null || true`;
    
    try {
      await execAsync(script);
    } catch {
      warn('iterm2', 'iTerm2 not available');
    }
  }
  
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    await this.sessions.get(agentId)?.abort();
    this.sessions.get(agentId)?.dispose();
    this.sessions.delete(agentId);
    try {
      const escapedName = agent.name.replace(/"/g, '\\"');
      const script = `osascript -e '
        tell application "iTerm2"
          try
            close (every session whose name contains "${escapedName}")
          end try
        end tell
      ' 2>/dev/null || true`;
      
      await execAsync(script);
    } catch (err) {
      warn('iterm2', `Failed to close iTerm2 session: ${agent.name}`);
    }
    
    agent.status = 'cancelled';
    agent.completedAt = Date.now();
    this.agents.delete(agentId);
  }
  
  async listActive(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).filter(a => a.status === 'running');
  }
  
  async sendText(agentId: string, text: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    
    try {
      const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const script = `osascript -e '
        tell application "iTerm2"
          try
            tell current session of current window
              write text "${escapedText}"
            end tell
          end try
        end tell
      ' 2>/dev/null || true`;
      
      await execAsync(script);
      return true;
    } catch {
      return false;
    }
  }
}
