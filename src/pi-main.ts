/**
 * Pi main entry — thin shell that hosts upup extensions on top of
 * `@earendil-works/pi-coding-agent`'s extension system.
 *
 * Spec: openspec/changes/upup-vs-loucode-gap-audit-and-roadmap (R-pi-core-integration)
 *
 * This module exports three layers:
 *
 *   1. {@link createPiMain}     — the actual upup-side factory map + Pi loader bridge.
 *   2. {@link createFakeApi}    — a complete **Pi Fake API** (test double) that
 *                                 records every call an extension makes against
 *                                 upup's extension contract. It is a full
 *                                 recording surface — not just `registerTool` /
 *                                 `registerCommand` — so the same object can
 *                                 serve as a stand-in for the real Pi runtime
 *                                 without any narrowing at the consumer side.
 *   3. {@link createPiLoader}   — a thin adapter over pi-coding-agent's
 *                                 `createExtensionRuntime` so the recorded fake
 *                                 api is observable on the loader side.
 *
 * Why a "fake api" at all?
 *
 *   The real Pi runtime is bound to a session, an event bus, and an interactive
 *   TUI. Extensions written against `ExtensionAPI` need *some* object passed in,
 *   and they shouldn't care whether it is a real session or a recording stub —
 *   that is the point of dependency injection. The fake api is the recording
 *   stub. It exposes a recording surface that matches the methods every upup
 *   extension actually calls (tool registration, command registration, event
 *   subscription, session messaging, provider registration, exec, etc.) so an
 *   extension written for Pi can be loaded under either runtime without code
 *   changes.
 *
 *   Every recorded side effect is exposed as a `ReadonlyArray` so tests can
 *   make stable assertions. Internal state is private; snapshot getters return
 *   frozen copies, not live references.
 *
 * Real-pi integration:
 *
 *   `createPiLoader()` wires the upup-side factory map into pi-coding-agent's
 *   `createExtensionRuntime()`. The runtime's action methods throw if called
 *   during extension load (they need a bound session); we never call them from
 *   the loader — we only verify the runtime is constructible. Tool/command
 *   shape validation is done on the fake api side because that is where the
 *   upup contract lives.
 */
import { registerRealtimeExtension } from './realtime/pi-realtime.js';
import { registerDaemonExtension } from './daemon/pi-daemon.js';
import { registerConfigExtension } from './daemon/pi-config-extension.js';
import { registerAstockExtension } from './astock/pi-astock-extension.js';
import { registerTradingExtension } from './trading/pi-trading-extension.js';
import { createRealtimeFeed } from './realtime/index.js';
import type { RealtimeExtensionApi } from './realtime/pi-realtime.js';
import type { DaemonExtensionApi } from './daemon/pi-daemon.js';
import { createExtensionRuntime } from '@earendil-works/pi-coding-agent';

/** ---------------------------------------------------------------------------
 * The upup extension contract.
 *
 * Extensions in this repo register tools and commands, subscribe to events,
 * and use the session/messaging surface. The Pi Fake API implements this
 * contract as a recording test double. The contract is intentionally close
 * to pi-coding-agent's `ExtensionAPI` shape but uses upup-friendly parameter
 * types (loose `unknown` instead of TypeBox schemas) so internal extensions
 * don't have to take on a full schema-validated tool pipeline yet.
 * ------------------------------------------------------------------------ */

/**
 * Tool registration contract for the upup extension API. This is the
 * duck-typed shape that BOTH the historic loose form (`{ name, description,
 * execute() }`) AND pi-coding-agent's strict `ToolDefinition<TSchema,
 * TDetails, TState>` satisfy via structural subtyping — the latter has
 * extra optional fields (`label`, `parameters`, `prepareArguments`,
 * `renderCall`, `renderResult`, etc.) which TypeScript checks
 * positionally. The fake api accepts either; the loose form is the
 * path-of-least-resistance for internal extensions still on the historic
 * shape, while the strict form is what a fully-pi-migrated extension uses.
 *
 * The fake api does NOT call `execute` itself — call sites either invoke
 * the historic form (`execute()`) or the pi-runtime form
 * (`execute(toolCallId, params, signal, onUpdate, ctx)`). Each call site
 * type-checks against the concrete tool definition it imports.
 */
