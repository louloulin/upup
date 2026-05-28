/**
 * Agent Commands Registration
 *
 * 从 ~/.claude/skills/ 目录加载 agent skills 并注册到命令系统
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getSkillCommandRegistry } from './slash-command.js';
import { clearSkillCache } from './registry.js';
import { getSkillEventEmitter } from './registry.js';
import type { SkillCommand, ToolUseContext } from './types.js';
import type { SkillMetadata } from './slash-command.js';

// ============================================================================
// Frontmatter Parser
// ============================================================================

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const lines = match[1].split('\n');

  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*)\s*:/);
    if (keyMatch) {
      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }
      currentKey = keyMatch[1];
      currentValue = line.substring(keyMatch[0].length).trim();
    } else if (currentKey && (line.trim().startsWith('-') || line.trim().startsWith('['))) {
      currentValue += '\n' + line;
    }
  }

  if (currentKey) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

function extractBody(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

// ============================================================================
// Agent Skill Command Factory
// ============================================================================

function createAgentSkillCommand(
  metadata: SkillMetadata,
  skillPath: string
): SkillCommand {
  const skillRoot = dirname(skillPath);

  // Cache the body content
  let cachedBody: string | null = null;
  const getBody = () => {
    if (!cachedBody) {
      const content = readFileSync(skillPath, 'utf-8');
      cachedBody = extractBody(content);
    }
    return cachedBody;
  };

  return {
    type: 'prompt',
    name: metadata.name,
    description: metadata.description || '',
    contentLength: 0,
    userInvocable: true,
    argumentHint: metadata.argumentHint,
    source: 'agent',
    progressMessage: 'Executing agent skill...',

    async getPromptForCommand(args, context?: ToolUseContext) {
      const body = getBody();

      // 替换变量
      let final = body
        .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillRoot)
        .replace(/\$\{cwd\}/g, context?.cwd || process.cwd())
        .replace(/\{\{args\}\}/g, args)
        .replace(/\{\{argument\}\}/g, args)
        .replace(/\$\{CLAUDE_SESSION_ID\}/g, `sess-${Date.now().toString(36)}`);

      return [{ type: 'text', text: final }];
    },
  };
}

// ============================================================================
// Registration
// ============================================================================

/**
 * 从指定目录注册所有 agent skills
 */
export function registerAgentSkillsFromDirectory(dir: string): number {
  if (!existsSync(dir)) {
    return 0;
  }

  const registry = getSkillCommandRegistry();
  let count = 0;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(dir, entry.name, 'SKILL.md');
      if (!existsSync(skillPath)) continue;

      try {
        const content = readFileSync(skillPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        const metadata: SkillMetadata = {
          name: frontmatter['name'] || entry.name,
          description: frontmatter['description'] || '',
          path: skillPath,
          source: 'agent',
          triggers: [],  // Required by slash-command.ts SkillMetadata
          user_invocable: frontmatter['user-invocable'] !== 'false',
          userInvocable: frontmatter['user-invocable'] !== 'false',
          argumentHint: frontmatter['argument-hint'],
          model: frontmatter['model'] as any,
        };

        const command = createAgentSkillCommand(metadata, skillPath);

        // 注册到 registry
        registry.registerSkillCommand(metadata.name, command);
        registry.registerSkill(metadata, command);

        count++;
      } catch (err) {
        console.warn(`[agent-commands] Failed to load ${entry.name}: ${err}`);
      }
    }
  } catch (err) {
    console.warn(`[agent-commands] Failed to read directory ${dir}: ${err}`);
  }

  return count;
}

/**
 * 注册所有 agent skills
 */
export function registerAllAgentCommands(): number {
  const homedir = process.env.HOME || process.env.USERPROFILE || '~';
  const skillDirs = [
    join(homedir, '.claude', 'skills'),
    join(homedir, '.agents', 'skills'),
    join(process.cwd(), '.claude', 'skills'),
  ];

  let total = 0;
  for (const dir of skillDirs) {
    total += registerAgentSkillsFromDirectory(dir);
  }

  return total;
}

/**
 * 清除并重新注册
 */
export function reloadAgentCommands(): void {
  clearSkillCache();
  const count = registerAllAgentCommands();
  console.log(`[agent-commands] Reloaded ${count} agent skills`);
}

// ============================================================================
// Initialization
// ============================================================================

let initialized = false;

/**
 * 初始化 agent commands
 */
export async function initializeAgentCommands(): Promise<number> {
  if (initialized) {
    return getSkillCommandRegistry().getAllSkillCommands().filter(
      (cmd) => cmd.source === 'agent'
    ).length;
  }

  const count = registerAllAgentCommands();
  initialized = true;

  if (count > 0) {
    console.log(`[agent-commands] Loaded ${count} agent skills`);
  }

  return count;
}

// ============================================================================
// File Watching (Optional)
// ============================================================================

export function setupAgentCommandsFileWatching(): void {
  // 监听 skill 变化事件
  const emitter = getSkillEventEmitter();
  emitter.on('skillFileChanged', (data: { path: string }) => {
    if (data.path.includes('.claude/skills') || data.path.includes('.agents/skills')) {
      reloadAgentCommands();
    }
  });
}
