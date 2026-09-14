/**
 * Skills → @upup/commands Bridge Tests (P0 fix verification)
 *
 * Asserts that the bridge keeps SkillCommandRegistry and
 * @upup/commands DYNAMIC_COMMANDS in lockstep.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getDynamicCommands,
  clearDynamicCommands,
} from '@upup/commands';
import {
  publishSkill,
  unpublishSkill,
  publishAll,
  clearBridge,
  getBridgeCount,
} from './bridge.js';
import {
  resetSkillCommandRegistry,
  getSkillCommandRegistry,
} from '@upup/skills';
import type { Skill, SkillCommand } from '@upup/skills';

function fakeSkill(name: string, opts: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `Description for ${name}`,
    path: `/fake/${name}/SKILL.md`,
    instructions: 'fake instructions',
    userInvocable: true,
    source: 'builtin',
    ...opts,
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

describe('Skills ↔ @upup/commands Bridge', () => {
  beforeEach(() => {
    clearBridge();
    clearDynamicCommands();
    resetSkillCommandRegistry();
  });

  it('publishSkill adds a command to DYNAMIC_COMMANDS', () => {
    const skill = fakeSkill('dcf');
    publishSkill(skill, fakeCommand(skill));
    expect(getDynamicCommands().length).toBe(1);
    expect(getDynamicCommands()[0].name).toBe('dcf');
    expect(getBridgeCount()).toBe(1);
  });

  it('publishSkill skips non-user-invocable skills', () => {
    const skill = fakeSkill('hidden', { userInvocable: false });
    publishSkill(skill, fakeCommand(skill));
    expect(getDynamicCommands().length).toBe(0);
    expect(getBridgeCount()).toBe(0);
  });

  it('publishSkill is idempotent on the same name', () => {
    const skill = fakeSkill('dcf');
    publishSkill(skill, fakeCommand(skill));
    publishSkill(skill, fakeCommand(skill));
    expect(getDynamicCommands().length).toBe(1);
  });

  it('unpublishSkill removes a published skill', () => {
    const skill = fakeSkill('dcf');
    publishSkill(skill, fakeCommand(skill));
    expect(unpublishSkill('dcf')).toBe(true);
    expect(getDynamicCommands().length).toBe(0);
    expect(getBridgeCount()).toBe(0);
  });

  it('unpublishSkill returns false for unknown name', () => {
    expect(unpublishSkill('does-not-exist')).toBe(false);
  });

  it('publishAll syncs every registered skill', () => {
    const registry = getSkillCommandRegistry();
    registry.registerSkillCommand('dcf', fakeCommand(fakeSkill('dcf')));
    registry.registerSkill({
      name: 'dcf',
      description: 'desc',
      path: '/x',
      triggers: [],
      user_invocable: true,
    });
    registry.registerSkillCommand('ta', fakeCommand(fakeSkill('ta')));
    registry.registerSkill({
      name: 'ta',
      description: 'desc',
      path: '/x',
      triggers: [],
      user_invocable: true,
    });

    const n = publishAll();
    expect(n).toBe(2);
    expect(getBridgeCount()).toBe(2);
    const names = getDynamicCommands().map(c => c.name).sort();
    expect(names).toEqual(['dcf', 'ta']);
  });

  it('clearBridge empties the bridge', () => {
    publishSkill(fakeSkill('a'), fakeCommand(fakeSkill('a')));
    publishSkill(fakeSkill('b'), fakeCommand(fakeSkill('b')));
    expect(getBridgeCount()).toBe(2);
    clearBridge();
    expect(getBridgeCount()).toBe(0);
    expect(getDynamicCommands().length).toBe(0);
  });

  it('published SlashCommand has type=prompt and source=skills', () => {
    const skill = fakeSkill('value-investing', { aliases: ['vi'] });
    publishSkill(skill, fakeCommand(skill));
    const cmd = getDynamicCommands()[0];
    expect(cmd.type).toBe('prompt');
    expect(cmd.source).toBe('skills');
    expect(cmd.aliases).toEqual(['vi']);
    expect(cmd.userInvocable).toBe(true);
  });
});
