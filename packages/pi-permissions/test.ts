import { describe, test, expect } from 'bun:test';
import {
  SAFE_PATTERNS,
  DANGEROUS_PATTERNS,
  DEFAULT_PROTECTED_PATHS,
  isPathProtected,
  classifyBashCommand,
  evaluateMCPTool,
  exportPermissionRules,
  getPermissionEvaluator,
  getSessionPermissionManager,
  resetPermissions,
  type PermissionRule,
} from './src/index.ts';

describe('@upup/pi-permissions', () => {
  test('exports safe patterns and dangerous patterns', () => {
    expect(SAFE_PATTERNS.length).toBeGreaterThan(0);
    expect(DANGEROUS_PATTERNS.length).toBeGreaterThan(0);
  });

  test('default protected paths include sensitive patterns', () => {
    expect(DEFAULT_PROTECTED_PATHS.protectedPaths.some((p) => p.includes('.git'))).toBe(true);
    expect(DEFAULT_PROTECTED_PATHS.protectedPaths.some((p) => p.includes('.env'))).toBe(true);
  });

  test('isPathProtected detects paths under protected directories', () => {
    expect(isPathProtected('/some/repo/.git/config')).toBe(true);
    expect(isPathProtected('/tmp/safe')).toBe(false);
  });

  test('classifyBashCommand tags read-only commands', () => {
    const cls = classifyBashCommand('ls -la');
    expect(cls.category).toBe('read-only');
    expect(cls.confidence).toBeGreaterThan(0);
  });

  test('classifyBashCommand tags destructive commands', () => {
    const cls = classifyBashCommand('rm -rf /tmp/data');
    expect(['destructive', 'safe-modification', 'unknown']).toContain(cls.category);
  });

  test('evaluateMCPTool returns a decision for known tools', () => {
    const decision = evaluateMCPTool('mcp__filesystem', 'read_file', { path: '/tmp/x' });
    expect(typeof decision.allowed).toBe('boolean');
    expect(decision.reason.length).toBeGreaterThan(0);
  });

  test('exportPermissionRules produces JSON string', () => {
    resetPermissions();
    const rules: PermissionRule[] = SAFE_PATTERNS.slice(0, 2);
    const json = exportPermissionRules(rules);
    expect(json.length).toBeGreaterThan(0);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.0');
    expect(parsed.customRules).toHaveLength(2);
  });

  test('getPermissionEvaluator is a singleton', () => {
    const a = getPermissionEvaluator();
    const b = getPermissionEvaluator();
    expect(a).toBe(b);
  });

  test('getSessionPermissionManager is a singleton', () => {
    resetPermissions();
    const a = getSessionPermissionManager();
    const b = getSessionPermissionManager();
    expect(a).toBe(b);
  });
});
