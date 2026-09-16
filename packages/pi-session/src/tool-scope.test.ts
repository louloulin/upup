import { describe, expect, test } from 'bun:test';
import {
  isThirdPartyToolSource,
  resolveDefaultToolScope,
  selectActiveTools,
  TOOL_SCOPE_ENV_VAR,
  type ToolScopeEntry,
} from './tool-scope';

const tools: ToolScopeEntry[] = [
  { name: 'read', sourceInfo: { source: 'builtin' } },
  { name: 'web_search', sourceInfo: { source: 'cli' } },
  { name: 'get_stock_price', sourceInfo: { source: 'cli' } },
  { name: 'subagent', sourceInfo: { source: 'npm:pi-subagents' } },
  { name: 'bg_wait', sourceInfo: { source: 'npm:pi-subagents' } },
  { name: 'mcp', sourceInfo: { source: 'npm:pi-mcp-adapter' } },
];

describe('@upup/pi-session — tool surface scope', () => {
  test('detects third-party package tools by their npm source', () => {
    expect(isThirdPartyToolSource('npm:pi-subagents')).toBe(true);
    expect(isThirdPartyToolSource('npm:@acme/plugin')).toBe(true);
    expect(isThirdPartyToolSource('cli')).toBe(false);
    expect(isThirdPartyToolSource('builtin')).toBe(false);
    expect(isThirdPartyToolSource(undefined)).toBe(false);
  });

  test('defaults to core so third-party package tools stay out of the prompt', () => {
    expect(resolveDefaultToolScope({}, undefined)).toBe('core');
    expect(resolveDefaultToolScope({ [TOOL_SCOPE_ENV_VAR]: 'all' }, undefined)).toBe('all');
    // Env wins over the persisted setting.
    expect(resolveDefaultToolScope({ [TOOL_SCOPE_ENV_VAR]: 'core' }, 'all')).toBe('core');
    expect(resolveDefaultToolScope({}, 'bogus')).toBe('core');
  });

  test("'core' keeps Pi and UpUp tools and drops third-party ones, preserving order", () => {
    const active = tools.map((tool) => tool.name);
    expect(selectActiveTools({ activeNames: active, allTools: tools, specTools: '*', scope: 'core' }))
      .toEqual(['read', 'web_search', 'get_stock_price']);
  });

  test("'all' leaves Pi's activated set untouched", () => {
    const active = tools.map((tool) => tool.name);
    expect(selectActiveTools({ activeNames: active, allTools: tools, specTools: '*', scope: 'all' }))
      .toEqual(active);
  });

  test('an explicit spec.tools allowlist is authoritative under either scope', () => {
    const active = tools.map((tool) => tool.name);
    // Profiles that pin a toolset keep it — the scope policy never widens it,
    // and never silently removes a tool the profile asked for.
    expect(selectActiveTools({ activeNames: active, allTools: tools, specTools: ['subagent', 'read'], scope: 'core' }))
      .toEqual(['read', 'subagent']);
    expect(selectActiveTools({ activeNames: active, allTools: tools, specTools: ['read'], scope: 'all' }))
      .toEqual(['read']);
  });

  test('missing source metadata never causes a tool to be dropped', () => {
    const active = ['read', 'mystery'];
    expect(selectActiveTools({ activeNames: active, allTools: [{ name: 'read' }], specTools: '*', scope: 'core' }))
      .toEqual(active);
  });
});
