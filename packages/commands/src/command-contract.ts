import type { AgentPortsLocal } from './agent-port';

export type CommandPermission = 'admin' | 'user' | 'readonly';

export interface CommandContext {
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly sessionId?: string;
  readonly model?: string;
  readonly permission?: CommandPermission;
  readonly state?: {
    readonly totalInputTokens?: number;
    readonly totalOutputTokens?: number;
    readonly totalTokens?: number;
    readonly totalCostUSD?: number;
    readonly totalToolCalls?: number;
    readonly totalToolErrors?: number;
    readonly messageCount?: number;
    readonly compactionCount?: number;
    readonly proactiveEventsCount?: number;
    readonly provider?: string;
  };
  readonly sessionDuration?: number;
  readonly tools?: readonly { readonly name: string; readonly description: string }[];
  readonly capabilities?: AgentPortsLocal;
}

export type CommandResult =
  | { readonly type: 'output'; readonly text: string }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'jsx'; readonly component: unknown }
  | { readonly type: 'redirect'; readonly command: string }
  | { readonly type: 'clear' }
  | { readonly type: 'compact' }
  | { readonly type: 'query'; readonly text: string }
  | { readonly type: 'noop' };
