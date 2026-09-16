/**
 * Tool-surface scope policy for an UpUp AgentSpec.
 *
 * An UpUp session inherits every tool Pi knows about: Pi's built-ins, UpUp's
 * own investment tools, and every tool contributed by the third-party Pi
 * packages the user has installed. Measured on a real install, that is
 * **310 tool schemas / 228,878 characters (~57k tokens) on every turn** — the
 * single largest block of context we send, larger than the system prompt and
 * the skill library combined.
 *
 * Payload size is not cosmetic: with the full surface a one-line question
 * measured 7.9s-31.8s to first token against MiniMax, while the same question
 * with a five-tool surface measured 2.4s twice in a row. Trimming the surface
 * also removes cross-plugin name collisions (UpUp ships `web_search`; an
 * installed package ships `source_check`/`fetch_content` for the same job).
 *
 * `'core'` therefore keeps Pi's built-ins plus everything UpUp's own packages
 * contribute, and hides tools that arrived from third-party packages
 * (`sourceInfo.source` of the form `npm:<pkg>`). Nothing is uninstalled —
 * `UPUP_TOOL_SCOPE=all` (or `{"toolScope": "all"}` in settings) restores the
 * full surface, and an explicit `spec.tools` allowlist always wins.
 */

export type UpUpToolScopePolicy = 'core' | 'all';

/** Environment variable that overrides the persisted scope choice. */
export const TOOL_SCOPE_ENV_VAR = 'UPUP_TOOL_SCOPE';

/** Settings key (`.upup/settings.json`) that persists the scope choice. */
export const TOOL_SCOPE_SETTING_KEY = 'toolScope';

export interface ToolScopeEntry {
  readonly name: string;
  readonly sourceInfo?: { readonly source?: string };
}

/**
 * True when a tool was contributed by a third-party Pi package rather than by
 * Pi itself or by one of UpUp's own packages. `sourceInfo.source` is either
 * `'builtin'`, `'cli'` (UpUp package extensions) or `'npm:<package>'`.
 */
export function isThirdPartyToolSource(source: string | undefined): boolean {
  return typeof source === 'string' && source.startsWith('npm:');
}

/**
 * Scope to use for a session that does not declare one explicitly.
 *
 * Precedence: `UPUP_TOOL_SCOPE` env → persisted setting → `'core'`.
 */
export function resolveDefaultToolScope(
  env: NodeJS.ProcessEnv = process.env,
  configured?: string,
): UpUpToolScopePolicy {
  const fromEnv = env[TOOL_SCOPE_ENV_VAR]?.trim();
  const candidate = fromEnv || configured?.trim();
  return candidate === 'all' ? 'all' : 'core';
}

export interface SelectActiveToolsInput {
  /** Tool names Pi activated for this session. */
  readonly activeNames: readonly string[];
  /** Every tool definition the session registered, with source metadata. */
  readonly allTools: readonly ToolScopeEntry[];
  /** `spec.tools`: `'*'` means "whatever Pi activated". */
  readonly specTools: readonly string[] | '*';
  readonly scope: UpUpToolScopePolicy;
}

/**
 * Compute the tool names to activate. Pure so the policy can be tested without
 * booting a session.
 *
 * - An explicit `spec.tools` allowlist is authoritative and is never widened or
 *   narrowed by the scope policy — profiles that pin a toolset keep it.
 * - `'all'` returns Pi's activated set unchanged.
 * - `'core'` drops third-party package tools, preserving Pi's ordering.
 */
export function selectActiveTools(input: SelectActiveToolsInput): string[] {
  const { activeNames, allTools, specTools, scope } = input;
  if (specTools !== '*') {
    const allowed = new Set(specTools);
    return activeNames.filter((name) => allowed.has(name));
  }
  if (scope === 'all') return [...activeNames];
  const thirdParty = new Set(
    allTools
      .filter((tool) => isThirdPartyToolSource(tool.sourceInfo?.source))
      .map((tool) => tool.name),
  );
  if (thirdParty.size === 0) return [...activeNames];
  return activeNames.filter((name) => !thirdParty.has(name));
}
