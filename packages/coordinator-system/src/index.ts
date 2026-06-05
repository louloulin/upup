/**
 * @upup/coordinator-system - L4 Coordinator
 *
 * Multi-agent coordination, subagent dispatch, and task distribution.
 * Replaces src/coordinator/, src/multi-agent/, src/subagent/.
 */

export type SubagentType = 'explore' | 'plan' | 'general' | 'research' | 'code' | 'finance';

export interface SubagentConfig {
  type: SubagentType;
  description: string;
  prompt: string;
  model?: string;
  tools?: string[];
  isolation?: 'worktree' | 'process' | 'thread';
}

export interface SubagentResult {
  type: SubagentType;
  success: boolean;
  output: string;
  durationMs: number;
  tokensUsed?: number;
  error?: string;
}

export interface CoordinatorConfig {
  maxConcurrent: number;
  defaultModel: string;
  enableWorktreeIsolation: boolean;
}

export async function dispatchSubagent(_config: SubagentConfig): Promise<SubagentResult> {
  return {
    type: _config.type,
    success: true,
    output: '',
    durationMs: 0,
  };
}

export async function dispatchParallel(
  _configs: SubagentConfig[],
  _options?: { maxConcurrent?: number }
): Promise<SubagentResult[]> {
  return _configs.map(c => ({
    type: c.type,
    success: true,
    output: '',
    durationMs: 0,
  }));
}
