/**
 * Dedupe test for unified-registry (P0 fix)
 *
 * Asserts that:
 *   1. Local skills (in SkillCommandRegistry) win over upstream
 *      static commands of the same name (defensive — should never
 *      happen in practice, but the dedupe keeps it safe).
 *   2. listAllCommands() returns the union without duplicates.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { listAllCommands, findCommand } from '../commands/unified-registry.js';
import {
  getSkillCommandRegistry,
  resetSkillCommandRegistry,
} from './slash-command.js';
import { clearBridge, publishSkill } from './bridge.js';
import { clearDynamicCommands, getDynamicCommands, SLASH_COMMANDS } from '@upup/commands';
import type { Skill, SkillCommand } from './types.js';

function fakeSkill(name: string): Skill {
  return {
    name,
    description: `Local ${name}`,
    path: `/local/${name}/SKILL.md`,
    instructions: 'fake',
    userInvocable: true,
    source: 'builtin',
  } as Skill;
}

function fakeCommand(skill: Skill): SkillCommand {
  return {
    type: 'prompt',
    name: skill.name,
    description: skill.description,
    contentLength: 0,
    progressMessage: 'running',
    userInvocable: true,
    isHidden: false,
    source: 'skills',
    loadedFrom: 'skills',
    async getPromptForCommand() {
      return [{ type: 'text', text: 'mock' }];
    },
  } as unknown as SkillCommand;
}

describe('unified-registry dedupe', () => {
  beforeEach(() => {
    clearBridge();
    clearDynamicCommands();
    resetSkillCommandRegistry();
  });

  it('listAllCommands includes upstream and Pi-native skill commands', () => {
    const cmds = listAllCommands();
    const upstreamCommands = SLASH_COMMANDS.length;
    expect(cmds.length).toBeGreaterThan(upstreamCommands);
    expect(cmds.some((command) => command.name.startsWith('skill:'))).toBe(true);
  });

  it('listAllCommands deduplicates: local skill "wins" over static of same name', () => {
    // Publish a skill named "model" (collides with /model upstream static)
    const skill = fakeSkill('model');
    publishSkill(skill, fakeCommand(skill));
    // Also register the local command so dedupe picks it up
    getSkillCommandRegistry().registerSkillCommand('model', fakeCommand(skill));
    getSkillCommandRegistry().registerSkill({
      name: 'model',
      description: skill.description,
      path: skill.path,
      triggers: [],
      user_invocable: true,
    });

    const cmds = listAllCommands();
    // The static "model" should be filtered out (local wins); the
    // dynamic one published to DYNAMIC_COMMANDS (with source='skills')
    // should be present.
    const modelCount = cmds.filter(c => c.name === 'model').length;
    expect(modelCount).toBe(1);
    const modelCmd = cmds.find(c => c.name === 'model');
    expect(modelCmd?.source).toBe('skills');
  });

  it('listAllCommands dedupes case-insensitively', () => {
    const skill = fakeSkill('DCF');
    publishSkill(skill, fakeCommand(skill));
    getSkillCommandRegistry().registerSkillCommand('DCF', fakeCommand(skill));
    getSkillCommandRegistry().registerSkill({
      name: 'DCF',
      description: skill.description,
      path: skill.path,
      triggers: [],
      user_invocable: true,
    });

    const cmds = listAllCommands();
    const dcfCount = cmds.filter(c => c.name.toLowerCase() === 'dcf').length;
    expect(dcfCount).toBe(1);
  });

  it('listAllCommands length >= SLASH_COMMANDS + 1 after publishing 1 skill', () => {
    const upstream = SLASH_COMMANDS.length;
    const skill = fakeSkill('my-unique-skill-xyz');
    publishSkill(skill, fakeCommand(skill));
    const cmds = listAllCommands();
    expect(cmds.length).toBeGreaterThanOrEqual(upstream + 1);
    expect(cmds.find(c => c.name === 'my-unique-skill-xyz')).toBeDefined();
  });

  it('findCommand returns the local skill command when present', () => {
    const skill = fakeSkill('findme-test');
    publishSkill(skill, fakeCommand(skill));
    getSkillCommandRegistry().registerSkillCommand('findme-test', fakeCommand(skill));

    const cmd = findCommand('findme-test');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('findme-test');
    expect(cmd?.source).toBe('skills');
  });

  it('findCommand falls through to upstream for non-skill commands', () => {
    // /help is a static command in @upup/commands
    const cmd = findCommand('help');
    expect(cmd).toBeDefined();
    expect(cmd?.name).toBe('help');
  });

  it('findCommand returns undefined for unknown commands', () => {
    expect(findCommand('not-a-real-command-zzz')).toBeUndefined();
  });
});
