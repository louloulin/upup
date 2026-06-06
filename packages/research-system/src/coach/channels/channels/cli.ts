/**
 * CLI 推送渠道(默认启用,无需配置)。
 *
 * 行为:
 *   - 把 payload 写到 stdout(供主对话 / TUI 消费)
 *   - 永远 enabled(只要 COACH_MODE 编译开关开)
 */
import type { PushChannel, PushPayload, PushResult } from './types.js';
import { isChannelsCompiledIn, readEnvBool } from './types.js';

export class CliChannel implements PushChannel {
  readonly name = 'cli';

  isEnabled(): boolean {
    return isChannelsCompiledIn() && readEnvBool('UPUP_CLI_CHANNEL', true);
  }

  async send(payload: PushPayload): Promise<PushResult> {
    const t0 = Date.now();
    try {
      const lines = [
        `## ${payload.title}`,
        '',
        payload.body,
        ...(payload.url ? [`\n→ ${payload.url}`] : []),
        ...(payload.tags?.length ? [`\ntags: ${payload.tags.join(', ')}`] : []),
      ];
      // TTY-aware: 写 stdout 而非 stderr,避免污染 log
      process.stdout.write(lines.join('\n') + '\n');
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, error: (err as Error).message, latencyMs: Date.now() - t0 };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: process.stdout.writable !== false, detail: 'stdout writable' };
  }
}
