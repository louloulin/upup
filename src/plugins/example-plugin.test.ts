/**
 * Example Skill Plugin — Smoke Test (P1.7 — round 2)
 *
 * Loads the bundled example plugin, validates its manifest, and
 * verifies both declared skills get registered and surface in
 * the skill command registry.
 */

import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { resolve } from 'path';
import {
  loadPluginManifest,
  getManifestLoader,
  validatePluginSkills,
} from '@upup/plugins';
import { registerSkill, unregisterSkill } from '../skills/register.js';
import { getSkillCommandRegistry } from '@upup/skills';

const PLUGIN_DIR = resolve(
  import.meta.dir,
  '..',
  '..',
  'examples',
  'plugins',
  'example-skill-plugin',
);

describe('Example Skill Plugin (P1.7 round 2)', () => {
  beforeAll(() => {
    getManifestLoader().clearCache();
  });

  afterAll(() => {
    // Clean up so other tests aren't affected
    try {
      unregisterSkill('example-greet');
    } catch {
      /* noop */
    }
    try {
      unregisterSkill('example-ping');
    } catch {
      /* noop */
    }
    getManifestLoader().clearCache();
  });

  test('manifest is well-formed', () => {
    const manifest = loadPluginManifest(PLUGIN_DIR);
    expect(manifest.id).toBe('example-skill-plugin');
    expect(manifest.name).toBe('Example Skill Plugin');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.runtime).toBe('bun');
    expect(manifest.capabilities).toContain('tools');
  });

  test('manifest skills array validates', () => {
    const manifest = loadPluginManifest(PLUGIN_DIR);
    expect(manifest.skills).toBeDefined();
    expect(manifest.skills!.length).toBe(2);
    // validatePluginSkills should not throw on a well-formed manifest
    expect(() => validatePluginSkills(manifest.skills)).not.toThrow();
  });

  test('both declared skills have the required fields', () => {
    const manifest = loadPluginManifest(PLUGIN_DIR);
    const greet = manifest.skills!.find((s) => s.name === 'example-greet')!;
    const ping = manifest.skills!.find((s) => s.name === 'example-ping')!;
    expect(greet).toBeDefined();
    expect(ping).toBeDefined();
    expect(greet.description).toBeTruthy();
    expect(greet.instructions).toBeTruthy();
    expect(greet.argumentHint).toBe('<name>');
    expect(greet.aliases).toEqual(['greet', 'hello']);
    expect(ping.description).toBeTruthy();
    expect(ping.instructions).toBeTruthy();
  });

  test('skills surface in the SkillCommandRegistry after registerSkill', () => {
    const manifest = loadPluginManifest(PLUGIN_DIR);
    const registry = getSkillCommandRegistry();

    for (const entry of manifest.skills!) {
      registerSkill(
        {
          name: entry.name,
          description: entry.description,
          path: `plugin:${manifest.id}#${entry.name}`,
          triggers: entry.aliases ?? [],
          userInvocable: entry.userInvocable ?? true,
          model: entry.model,
          context: entry.context,
          allowedTools: entry.allowedTools,
          argumentHint: entry.argumentHint,
          instructions: entry.instructions,
          aliases: entry.aliases,
          source: 'plugin',
        },
        `plugin:${manifest.id}`,
      );
    }

    expect(registry.getSkill('example-greet')).toBeDefined();
    expect(registry.getSkill('example-ping')).toBeDefined();
  });
});
