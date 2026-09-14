/**
 * Skills → @upup/commands Bridge
 *
 * 桥接 SkillCommandRegistry 的本地 single source of truth 到上游
 * @upup/commands 的 DYNAMIC_COMMANDS, 让 CombinedAutocompleteProvider
 * 在键入 / 时能直接看到 80+ 动态 skill。
 *
 * 这是 P0 修复: /cmd autocomplete 看不到 80+ 动态 skill
 *
 * 设计:
 *   - 薄壳, ~20 行核心逻辑
 *   - 每次 register/unregister 时同步 push 到 @upup/commands
 *   - execute 转回本地 registry, 保持 SST 唯一真源
 *   - dedupe: 本地同名 skill 让位给上游静态命令
 */

import {
  registerDynamicCommand,
  unregisterDynamicCommand,
  type SlashCommand,
} from '@upup/commands';
import type { Skill, SkillCommand } from '@upup/skills';
import { getSkillCommandRegistry } from '@upup/skills';
import { getLocalizedDescription } from './i18n-helper.js';

// ============================================================================
// Track Published Names (for idempotent unregister)
// ============================================================================

const publishedNames = new Set<string>();

/**
 * Publish a single skill to @upup/commands.
 * Safe to call multiple times — duplicate names are silently dropped
 * (the upstream registerDynamicCommand already warns on duplicate).
 */
export function publishSkill(skill: Skill, command: SkillCommand): void {
  // userInvocable defaults to true; only false hides from /cmd
  if (skill.userInvocable === false) return;
  if (publishedNames.has(skill.name)) return;

  const slashCommand: SlashCommand = {
    type: 'prompt',
    name: skill.name,
    // Use localized description (zh-CN when available, else EN) so
    // /cmd autocomplete matches the user's locale.
    description: getLocalizedDescription(skill),
    userInvocable: true,
    isHidden: false,
    aliases: skill.aliases,
    argumentHint: skill.argumentHint,
    whenToUse: skill.whenToUse,
    source: 'skills',
    loadedFrom: 'skills',
    progressMessage: command.progressMessage ?? 'running',
    contentLength: command.contentLength,
    argNames: command.argNames,
    allowedTools: command.allowedTools,
    model: command.model,
    context: command.context,
    agent: command.agent,
    effort: command.effort,
    paths: command.paths,
    hooks: command.hooks as any,
    version: command.version,

    // Shim: bridge back to local registry (SST 唯一真源)
    async getPromptForCommand(args: string, context: any) {
      const localCmd = command;
      const blocks = await localCmd.getPromptForCommand(args, context);
      // SkillCommand returns { type: 'text'; text }[]; PromptCommand wants
      // ContentBlockParam[]. The text-block shape is compatible enough
      // for prompt injection.
      return blocks as any;
    },
  } as unknown as SlashCommand;

  registerDynamicCommand(slashCommand);
  publishedNames.add(skill.name);
}

/**
 * Unpublish a skill by name. Idempotent.
 */
export function unpublishSkill(name: string): boolean {
  if (!publishedNames.has(name)) return false;
  const removed = unregisterDynamicCommand(name);
  publishedNames.delete(name);
  return removed;
}

/**
 * Publish all currently registered skills.
 * Called once at startup after initializeSkills().
 */
export function publishAll(): number {
  const registry = getSkillCommandRegistry();

  let count = 0;
  for (const skill of registry.getAllSkills()) {
    if (skill.userInvocable === false) continue;
    const command = registry.getSkillCommand(skill.name);
    if (!command) continue;
    publishSkill(skill as unknown as Skill, command);
    count++;
  }
  return count;
}

/**
 * Clear all published skills from @upup/commands.
 * Used by tests + reset.
 */
export function clearBridge(): void {
  for (const name of publishedNames) {
    unregisterDynamicCommand(name);
  }
  publishedNames.clear();
}

/**
 * Get the number of skills currently published.
 */
export function getBridgeCount(): number {
  return publishedNames.size;
}
