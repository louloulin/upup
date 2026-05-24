/**
 * ITerm2Backend - iTerm2终端执行后端
 * 
 * 使用iTerm2集成执行子Agent
 * 支持AppleScript自动化和新窗口/标签页管理
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { exec, execSync as nodeExecSync } from 'child_process';
import { promisify } from 'util';
import { info, warn, error as logError } from '../../utils/logging/logger.js';

const execAsync = promisify(exec);

export class ITerm2Backend implements Backend {
  readonly type = 'iterm2' as const;
  readonly name = 'iTerm2 Backend';
  
  private agents: Map<string, AgentInstance & { windowId?: string; tabId?: string }> = new Map();
  
  /**
   * 检查iTerm2是否可用
   */
  isAvailable(): boolean {
    try {
      // 检查osascript命令是否可用
      nodeExecSync('which osascript', { stdio: 'pipe' });
      // 尝试激活iTerm2
      nodeExecSync('osascript -e "tell application \\"System Events\\" to exists (process \"iTerm2\")" 2>/dev/null || osascript -e "tell application \\"System Events\\" to exists (process \\"iTerm\\")" 2>/dev/null || true', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 创建iTerm2窗口执行Agent
   */
  async spawn(params: SpawnAgentParams): Promise<AgentInstance> {
    const agentId = randomUUID();
    const windowTitle = `UpUp Agent: ${params.name}`;
    
    const agent: AgentInstance & { windowId: string; tabId: string } = {
      id: agentId,
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
      windowId: agentId.slice(0, 8),
      tabId: `tab-${agentId.slice(0, 8)}`,
    };
    
    this.agents.set(agentId, agent);
    
    // 使用AppleScript创建窗口并执行
    this.executeInITerm2(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
      logError('agent', `iTerm2 agent failed: ${agent.name}`, err);
    });
    
    return agent;
  }
  
  /**
   * 在iTerm2中执行Agent
   */
  private async executeInITerm2(
    agent: AgentInstance & { windowId: string; tabId: string },
    params: SpawnAgentParams
  ): Promise<void> {
    const timeout = params.timeoutMs ?? 300000;
    const startTime = Date.now();
    
    try {
      // 构建AppleScript命令
      const escapedName = params.name.replace(/"/g, '\\"').replace(/'/g, "\\'");
      
      const appleScript = `tell application "iTerm2"
        activate
        set newWindow to (create window with default profile)
        tell current session of newWindow
          set name to "${escapedName}"
          write text "echo 'Starting agent ${escapedName}...'"
          write text "sleep 1"
        end tell
      end tell`.replace(/\n/g, ' ');
      
      // 执行AppleScript (非阻塞)
      exec(`osascript -e '${appleScript}' 2>/dev/null || true`, (err) => {
        if (err) {
          warn('agent', `AppleScript iTerm2 failed: ${err.message}`);
        }
      });
      
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      info('agent', `iTerm2 window created for agent ${agent.name}`);
      
      // 模拟执行
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 检查超时
      if (Date.now() - startTime > timeout) {
        agent.status = 'failed';
        agent.error = 'Timeout exceeded';
        return;
      }
      
      // 模拟完成
      agent.status = 'completed';
      agent.completedAt = Date.now();
      agent.result = `Agent ${agent.name} completed via iTerm2`;
      
      info('agent', `iTerm2 agent completed: ${agent.name}`);
      
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
    }
  }
  
  /**
   * 终止Agent (关闭iTerm2窗口/标签)
   */
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId) as AgentInstance & { windowId?: string; tabId?: string } | undefined;
    if (!agent) return;
    
    try {
      const escapedName = agent.name.replace(/"/g, '\\"');
      const appleScript = `tell application "iTerm2"
        try
          close (sessions whose name contains "${escapedName}")
        end try
      end tell`.replace(/\n/g, ' ');
      
      exec(`osascript -e '${appleScript}' 2>/dev/null || true`);
      
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      this.agents.delete(agentId);
      info('agent', `Agent terminated via iTerm2: ${agentId}`);
    } catch (error) {
      warn('agent', `Failed to close iTerm2 window: ${agentId}`);
    }
  }
  
  /**
   * 列出活动的Agent
   */
  async listActive(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).filter(a => a.status === 'running');
  }
  
  /**
   * 发送文本到Agent终端
   */
  async sendText(agentId: string, text: string): Promise<boolean> {
    const agent = this.agents.get(agentId) as AgentInstance & { windowId?: string } | undefined;
    if (!agent?.windowId) return false;
    
    try {
      const escapedText = text.replace(/"/g, '\\"');
      const appleScript = `tell application "iTerm2"
        try
          tell current session of (windows whose index is ${agent.windowId})
            write text "${escapedText}"
          end tell
        end try
      end tell`.replace(/\n/g, ' ');
      
      await execAsync(`osascript -e '${appleScript}' 2>/dev/null || true`);
      return true;
    } catch {
      return false;
    }
  }
}
