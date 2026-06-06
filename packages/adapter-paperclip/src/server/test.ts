/**
 * Environment diagnostics for the UpUp Paperclip adapter.
 */

import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
} from '@paperclipai/adapter-utils';

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  // ── Bun runtime ──────────────────────────────────────────────────────────
  try {
    const { execSync } = await import('child_process');
    execSync('bun --version', { encoding: 'utf-8', stdio: 'pipe' });
    checks.push({
      code: 'BUN',
      level: 'info',
      message: 'bun runtime installed',
    });
  } catch {
    checks.push({
      code: 'BUN',
      level: 'error',
      message: 'bun not found - required',
    });
  }

  // ── Node version ───────────────────────────────────────────────────────
  const nodeVersion = process.version;
  checks.push({
    code: 'NODE',
    level: nodeVersion >= 'v20' ? 'info' : 'warn',
    message: `Node ${nodeVersion}`,
  });

  // ── Default model ─────────────────────────────────────────────────────
  const model = process.env.DEFAULT_MODEL;
  checks.push({
    code: 'MODEL',
    level: model ? 'info' : 'warn',
    message: model ? `default: ${model}` : 'not set - will use provider default',
  });

  // ── API Keys ───────────────────────────────────────────────────────────
  const apiKeys = [
    { key: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
    { key: 'DEEPSEEK_API_KEY', name: 'DeepSeek' },
    { key: 'OPENAI_API_KEY', name: 'OpenAI' },
    { key: 'GOOGLE_API_KEY', name: 'Google' },
  ];
  for (const { key, name } of apiKeys) {
    checks.push({
      code: key,
      level: process.env[key] ? 'info' : 'warn',
      message: process.env[key] ? 'configured' : `not set (${name})`,
    });
  }

  // ── Required packages ─────────────────────────────────────────────────
  const requiredModules = [
    '@upup/agent-runtime',
    '@upup/state',
    '@upup/types',
  ];
  for (const mod of requiredModules) {
    try {
      require.resolve(mod);
      checks.push({
        code: mod,
        level: 'info',
        message: 'installed',
      });
    } catch {
      checks.push({
        code: mod,
        level: 'error',
        message: 'not installed',
      });
    }
  }

  // ── Working directory ─────────────────────────────────────────────────
  const cwd = process.cwd();
  checks.push({
    code: 'CWD',
    level: 'info',
    message: cwd,
  });

  // ── Determine overall status ─────────────────────────────────────────────
  const hasErrors = checks.some(c => c.level === 'error');
  const hasWarnings = checks.some(c => c.level === 'warn');
  const status = hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass';

  return {
    adapterType: ctx.adapterType || 'upup_local',
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
