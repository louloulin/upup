/**
 * Bridge command — `upup bridge notify-reload`
 *
 * Phase 0.1c remote trigger for the bridge `onReloadRequest` hook. Lets a
 * long-running TUI or CLI session get notified that the underlying Pi
 * resources have changed (e.g. after `upup plugin install` from another
 * terminal) and re-discover them without restarting.
 *
 * The command is intentionally tiny: it takes a `--port` (defaults to the
 * canonical bridge port 9090) and the `--token` (defaults to reading
 * `UPBRIDGE_TOKEN` env) and POSTs to `/bridge/notify-reload`. Failures
 * surface a structured exit code so callers can decide whether to retry.
 */

export interface BridgeNotifyReloadOptions {
  /** Bridge port. Defaults to 9090. */
  port?: number;
  /** Bridge token. Falls back to `UPBRIDGE_TOKEN` env when omitted. */
  token?: string;
  /** Optional human-readable label embedded in the reload audit trail. */
  triggeredBy?: string;
  /** Caller-supplied env (defaults to `process.env` for tests). */
  env?: NodeJS.ProcessEnv;
  /** Base URL override for tests (defaults to http://127.0.0.1:<port>). */
  baseUrl?: string;
  /** Optional request timeout in milliseconds (defaults to 5_000). */
  timeoutMs?: number;
}

export interface BridgeNotifyReloadResult {
  readonly exitCode: 0 | 1 | 2;
  readonly message: string;
  readonly body?: unknown;
}

const DEFAULT_PORT = 9090;
const DEFAULT_TIMEOUT_MS = 5_000;

export async function runBridgeNotifyReloadCommand(
  options: BridgeNotifyReloadOptions = {},
): Promise<BridgeNotifyReloadResult> {
  const env = options.env ?? process.env;
  const port = options.port ?? DEFAULT_PORT;
  const token = options.token ?? env.UPBRIDGE_TOKEN;
  if (!token) {
    return {
      exitCode: 1,
      message: 'bridge notify-reload: missing token — pass --token <secret> or set UPBRIDGE_TOKEN',
    };
  }
  const baseUrl = options.baseUrl ?? `http://127.0.0.1:${port}`;
  const url = `${baseUrl.replace(/\/+$/, '')}/bridge/notify-reload?token=${encodeURIComponent(token)}`;
  const body = JSON.stringify({ triggeredBy: options.triggeredBy ?? 'upup-cli' });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    if (!response.ok) {
      const detail =
        parsed && typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error?: unknown }).error)
          : `HTTP ${response.status}`;
      return {
        exitCode: 2,
        message: `bridge notify-reload failed: ${detail} (${response.status})`,
        body: parsed,
      };
    }
    const summary =
      parsed && typeof parsed === 'object' && parsed !== null
        ? JSON.stringify({
            extensions: (parsed as { extensions?: unknown }).extensions,
            skills: (parsed as { skills?: unknown }).skills,
            prompts: (parsed as { prompts?: unknown }).prompts,
          })
        : '';
    return {
      exitCode: 0,
      message: summary ? `bridge reload ok (${summary})` : 'bridge reload ok',
      body: parsed,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { exitCode: 2, message: `bridge notify-reload timed out after ${timeoutMs}ms` };
    }
    const detail = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message: `bridge notify-reload error: ${detail}` };
  } finally {
    clearTimeout(timer);
  }
}
