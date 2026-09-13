/**
 * Pi-backed command discovery for the CLI autocomplete provider.
 *
 * Pi owns Skill loading and execution. This module only exposes command
 * metadata; `/skill:<name>` is submitted to the active Pi AgentSession.
 */
import { getAllSlashCommands, getDynamicCommands, findCommand as upstreamFindCommand, type SlashCommand } from '@upup/commands';
import { listPiSkillCommandsSync } from '../runtime/pi/skill-commands.js';

export function listAllCommands(): SlashCommand[] {
  const commands = getAllSlashCommands().filter((command, index, all) =>
    all.findIndex((candidate) => candidate.name.toLowerCase() === command.name.toLowerCase()) === index,
  );
  const dynamic = getDynamicCommands();
  const dynamicByName = new Map(dynamic.map((command) => [command.name.toLowerCase(), command]));
  for (let index = 0; index < commands.length; index += 1) {
    const replacement = dynamicByName.get(commands[index]!.name.toLowerCase());
    if (replacement) commands[index] = replacement;
  }
  const seen = new Set(commands.map((command) => command.name.toLowerCase()));
  for (const skill of listPiSkillCommandsSync()) {
    const name = `skill:${skill.name}`;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    commands.push({
      type: 'prompt',
      name,
      description: skill.description,
      source: 'skills',
      loadedFrom: 'skills',
      userInvocable: true,
    });
  }
  return commands;
}

export function findCommand(name: string): SlashCommand | undefined {
  const dynamic = getDynamicCommands().find((command) =>
    command.name.toLowerCase() === name.toLowerCase() || command.aliases?.some((alias) => alias.toLowerCase() === name.toLowerCase()),
  );
  if (dynamic) return dynamic;
  return upstreamFindCommand(name) as SlashCommand | undefined;
}