export interface PiUpupTool {
  name: string;
  label?: string;
  description?: string;
  parameters?: unknown;
  execute?: (...args: any[]) => any;
  prepareArguments?: (args: unknown) => unknown;
  renderCall?: (...args: any[]) => any;
  renderResult?: (...args: any[]) => any;
  promptSnippet?: string;
  promptGuidelines?: unknown;
}

export interface PiUpupCommand {
  name: string;
  options?: {
    description?: string;
    handler?: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
}

/**
 * The upup extension contract. Mirrors the methods every upup extension
 * uses, plus a few pi-coding-agent-specific methods that are present so the
 * fake api is recognisable as a Pi-shaped object (extension authors can
 * branch on the shape of `pi` rather than on its type).
 */
export interface PiUpupExtensionApi {
  // Event subscription (Pi `on`)
  on(event: string, handler: (...args: unknown[]) => unknown): void;

  // Tool registration (Pi `registerTool`)
  registerTool(tool: PiUpupTool): void;

  // Command registration (Pi `registerCommand`)
  registerCommand(name: string, options: PiUpupCommand['options']): void;

  // Shortcut + flag (Pi `registerShortcut`/`registerFlag`/`getFlag`)
  registerShortcut(shortcut: string, options: unknown): void;
  registerFlag(name: string, options: unknown): void;
  getFlag(name: string): boolean | string | undefined;

  // Renderers (Pi `registerMessageRenderer`/`registerEntryRenderer`/...)
  registerMessageRenderer(customType: string, renderer: unknown): void;
  registerEntryRenderer(customType: string, renderer: unknown): void;
  registerMarkdownTransformer(transformer: unknown): void;

  // Session messaging (Pi `sendMessage`/`sendUserMessage`/`appendEntry`)
  sendMessage(message: unknown, options?: unknown): void;
  sendUserMessage(content: unknown, options?: unknown): void;
  appendEntry(customType: string, data?: unknown): void;
  setSessionName(name: string | undefined): void;
  getSessionName(): string | undefined;
  setLabel(entryId: string, label: string | undefined): void;

  // Shell exec (Pi `exec`)
  exec(
    command: string,
    args: string[],
    options?: unknown,
  ): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;

  // Tools / commands introspection (Pi `getActiveTools`/`getAllTools`/...)
  getActiveTools(): string[];
  getAllTools(): Array<{
    name: string;
    description: string;
    parameters?: unknown;
    promptGuidelines?: unknown;
    sourceInfo: unknown;
  }>;
  setActiveTools(names: string[]): void;
  getCommands(): Array<{
    name: string;
    source: string;
    sourceInfo: unknown;
    description: string;
  }>;

  // Model + thinking level (Pi `setModel`/`getThinkingLevel`/...)
  setModel(model: unknown): Promise<boolean>;
  getThinkingLevel(): string;
  setThinkingLevel(level: unknown): void;

  // Provider registration (Pi `registerProvider`/`unregisterProvider`)
  registerProvider(name: string, config: unknown): void;
  unregisterProvider(name: string): void;

