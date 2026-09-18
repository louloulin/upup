
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  filterBuiltinCandidatesByToggles,
  normalizePluginKey,
  readUpUpPluginSettings,
  UPUP_BUILTIN_PLUGIN_DIRECTORIES,
  type BuiltinCandidate,
} from './plugin-toggles';

const ALL = UPUP_BUILTIN_PLUGIN_DIRECTORIES.length;
function fixtureCandidate(directory: string): BuiltinCandidate {
  return { directory, name: '@upup/' + directory, version: '0.1.0', path: '/fake/' + directory };
}
function allCandidates(): BuiltinCandidate[] {
  return UPUP_BUILTIN_PLUGIN_DIRECTORIES.map(fixtureCandidate);
}

describe('normalizePluginKey', () => {
  test('accepts bare directory names', () => {
    expect(normalizePluginKey('pi-cache')).toBe('@upup/pi-cache');
  });
  test('accepts scoped names', () => {
    expect(normalizePluginKey('@upup/pi-risk')).toBe('@upup/pi-risk');
  });
  test('accepts builtin: scheme', () => {
    expect(normalizePluginKey('builtin:@upup/pi-market-data')).toBe('@upup/pi-market-data');
    expect(normalizePluginKey('builtin:pi-market-data')).toBe('@upup/pi-market-data');
  });
  test('lowercases for case-insensitive matching', () => {
    expect(normalizePluginKey('@UpUp/PI-Platform')).toBe('@upup/pi-platform');
  });
});

describe('filterBuiltinCandidatesByToggles', () => {
  test('returns every candidate when settings is empty', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), {});
    expect(out.length).toBe(ALL);
  });
  test('drops a single disabled candidate', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), { disabled: ['@upup/pi-cache'] });
    expect(out.find((c) => c.directory === 'pi-cache')).toBeUndefined();
    expect(out.length).toBe(ALL - 1);
  });
  test('drops multiple disabled candidates', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), { disabled: ['pi-platform', 'pi-risk'] });
    expect(out.find((c) => c.directory === 'pi-platform')).toBeUndefined();
    expect(out.find((c) => c.directory === 'pi-risk')).toBeUndefined();
    expect(out.length).toBe(ALL - 2);
  });
  test('enabled list restricts to only-listed candidates', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), { enabled: ['@upup/pi-finance-sdk'] });
    expect(out.length).toBe(1);
    expect(out[0]?.directory).toBe('pi-finance-sdk');
  });
  test('disabled wins over enabled on conflict', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), { enabled: ['@upup/pi-finance-sdk'], disabled: ['@upup/pi-finance-sdk'] });
    expect(out.length).toBe(0);
  });
  test('unknown names in settings are ignored, not thrown', () => {
    const out = filterBuiltinCandidatesByToggles(allCandidates(), { disabled: ['@upup/not-a-real-pkg'] });
    expect(out.length).toBe(ALL);
  });
});

describe('readUpUpPluginSettings', () => {
  test('returns {} when no settings.json exists', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'upup-toggle-'));
    const prev = process.env.UPUP_CODING_AGENT_DIR;
    process.env.UPUP_CODING_AGENT_DIR = cwd;
    try { expect(readUpUpPluginSettings(cwd)).toEqual({}); }
    finally { if (prev === undefined) delete process.env.UPUP_CODING_AGENT_DIR; else process.env.UPUP_CODING_AGENT_DIR = prev; }
  });
  test('reads disabled / enabled from upupPlugins section', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'upup-toggle-'));
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'settings.json'), JSON.stringify({ upupPlugins: { disabled: ['@upup/pi-cache'], enabled: ['@upup/pi-finance-sdk'] } }));
    const prev = process.env.UPUP_CODING_AGENT_DIR;
    process.env.UPUP_CODING_AGENT_DIR = cwd;
    try {
      const settings = readUpUpPluginSettings(cwd);
      expect(settings.disabled).toEqual(['@upup/pi-cache']);
      expect(settings.enabled).toEqual(['@upup/pi-finance-sdk']);
    } finally { if (prev === undefined) delete process.env.UPUP_CODING_AGENT_DIR; else process.env.UPUP_CODING_AGENT_DIR = prev; }
  });
  test('returns {} for malformed JSON without throwing', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'upup-toggle-'));
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'settings.json'), '{not valid json');
    const prev = process.env.UPUP_CODING_AGENT_DIR;
    process.env.UPUP_CODING_AGENT_DIR = cwd;
    try { expect(readUpUpPluginSettings(cwd)).toEqual({}); }
    finally { if (prev === undefined) delete process.env.UPUP_CODING_AGENT_DIR; else process.env.UPUP_CODING_AGENT_DIR = prev; }
  });
  test('ignores non-string entries in disabled array', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'upup-toggle-'));
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'settings.json'), JSON.stringify({ upupPlugins: { disabled: ['@upup/pi-cache', 42, null, ''] } }));
    const prev = process.env.UPUP_CODING_AGENT_DIR;
    process.env.UPUP_CODING_AGENT_DIR = cwd;
    try { expect(readUpUpPluginSettings(cwd).disabled).toEqual(['@upup/pi-cache']); }
    finally { if (prev === undefined) delete process.env.UPUP_CODING_AGENT_DIR; else process.env.UPUP_CODING_AGENT_DIR = prev; }
  });
});
