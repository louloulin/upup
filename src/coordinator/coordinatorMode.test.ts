/**
 * Tests for coordinatorMode — main Agent tool-whitelist + feature gate.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  COORDINATOR_FORBIDDEN,
  COORDINATOR_MODE_GATE,
  COORDINATOR_SYSTEM_PROMPT,
  COORDINATOR_WHITELIST,
  assertCoordinatorToolAccess,
  filterToolsForMainAgent,
  isCoordinatorMode,
} from './coordinatorMode.js';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of [
    'CLAUDE_COORDINATOR_MODE',
    'BUN_CONFIG_FEATURE_COORDINATOR_MODE',
    'FEATURE_COORDINATOR_MODE',
  ]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('COORDINATOR_WHITELIST shape', () => {
  test('whitelist is non-empty and finite', () => {
    expect(COORDINATOR_WHITELIST.size).toBeGreaterThan(0);
    expect(COORDINATOR_WHITELIST.size).toBeLessThan(20);
  });

  test('forbidden set is non-empty', () => {
    expect(COORDINATOR_FORBIDDEN.size).toBeGreaterThan(0);
  });

  test('whitelist and forbidden do not overlap', () => {
    for (const t of COORDINATOR_WHITELIST) {
      expect(COORDINATOR_FORBIDDEN.has(t)).toBe(false);
    }
  });

  test('worker dispatch tools are in the whitelist', () => {
    expect(COORDINATOR_WHITELIST.has('agent_spawn_worker')).toBe(true);
    expect(COORDINATOR_WHITELIST.has('send_message_to_worker')).toBe(true);
    expect(COORDINATOR_WHITELIST.has('stop_worker')).toBe(true);
  });

  test('leaf tools are in the forbidden set', () => {
    expect(COORDINATOR_FORBIDDEN.has('bash')).toBe(true);
    expect(COORDINATOR_FORBIDDEN.has('file_edit')).toBe(true);
    expect(COORDINATOR_FORBIDDEN.has('web_search')).toBe(true);
    expect(COORDINATOR_FORBIDDEN.has('place_trade')).toBe(true);
  });
});

describe('isCoordinatorMode', () => {
  test('false by default (no env, no gate, no override)', () => {
    expect(isCoordinatorMode()).toBe(false);
  });

  test('true when CLAUDE_COORDINATOR_MODE=1', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    expect(isCoordinatorMode()).toBe(true);
  });

  test('true when CLAUDE_COORDINATOR_MODE=true', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = 'true';
    expect(isCoordinatorMode()).toBe(true);
  });

  test('false when CLAUDE_COORDINATOR_MODE=0', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '0';
    expect(isCoordinatorMode()).toBe(false);
  });

  test('false when CLAUDE_COORDINATOR_MODE=false', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = 'false';
    expect(isCoordinatorMode()).toBe(false);
  });

  test('garbage env value is treated as off (safer default)', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = 'maybe';
    expect(isCoordinatorMode()).toBe(false);
  });

  test('gate constant is the expected canonical name', () => {
    expect(COORDINATOR_MODE_GATE).toBe('COORDINATOR_MODE');
  });
});

describe('filterToolsForMainAgent', () => {
  const allTools = [
    'agent_spawn_worker',
    'send_message_to_worker',
    'stop_worker',
    'coordinator_create_task',
    'bash',
    'file_edit',
    'web_search',
    'place_trade',
  ];

  test('returns all tools when NOT in coordinator mode', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '0';
    expect(filterToolsForMainAgent(allTools)).toEqual(allTools);
  });

  test('returns only whitelisted tools when in coordinator mode', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    const filtered = filterToolsForMainAgent(allTools);
    for (const t of filtered) {
      expect(COORDINATOR_WHITELIST.has(t)).toBe(true);
    }
    expect(filtered).not.toContain('bash');
    expect(filtered).not.toContain('web_search');
    expect(filtered).not.toContain('place_trade');
  });

  test('handles empty input', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    expect(filterToolsForMainAgent([])).toEqual([]);
  });

  test('handles unknown tool names gracefully (they pass through if not forbidden)', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    const filtered = filterToolsForMainAgent(['mystery_tool']);
    // mystery_tool isn't in WHITELIST, so it gets filtered out in coordinator mode.
    expect(filtered).toEqual([]);
  });
});

describe('assertCoordinatorToolAccess', () => {
  test('does not throw when NOT in coordinator mode (any tool is fine)', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '0';
    expect(() => assertCoordinatorToolAccess('bash')).not.toThrow();
    expect(() => assertCoordinatorToolAccess('file_edit')).not.toThrow();
  });

  test('does not throw for whitelisted tool in coordinator mode', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    expect(() => assertCoordinatorToolAccess('agent_spawn_worker')).not.toThrow();
    expect(() => assertCoordinatorToolAccess('coordinator_list_tasks')).not.toThrow();
  });

  test('throws with COORDINATOR_TOOL_FORBIDDEN code for explicitly forbidden tools', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    let captured: (Error & { code?: string }) | null = null;
    try {
      assertCoordinatorToolAccess('bash');
    } catch (e) {
      captured = e as Error & { code?: string };
    }
    expect(captured).not.toBeNull();
    expect(captured!.code).toBe('COORDINATOR_TOOL_FORBIDDEN');
  });

  test('throws with COORDINATOR_TOOL_NOT_WHITELISTED for unknown tools', () => {
    process.env['CLAUDE_COORDINATOR_MODE'] = '1';
    let captured: (Error & { code?: string }) | null = null;
    try {
      assertCoordinatorToolAccess('mystery_tool');
    } catch (e) {
      captured = e as Error & { code?: string };
    }
    expect(captured).not.toBeNull();
    expect(captured!.code).toBe('COORDINATOR_TOOL_NOT_WHITELISTED');
  });
});

describe('COORDINATOR_SYSTEM_PROMPT', () => {
  test('is a non-empty string', () => {
    expect(typeof COORDINATOR_SYSTEM_PROMPT).toBe('string');
    expect(COORDINATOR_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  test('mentions COORDINATOR MODE', () => {
    expect(COORDINATOR_SYSTEM_PROMPT).toContain('COORDINATOR MODE');
  });

  test('lists every whitelisted tool by name', () => {
    for (const tool of COORDINATOR_WHITELIST) {
      expect(COORDINATOR_SYSTEM_PROMPT).toContain(tool);
    }
  });

  test('explicitly forbids bash and file_edit', () => {
    expect(COORDINATOR_SYSTEM_PROMPT).toContain('bash');
    expect(COORDINATOR_SYSTEM_PROMPT).toContain('file_edit');
  });
});