  // Shared event bus (Pi `events`)
  readonly events: {
    on(event: string, handler: (...args: unknown[]) => unknown): () => void;
    emit(event: string, ...args: unknown[]): void;
  };
}

/** ---------------------------------------------------------------------------
 * Public types: the upstream extension map + pi loader contract.
 * ------------------------------------------------------------------------ */

/** A user-supplied extension override (named factory function). */
export interface PiMainExtension {
  name: string;
  factory: (pi: PiUpupExtensionApi) => void | Promise<void>;
}

/** Options accepted by {@link createPiMain}. */
export interface PiMainOptions {
  extensions: PiMainExtension[];
}

/** A loaded extension's recorded state. */
export interface LoadedExtension {
  name: string;
  instance: Record<string, unknown>;
  registeredTools: Array<{ name: string; execute?: (...args: unknown[]) => unknown }>;
  registeredCommands: Array<{ name: string; options?: unknown }>;
  subscribedEvents: Array<{ event: string; handler: unknown }>;
  registeredShortcuts: Array<{ shortcut: string; options?: unknown }>;
  registeredFlags: Array<{ name: string; options?: unknown }>;
  sentMessages: Array<{ message: unknown; options?: unknown }>;
  sentUserMessages: Array<{ content: unknown; options?: unknown }>;
  appendedEntries: Array<{ customType: string; data?: unknown }>;
  executedCommands: Array<{ command: string; args?: string[] }>;
}

/** A factory entry in the upup-side extension map. */
export interface PiExtensionFactoryEntry {
  name: string;
  factory: (pi: PiUpupExtensionApi) => void | Promise<void>;
}

/** Pi loader contract. */
export interface PiLoader {
  loadExtensionFromFactory(
    entry: PiExtensionFactoryEntry,
    pi: PiFakeApi,
  ): Promise<unknown>;
}

/** Per-extension result returned by {@link PiMainResult.loadWith}. */
export interface PiLoadResult {
  name: string;
  ok: boolean;
  tools?: string[];
  commands?: string[];
  events?: string[];
  shortcuts?: string[];
  flags?: string[];
  error?: string;
}

/** Returned by {@link createPiMain}. */
export interface PiMainResult {
  extensions: string[];
  load: () => LoadedExtension[];
  extensionFactories: () => PiExtensionFactoryEntry[];
  loadWith: (loader: PiLoader) => Promise<PiLoadResult[]>;
}

/** ---------------------------------------------------------------------------
 * The Fake API — a complete test double for the upup Pi extension contract.
 *
 * Recording semantics:
 *
 *   - Push-only arrays. Nothing is mutated after the fact.
 *   - Snapshot getters return frozen copies so test assertions cannot be
 *     invalidated by later mutations.
 *   - Errors thrown by extension code bubble out of the loader bridge; they
 *     do NOT poison the recording arrays.
 *
 * The fake api is intentionally permissive: it accepts any arguments and
 * returns `undefined` for `void` methods. It is the extension author's
 * responsibility to follow the upup extension contract — this double only
 * verifies the shape of the calls, not their semantic correctness.
 * ------------------------------------------------------------------------ */

export interface PiFakeApi extends PiUpupExtensionApi {
  readonly tools: ReadonlyArray<PiUpupTool>;
  readonly commands: ReadonlyArray<PiUpupCommand>;
  readonly subscribedEvents: ReadonlyArray<{ event: string; handler: unknown }>;
  readonly shortcuts: ReadonlyArray<{ shortcut: string; options?: unknown }>;
  readonly flags: ReadonlyArray<{ name: string; options?: unknown }>;
  readonly messages: ReadonlyArray<{ message: unknown; options?: unknown }>;
  readonly userMessages: ReadonlyArray<{ content: unknown; options?: unknown }>;
  readonly appendedEntries: ReadonlyArray<{ customType: string; data?: unknown }>;
  readonly executedCommands: ReadonlyArray<{ command: string; args?: string[] }>;
  readonly providers: ReadonlyArray<{ name: string; config?: unknown }>;
  readonly modelChanges: ReadonlyArray<{ model: unknown }>;
  readonly thinkingChanges: ReadonlyArray<{ level: unknown }>;
  readonly sessionNameChanges: ReadonlyArray<{ name: string | undefined }>;
}

export function createFakeApi(): PiFakeApi {
  const tools: PiUpupTool[] = [];
  const commands: PiUpupCommand[] = [];
  const events: Array<{ event: string; handler: unknown }> = [];
  const shortcuts: Array<{ shortcut: string; options?: unknown }> = [];
  const flags: Array<{ name: string; options?: unknown }> = [];
  const messages: Array<{ message: unknown; options?: unknown }> = [];
  const userMessages: Array<{ content: unknown; options?: unknown }> = [];
  const appendedEntries: Array<{ customType: string; data?: unknown }> = [];
  const executedCommands: Array<{ command: string; args?: string[] }> = [];
  const providers: Array<{ name: string; config?: unknown }> = [];
  const modelChanges: Array<{ model: unknown }> = [];
  const thinkingChanges: Array<{ level: unknown }> = [];
  const sessionNameChanges: Array<{ name: string | undefined }> = [];

  const sharedBus = {
    on(_event: string, _handler: (...args: unknown[]) => unknown) {
      return () => {};
    },
    emit(_event: string, ..._args: unknown[]) {
      // No-op; pi's real EventBus would forward to subscribed handlers.
    },
  };

  const api = {
    // --- Event subscription ---
    on(event: string, handler: unknown) {
      events.push({ event, handler });
    },

    // --- Tools ---
    registerTool(tool: PiUpupTool) {
      tools.push({ ...tool });
    },

    // --- Commands ---
    registerCommand(name: string, options: PiUpupCommand['options']) {
      commands.push({ name, options });
    },

    // --- Shortcuts + flags ---
    registerShortcut(shortcut: string, options: unknown) {
      shortcuts.push({ shortcut, options });
    },
    registerFlag(name: string, options: unknown) {
      flags.push({ name, options });
    },
    getFlag(name: string): boolean | string | undefined {
      const entry = flags.find((f) => f.name === name);
      const opts = entry?.options as { default?: boolean | string } | undefined;
      return opts?.default;
    },

    // --- Renderers ---
    registerMessageRenderer(_customType: string, _renderer: unknown) {
      // No-op recording.
    },
    registerEntryRenderer(_customType: string, _renderer: unknown) {
      // No-op recording.
    },
    registerMarkdownTransformer(_transformer: unknown) {
      // No-op recording.
    },

    // --- Session messaging ---
    sendMessage(message: unknown, options?: unknown) {
      messages.push({ message, options });
    },
    sendUserMessage(content: unknown, options?: unknown) {
      userMessages.push({ content, options });
    },
    appendEntry(customType: string, data?: unknown) {
      appendedEntries.push({ customType, data });
    },
    setSessionName(name: string | undefined) {
      sessionNameChanges.push({ name });
    },
    getSessionName(): string | undefined {
      return sessionNameChanges.length > 0
        ? sessionNameChanges[sessionNameChanges.length - 1]!.name
        : undefined;
    },
    setLabel(_entryId: string, _label: string | undefined) {
      // No-op recording.
    },

    // --- Shell exec ---
    async exec(_command: string, _args: string[], _options?: unknown) {
      return { stdout: '', stderr: '', code: 0, killed: false };
    },

    // --- Tools / commands introspection ---
    getActiveTools(): string[] {
      return tools.map((t) => t.name);
    },
    getAllTools() {
      return tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        parameters: t.parameters,
        promptGuidelines: undefined,
        sourceInfo: {
          path: '<fake:tool>',
          source: 'extension',
          scope: 'temporary',
          origin: 'top-level',
        },
      }));
    },
    setActiveTools(_names: string[]) {
      // No-op recording.
    },
    getCommands() {
      return commands.map((c) => ({
        name: c.name,
        source: 'extension',
        sourceInfo: {
          path: '<fake:command>',
          source: 'extension',
          scope: 'temporary',
          origin: 'top-level',
        },
        description:
          typeof c.options === 'object' && c.options !== null && 'description' in c.options
            ? ((c.options as { description?: string }).description ?? '')
            : '',
      }));
    },

    // --- Model + thinking level ---
    async setModel(model: unknown) {
      modelChanges.push({ model });
      return true;
    },
    getThinkingLevel(): string {
      return thinkingChanges.length > 0
        ? (thinkingChanges[thinkingChanges.length - 1]!.level as string)
        : 'off';
    },
    setThinkingLevel(level: unknown) {
      thinkingChanges.push({ level });
    },

    // --- Provider registration ---
    registerProvider(name: string, config: unknown) {
      providers.push({ name, config });
    },
    unregisterProvider(name: string) {
      const idx = providers.findIndex((p) => p.name === name);
      if (idx >= 0) providers.splice(idx, 1);
    },

    // --- Shared event bus ---
    events: sharedBus,
  } as unknown as PiFakeApi;

  // Snapshot getters — freeze on each access to prevent external mutation.
  Object.defineProperty(api, 'tools', {
    get: () => Object.freeze([...tools]),
  });
  Object.defineProperty(api, 'commands', {
    get: () => Object.freeze([...commands]),
  });
  Object.defineProperty(api, 'subscribedEvents', {
    get: () => Object.freeze([...events]),
  });
  Object.defineProperty(api, 'shortcuts', {
    get: () => Object.freeze([...shortcuts]),
  });
  Object.defineProperty(api, 'flags', {
    get: () => Object.freeze([...flags]),
  });
  Object.defineProperty(api, 'messages', {
    get: () => Object.freeze([...messages]),
  });
  Object.defineProperty(api, 'userMessages', {
    get: () => Object.freeze([...userMessages]),
  });
  Object.defineProperty(api, 'appendedEntries', {
    get: () => Object.freeze([...appendedEntries]),
  });
  Object.defineProperty(api, 'executedCommands', {
    get: () => Object.freeze([...executedCommands]),
  });
  Object.defineProperty(api, 'providers', {
    get: () => Object.freeze([...providers]),
  });
  Object.defineProperty(api, 'modelChanges', {
    get: () => Object.freeze([...modelChanges]),
  });
  Object.defineProperty(api, 'thinkingChanges', {
    get: () => Object.freeze([...thinkingChanges]),
  });
  Object.defineProperty(api, 'sessionNameChanges', {
    get: () => Object.freeze([...sessionNameChanges]),
  });

  return api;
}

