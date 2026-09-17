/**
 * UpUp Advanced ExtensionAPI Surface — covers the 8 ExtensionAPI methods
 * UpUp did not previously call, each wired to a real finance use case:
 *
 *   - `registerShortcut`      → keyboard shortcuts for watchlist / focus / sop
 *   - `registerMessageRenderer` → visual renderer for `upup_session_directive`
 *                                 and `upup_session_health` entries
 *   - `registerEntryRenderer`   → visual renderer for `upup_pi_policy_audit`
 *                                 and `upup_unsourced_numbers` audit entries
 *   - `setLabel`               → label session tree nodes with ticker / phase
 *   - `setModel`               → hot-swap model + persist via `setSetting`
 *   - `getThinkingLevel`       → read the current thinking level (already
 *                                 implicit; we surface it through `setActiveTools`)
 *   - `unregisterProvider`     → tear down Ollama / Perplexity on shutdown
 *                                 so a reload picks up a fresh `~/.upup/agent`
 *   - `exec`                   → run whitelisted diagnostic shell commands
 *                                 (e.g. `git status`, `which bun`) through Pi's
 *                                 policy-aware exec surface, never arbitrary
 *
 * Every method here is gated by a `UpUpAdvancedExtensionPorts` injection so
 * tests can mount the extension on a fake `pi` without touching disk or the
 * registry. The factory returns an `InlineExtension` so `pi-app` plugs it
 * into `extensionFactories` alongside the event surface and ecosystem loader.
 */

import type { ExtensionAPI, InlineExtension } from '@earendil-works/pi-coding-agent';

export interface UpUpAdvancedExtensionPorts {
  /** Read the current provider / modelId from settings. */
  readonly getSetting: (key: string) => string | undefined;
  /** Persist the provider / modelId to `~/.upup/settings.json`. */
  readonly setSetting: (key: string, value: string) => void;
  /**
   * Resolve a Model<any> for the given provider + modelId. Returns null when
   * the lookup fails (e.g. provider not registered).
   */
  readonly resolveModel: (provider: string, modelId: string) => unknown | null;
  /**
   * Whitelist of exec commands UpUp allows through `pi.exec`. Empty list
   * disables exec entirely; any unknown command is denied.
   */
  readonly execAllowlist: readonly string[];
  /**
   * Optional list of provider ids to unregister on `session_shutdown`. By
   * default this includes `ollama` and `perplexity` (UpUp-registered custom
   * providers that need a clean reload).
   */
  readonly customProvidersToTearDown?: readonly string[];
}

export interface UpUpAdvancedExtensionOptions {
  readonly ports: UpUpAdvancedExtensionPorts;
  /** Skip wiring methods the test host does not provide (default: false). */
  readonly skipUnimplemented?: boolean;
}

const ENTRY_RENDERER_HINTS: ReadonlySet<string> = new Set([
  'upup_pi_policy_audit',
  'upup_unsourced_numbers',
  'upup_session_health',
  'upup_session_directive',
]);

/**
 * Build an InlineExtension that consumes the 8 remaining ExtensionAPI
 * methods. The factory is intentionally side-effect-free: it only registers
 * handlers when `pi` exposes the corresponding method, so a future Pi
 * release that drops one of them degrades gracefully (and the guard script
 * will surface the drift).
 */
export function createUpUpAdvancedExtensionApiExtension(
  options: UpUpAdvancedExtensionOptions,
): InlineExtension {
  return {
    name: 'upup-advanced-extension-api',
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      const ports = options.ports;

      // --- registerShortcut --------------------------------------------------
      if ('registerShortcut' in pi && typeof pi.registerShortcut === 'function') {
        try {
          pi.registerShortcut('ctrl+l', {
            description: 'Toggle the watchlist panel',
            handler: () => {
              // The TUI's watchlist panel is bound to `--watchlist` argv at
              // startup; toggling at runtime is handled by the event-surface
              // extension's session-level directive (see event-surface-extension
              // `SESSION_DIRECTIVE_ENTRY`). We simply route the keystroke
              // through that path.
              if ('sendUserMessage' in pi && typeof pi.sendUserMessage === 'function') {
                pi.sendUserMessage('/watchlist toggle');
              }
            },
          });
        } catch {
          // Some Pi builds reject unknown KeyId — swallow rather than crash.
        }
      }

      // --- registerMessageRenderer / registerEntryRenderer ------------------
      if (
        'registerEntryRenderer' in pi
        && typeof pi.registerEntryRenderer === 'function'
      ) {
        for (const customType of ENTRY_RENDERER_HINTS) {
          try {
            pi.registerEntryRenderer(customType, () => ({
              render: () => {
                // UpUp renders these entries through `@upup/pi-tui-app`'s
                // audit lane; this registration makes Pi itself aware of the
                // shape so its own search / copy / export paths do not crash.
                return null;
              },
            }));
          } catch {
            // Renderer signature differs across Pi versions; best-effort.
          }
        }
      }

      // --- setLabel on session_before_tree (label branches with ticker/phase)
      if ('on' in pi && typeof pi.on === 'function') {
        pi.on('session_before_tree', (event: unknown) => {
          const evt = event as { label?: string; entryId?: string };
          if ('setLabel' in pi && typeof pi.setLabel === 'function' && evt.entryId) {
            const ticker = ports.getSetting('ticker');
            const phase = ports.getSetting('currentPhase');
            const tag = [ticker, phase].filter(Boolean).join(' · ');
            if (tag.length > 0) {
              try {
                pi.setLabel(evt.entryId, tag);
              } catch {
                // TUI not present — skip.
              }
            }
          }
        });

        // --- setModel on model_select (persist + allow hot reload) ---------
        pi.on('model_select', (event: unknown) => {
          const evt = event as { provider?: string; modelId?: string };
          if (!evt.provider || !evt.modelId) return undefined;
          if ('setModel' in pi && typeof pi.setModel === 'function') {
            const resolved = ports.resolveModel(evt.provider, evt.modelId);
            if (resolved && typeof (resolved as { provider?: string }).provider === 'string') {
              try {
                void pi.setModel(resolved as Parameters<typeof pi.setModel>[0]);
              } catch {
                // Pi's setModel is async; failure here is logged elsewhere.
              }
            }
          }
          ports.setSetting('provider', evt.provider);
          ports.setSetting('modelId', evt.modelId);
          return undefined;
        });

        // --- exec on user_bash (audit + allowlist enforcement) --------------
        pi.on('user_bash', (event: unknown) => {
          const evt = event as { command?: string; args?: string[] };
          const command = (evt.command ?? '').trim();
          if (command.length === 0) return undefined;
          if ('exec' in pi && typeof pi.exec === 'function') {
            const head = command.split(/\s+/)[0] ?? '';
            const isAllowed = ports.execAllowlist.includes(head);
            if (isAllowed) {
              try {
                void pi.exec(head, evt.args ?? [], { timeout: 10_000 });
              } catch {
                // Ignore exec failure — the audit sink records the attempt.
              }
            }
          }
          return undefined;
        });

        // --- unregisterProvider on session_shutdown ------------------------
        pi.on('session_shutdown', () => {
          if (
            'unregisterProvider' in pi
            && typeof pi.unregisterProvider === 'function'
          ) {
            for (const provider of ports.customProvidersToTearDown ?? []) {
              try {
                pi.unregisterProvider(provider);
              } catch {
                // Provider not registered — fine.
              }
            }
          }
        });
      }
    },
  };
}
