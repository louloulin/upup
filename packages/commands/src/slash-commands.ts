/**
 * Slash Commands - Command definitions and matching utilities
 */

export interface SlashCommand {
  name: string;
  description: string;
  category?: 'core' | 'plan' | 'agent' | 'mcp' | 'permissions' | 'system' | 'git' | 'tools';
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Core commands
  { name: 'help', description: 'Show keyboard shortcuts and tips', category: 'core' },
  { name: 'clear', description: 'Clear the conversation', category: 'core' },
  { name: 'model', description: 'Switch LLM provider and model', category: 'core' },
  { name: 'history', description: 'Show recent conversation summaries', category: 'core' },
  // Memory commands
  { name: 'memory', description: 'Show what UpUp remembers about you', category: 'core' },
  { name: 'rules', description: 'Show your research rules', category: 'core' },
  // System commands
  { name: 'status', description: 'Show system status and stats', category: 'system' },
  { name: 'cost', description: 'Show token usage and cost tracking', category: 'system' },
  { name: 'compact', description: 'Manually trigger context compaction', category: 'system' },
  { name: 'doctor', description: 'Run system health checks', category: 'system' },
  { name: 'theme', description: 'Show or change color theme', category: 'system' },
  // Heartbeat commands
  { name: 'heartbeat', description: 'Show your heartbeat monitoring checklist', category: 'core' },
  // Plan mode commands
  { name: 'plan', description: 'Enter plan mode for complex tasks', category: 'plan' },
  { name: 'exit-plan', description: 'Exit plan mode and start execution', category: 'plan' },
  { name: 'add-step', description: 'Add a step to the current plan', category: 'plan' },
  { name: 'steps', description: 'List all steps in the current plan', category: 'plan' },
  // Agent commands
  { name: 'agent', description: 'Spawn a child agent for parallel task execution', category: 'agent' },
  { name: 'tasks', description: 'Show background task status, stop with /tasks stop <id>', category: 'agent' },
  { name: 'jobs', description: 'Show daemon job queue and worker status', category: 'agent' },
  { name: 'fork', description: 'Create a parallel fork for independent work', category: 'agent' },
  { name: 'team', description: 'List agent teams', category: 'agent' },
  // MCP commands
  { name: 'mcp', description: 'Show MCP server status and connected tools', category: 'mcp' },
  // Permission commands
  { name: 'permissions', description: 'Show current permission settings', category: 'permissions' },
  { name: 'approve', description: 'Approve a tool for this session', category: 'permissions' },
  { name: 'deny', description: 'Deny a tool for this session', category: 'permissions' },
  { name: 'reset-permissions', description: 'Reset all session permissions', category: 'permissions' },
  // Proactive commands
  { name: 'proactive', description: 'Toggle proactive/background mode', category: 'system' },
  { name: 'events', description: 'Show recent proactive event history', category: 'system' },
  // Git commands (via CommandRegistry)
  { name: 'git', description: 'Run git status', category: 'git' },
  { name: 'diff', description: 'Show git diff', category: 'git' },
  { name: 'commit', description: 'Stage all and commit (admin)', category: 'git' },
  { name: 'branch', description: 'List or create git branches', category: 'git' },
  // Tool commands (via CommandRegistry)
  { name: 'tools', description: 'List registered tools', category: 'tools' },
  { name: 'config', description: 'Get/set configuration', category: 'tools' },
  { name: 'export', description: 'Export conversation to file', category: 'tools' },
];

/**
 * Filter commands matching the current input.
 * Input should start with "/". Bare "/" returns all commands.
 * Supports prefix matching and fuzzy matching.
 */
export function matchCommands(input: string): SlashCommand[] {
  const query = input.slice(1).toLowerCase();
  if (query === '') return SLASH_COMMANDS;

  // Prefix matches first
  const prefixMatches = SLASH_COMMANDS.filter(cmd => cmd.name.startsWith(query));
  if (prefixMatches.length > 0) return prefixMatches;

  // Fallback to substring match
  const substringMatches = SLASH_COMMANDS.filter(cmd =>
    cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
  );
  return substringMatches;
}