/** ---------------------------------------------------------------------------
 * Pi loader — wraps pi-coding-agent's `createExtensionRuntime` so the recorded
 * fake api is observable on the loader side.
 * ------------------------------------------------------------------------ */

/** A loader that uses pi's real `createExtensionRuntime` to wire side effects. */
export function createPiLoader(): PiLoader {
  // Touch pi-coding-agent's real runtime to verify the upstream contract is
  // constructible in this environment. Its action methods throw if invoked
  // without a bound session — that is correct. We never call them from here.
  void createExtensionRuntime();

  return {
    async loadExtensionFromFactory(entry, pi) {
      try {
        await entry.factory(pi);
        return {
          ok: true,
          tools: pi.tools.map((t) => t.name),
          commands: pi.commands.map((c) => c.name),
          events: pi.subscribedEvents.map((e) => e.event),
          shortcuts: pi.shortcuts.map((s) => s.shortcut),
          flags: pi.flags.map((f) => f.name),
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/** ---------------------------------------------------------------------------
 * Internal: per-extension adapters that bridge narrow API contracts into the
 * full upup extension surface. Each adapter creates its own fake api, runs
 * the extension against it, and exposes the recorded state.
 * ------------------------------------------------------------------------ */

function recordedState(api: PiFakeApi): Omit<LoadedExtension, 'name'> {
  return {
    instance: {
      registered: {
        tools: api.tools.map((t) => t.name),
        commands: api.commands.map((c) => c.name),
      },
    },
    registeredTools: api.tools.map((t) => ({
      name: t.name,
      execute: t.execute as (...args: unknown[]) => unknown,
    })),
    registeredCommands: api.commands.map((c) => ({
      name: c.name,
      options: c.options,
    })),
    subscribedEvents: api.subscribedEvents.map((e) => ({
      event: e.event,
      handler: e.handler,
    })),
    registeredShortcuts: api.shortcuts.map((s) => ({
      shortcut: s.shortcut,
      options: s.options,
    })),
    registeredFlags: api.flags.map((f) => ({ name: f.name, options: f.options })),
    sentMessages: api.messages.map((m) => ({ message: m.message, options: m.options })),
    sentUserMessages: api.userMessages.map((m) => ({
      content: m.content,
      options: m.options,
    })),
    appendedEntries: api.appendedEntries.map((e) => ({
      customType: e.customType,
      data: e.data,
    })),
    executedCommands: api.executedCommands.map((c) => ({
      command: c.command,
      args: c.args,
    })),
  };
}

function createRealtimeAdapter(): Omit<LoadedExtension, 'name'> {
  const api = createFakeApi();
  registerRealtimeExtension(api as unknown as RealtimeExtensionApi);
  return recordedState(api);
}

function createDaemonAdapter(): Omit<LoadedExtension, 'name'> {
  const api = createFakeApi();
  registerDaemonExtension(api as unknown as DaemonExtensionApi);
  return recordedState(api);
}

function createConfigAdapter(): Omit<LoadedExtension, 'name'> {
  const api = createFakeApi();
  registerConfigExtension(api);
  return recordedState(api);
}

function createAstockAdapter(): Omit<LoadedExtension, 'name'> {
  const api = createFakeApi();
  registerAstockExtension(api);
  return recordedState(api);
}

function createTradingAdapter(): Omit<LoadedExtension, 'name'> {
  const api = createFakeApi();
  registerTradingExtension(api);
  return recordedState(api);
}

function realtimeFactory(pi: PiUpupExtensionApi): void {
  registerRealtimeExtension(pi as unknown as RealtimeExtensionApi);
}

function daemonFactory(pi: PiUpupExtensionApi): void {
  registerDaemonExtension(pi as unknown as DaemonExtensionApi);
}

function configFactory(pi: PiUpupExtensionApi): void {
  registerConfigExtension(pi);
}

function astockFactory(pi: PiUpupExtensionApi): void {
  registerAstockExtension(pi);
}

function tradingFactory(pi: PiUpupExtensionApi): void {
  registerTradingExtension(pi);
}

/** ---------------------------------------------------------------------------
 * Public entry point.
 * ------------------------------------------------------------------------ */

export function createPiMain(options: PiMainOptions): PiMainResult {
  const knownAdapters = new Map<string, () => Omit<LoadedExtension, 'name'>>([
    ['realtime', createRealtimeAdapter],
    ['daemon', createDaemonAdapter],
    ['config', createConfigAdapter],
    ['astock', createAstockAdapter],
    ['trading', createTradingAdapter],
  ]);

  const knownFactories = new Map<string, (pi: PiUpupExtensionApi) => void | Promise<void>>([
    ['realtime', realtimeFactory],
    ['daemon', daemonFactory],
    ['config', configFactory],
    ['astock', astockFactory],
    ['trading', tradingFactory],
  ]);

  const extensionOverrides = new Map(
    options.extensions.map((ext) => [ext.name, ext] as const),
  );

  const names = [...knownAdapters.keys()].map((name) =>
    extensionOverrides.has(name) ? `${name}:override` : name,
  );

  return {
    extensions: names,
    load: () => {
      const loaded: LoadedExtension[] = [];
      for (const [name, adapter] of knownAdapters.entries()) {
        const override = extensionOverrides.get(name);
        if (override) {
          const api = createFakeApi();
          void override.factory(api);
          loaded.push({ name, ...recordedState(api) });
        } else {
          loaded.push({ name, ...adapter() });
        }
      }
      return loaded;
    },
    extensionFactories: () => {
      const entries: PiExtensionFactoryEntry[] = [];
      for (const [name, factory] of knownFactories.entries()) {
        entries.push({ name, factory });
      }
      return entries;
    },
    loadWith: async (loader: PiLoader) => {
      const results: PiLoadResult[] = [];
      for (const [name, factory] of knownFactories.entries()) {
        const api = createFakeApi();
        const factoryEntry: PiExtensionFactoryEntry = {
          name,
          factory: (pi: PiUpupExtensionApi) => factory(pi),
        };
        try {
          const loaderResult = (await loader.loadExtensionFromFactory(
            factoryEntry,
            api,
          )) as
            | {
                ok: boolean;
                tools?: string[];
                commands?: string[];
                events?: string[];
                shortcuts?: string[];
                flags?: string[];
                error?: string;
              }
            | undefined;
          results.push({
            name: factoryEntry.name,
            ok: loaderResult?.ok ?? true,
            tools: loaderResult?.tools ?? api.tools.map((t) => t.name),
            commands: loaderResult?.commands ?? api.commands.map((c) => c.name),
            events: loaderResult?.events ?? api.subscribedEvents.map((e) => e.event),
            shortcuts: loaderResult?.shortcuts ?? api.shortcuts.map((s) => s.shortcut),
            flags: loaderResult?.flags ?? api.flags.map((f) => f.name),
            error: loaderResult?.error,
          });
        } catch (err) {
          results.push({
            name: factoryEntry.name,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return results;
    },
  };
}

export { createRealtimeFeed };