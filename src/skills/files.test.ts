/**
 * Skill Files Test - Extract and manage skill-referenced files
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  extractSkillFiles,
  extractBundledSkillFiles,
  getSkillReferencedFiles,
  SkillFilesManager,
  defaultSkillFilesManager,
} from './files.js';
import type { BundledSkillDefinition } from '@upup/skills';

// Test directory
const TEST_DIR = '/tmp/skill-files-test';
const SKILL_ROOT = join(TEST_DIR, 'skill');
const TARGET_DIR = join(TEST_DIR, 'target');

// ============================================================================
// Setup/Teardown
// ============================================================================

beforeEach(() => {
  // Clean up test directories
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}

  // Create test directories
  mkdirSync(SKILL_ROOT, { recursive: true });
  mkdirSync(TARGET_DIR, { recursive: true });

  // Create test files
  writeFileSync(join(SKILL_ROOT, 'template.md'), '# Template\n\nTest template content.');
  writeFileSync(join(SKILL_ROOT, 'config.json'), '{"key": "value"}');
  writeFileSync(join(SKILL_ROOT, 'data.txt'), 'Plain text file.');
});

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
});

// ============================================================================
// extractSkillFiles Tests
// ============================================================================

describe('extractSkillFiles', () => {
  it('should extract single file', async () => {
    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['template.md'],
      targetDir: TARGET_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(existsSync(join(TARGET_DIR, 'template.md'))).toBe(true);
  });

  it('should extract multiple files', async () => {
    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['template.md', 'config.json', 'data.txt'],
      targetDir: TARGET_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(3);
    expect(existsSync(join(TARGET_DIR, 'template.md'))).toBe(true);
    expect(existsSync(join(TARGET_DIR, 'config.json'))).toBe(true);
    expect(existsSync(join(TARGET_DIR, 'data.txt'))).toBe(true);
  });

  it('should handle missing files gracefully', async () => {
    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['nonexistent.md'],
      targetDir: TARGET_DIR,
    });

    expect(result.success).toBe(false);
    expect(result.extractedFiles).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('File not found');
  });

  it('should not overwrite existing files by default', async () => {
    // Create file in target
    writeFileSync(join(TARGET_DIR, 'template.md'), 'Original content');

    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['template.md'],
      targetDir: TARGET_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(1);
    // Should keep original content
    const content = require('fs').readFileSync(join(TARGET_DIR, 'template.md'), 'utf-8');
    expect(content).toBe('Original content');
  });

  it('should overwrite when specified', async () => {
    // Create file in target
    writeFileSync(join(TARGET_DIR, 'template.md'), 'Original content');

    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['template.md'],
      targetDir: TARGET_DIR,
      overwrite: true,
    });

    expect(result.success).toBe(true);
    const content = require('fs').readFileSync(join(TARGET_DIR, 'template.md'), 'utf-8');
    expect(content).toBe('# Template\n\nTest template content.');
  });

  it('should create subdirectories', async () => {
    // Create nested file in skill root
    mkdirSync(join(SKILL_ROOT, 'subdir'), { recursive: true });
    writeFileSync(join(SKILL_ROOT, 'subdir', 'nested.md'), '# Nested');

    const result = await extractSkillFiles({
      skillRoot: SKILL_ROOT,
      files: ['subdir/nested.md'],
      targetDir: TARGET_DIR,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TARGET_DIR, 'subdir/nested.md'))).toBe(true);
  });
});

// ============================================================================
// extractBundledSkillFiles Tests
// ============================================================================

describe('extractBundledSkillFiles', () => {
  const bundledSkill: BundledSkillDefinition = {
    name: 'test-bundled',
    description: 'Test bundled skill',
    path: 'bundled:test',
    source: 'builtin',
    instructions: 'Test instructions',
    files: {
      'virtual.md': '# Virtual File\n\nCreated from bundled skill.',
      'data.json': '{"created": "from-bundled"}',
    },
  };

  it('should extract bundled files', async () => {
    const result = await extractBundledSkillFiles(bundledSkill, TARGET_DIR);

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(2);
    expect(existsSync(join(TARGET_DIR, 'virtual.md'))).toBe(true);
    expect(existsSync(join(TARGET_DIR, 'data.json'))).toBe(true);
  });

  it('should handle empty files', async () => {
    const emptySkill: BundledSkillDefinition = {
      ...bundledSkill,
      files: {},
    };

    const result = await extractBundledSkillFiles(emptySkill, TARGET_DIR);

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(0);
  });

  it('should handle undefined files', async () => {
    const noFilesSkill: BundledSkillDefinition = {
      name: 'no-files',
      description: 'No files skill',
      path: 'bundled:no-files',
      source: 'builtin',
      instructions: 'No files',
    };

    const result = await extractBundledSkillFiles(noFilesSkill, TARGET_DIR);

    expect(result.success).toBe(true);
    expect(result.extractedFiles).toHaveLength(0);
  });
});

// ============================================================================
// getSkillReferencedFiles Tests
// ============================================================================

describe('getSkillReferencedFiles', () => {
  it('should extract files from frontmatter', () => {
    const skillPath = join(SKILL_ROOT, 'test-skill.md');
    writeFileSync(
      skillPath,
      `---
name: test
files:
  - template.md
  - config.json
---
# Test Skill`
    );

    const files = getSkillReferencedFiles(skillPath);

    expect(files).toEqual(['template.md', 'config.json']);
  });

  it('should handle singular file field', () => {
    const skillPath = join(SKILL_ROOT, 'test-skill.md');
    writeFileSync(
      skillPath,
      `---
name: test
file: single.md
---
# Test Skill`
    );

    const files = getSkillReferencedFiles(skillPath);

    expect(files).toEqual(['single.md']);
  });

  it('should handle string file field', () => {
    const skillPath = join(SKILL_ROOT, 'test-skill.md');
    writeFileSync(
      skillPath,
      `---
name: test
file: "string-file.txt"
---
# Test Skill`
    );

    const files = getSkillReferencedFiles(skillPath);

    expect(files).toEqual(['string-file.txt']);
  });

  it('should return empty array for no files', () => {
    const skillPath = join(SKILL_ROOT, 'test-skill.md');
    writeFileSync(
      skillPath,
      `---
name: test
---
# Test Skill`
    );

    const files = getSkillReferencedFiles(skillPath);

    expect(files).toEqual([]);
  });

  it('should return empty array for invalid file', () => {
    const files = getSkillReferencedFiles('/nonexistent/path.md');
    expect(files).toEqual([]);
  });
});

// ============================================================================
// SkillFilesManager Tests
// ============================================================================

describe('SkillFilesManager', () => {
  let manager: SkillFilesManager;

  beforeEach(() => {
    manager = new SkillFilesManager();
  });

  it('should track extracted files', async () => {
    await manager.extract('test-skill', {
      skillRoot: SKILL_ROOT,
      files: ['template.md', 'config.json'],
      targetDir: TARGET_DIR,
    });

    const extracted = manager.getExtracted('test-skill');
    expect(extracted).toHaveLength(2);
  });

  it('should return empty array for unknown skill', () => {
    const extracted = manager.getExtracted('unknown-skill');
    expect(extracted).toEqual([]);
  });

  it('should cleanup specific skill files', async () => {
    await manager.extract('test-skill', {
      skillRoot: SKILL_ROOT,
      files: ['template.md'],
      targetDir: TARGET_DIR,
    });

    expect(existsSync(join(TARGET_DIR, 'template.md'))).toBe(true);

    await manager.cleanup('test-skill');

    // Note: cleanup may fail if file doesn't exist, but that's OK
    const extracted = manager.getExtracted('test-skill');
    expect(extracted).toHaveLength(0);
  });

  it('should cleanup all files', async () => {
    await manager.extract('skill-1', {
      skillRoot: SKILL_ROOT,
      files: ['template.md'],
      targetDir: TARGET_DIR,
    });

    await manager.extract('skill-2', {
      skillRoot: SKILL_ROOT,
      files: ['config.json'],
      targetDir: TARGET_DIR,
    });

    await manager.cleanupAll();

    const extracted = manager.getExtracted('skill-1');
    expect(extracted).toHaveLength(0);
  });
});

// ============================================================================
// Default Instance Test
// ============================================================================

describe('defaultSkillFilesManager', () => {
  it('should be exported and instantiable', () => {
    expect(defaultSkillFilesManager).toBeDefined();
    expect(defaultSkillFilesManager).toBeInstanceOf(SkillFilesManager);
  });
});