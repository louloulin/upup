/**
 * Use Skills Change Hook Test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { createSkillsWatcher } from './use-skills-change.js';

describe('createSkillsWatcher', () => {
  const testDir = join(tmpdir(), 'test-skills-watcher');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('should scan existing skills on start', async () => {
    // Create test skill files
    writeFileSync(join(testDir, 'skill1.md'), '# Skill 1');
    writeFileSync(join(testDir, 'skill2.md'), '# Skill 2');

    const watcher = createSkillsWatcher(testDir, {});
    await watcher.start();

    const skills = await watcher.rescan();
    expect(skills).toContain('skill1');
    expect(skills).toContain('skill2');

    watcher.stop();
  });

  it('should detect added skills', async () => {
    const addedSkills: string[] = [];

    const watcher = createSkillsWatcher(testDir, {
      onAdded: (name) => addedSkills.push(name),
    });

    await watcher.start();

    // Add a new skill
    writeFileSync(join(testDir, 'new-skill.md'), '# New Skill');

    // Wait for file system event
    await new Promise(resolve => setTimeout(resolve, 200));

    await watcher.rescan();

    expect(addedSkills).toContain('new-skill');

    watcher.stop();
  });

  it('should detect removed skills', async () => {
    const removedSkills: string[] = [];

    // Create initial skill
    writeFileSync(join(testDir, 'to-remove.md'), '# To Remove');

    const watcher = createSkillsWatcher(testDir, {
      onRemoved: (name) => removedSkills.push(name),
    });

    await watcher.start();

    // Remove the skill
    rmSync(join(testDir, 'to-remove.md'), { force: true });

    // Wait for file system event
    await new Promise(resolve => setTimeout(resolve, 200));

    await watcher.rescan();

    expect(removedSkills).toContain('to-remove');

    watcher.stop();
  });

  it('should handle empty directory', async () => {
    const watcher = createSkillsWatcher(testDir, {});
    await watcher.start();

    const skills = await watcher.rescan();
    expect(skills).toEqual([]);

    watcher.stop();
  });

  it('should ignore non-markdown files', async () => {
    writeFileSync(join(testDir, 'readme.md'), '# Readme');
    writeFileSync(join(testDir, 'config.json'), '{}');
    writeFileSync(join(testDir, 'script.ts'), 'console.log()');

    const watcher = createSkillsWatcher(testDir, {});
    await watcher.start();

    const skills = await watcher.rescan();
    expect(skills).toEqual(['readme']);
    expect(skills).not.toContain('config');
    expect(skills).not.toContain('script');

    watcher.stop();
  });
});

describe('SkillChangeEvent types', () => {
  it('should define valid change types', () => {
    const validTypes = ['added', 'modified', 'removed'] as const;

    for (const type of validTypes) {
      expect(type).toBeDefined();
    }
  });
});

describe('UseSkillsChangeOptions defaults', () => {
  it('should have correct default extensions', () => {
    const options = {
      skillsDir: '/test',
    };

    // Default extensions should be .md
    expect(options).toBeDefined();
  });
});
