import { Type, type TSchema } from 'typebox';
import { createHash } from 'node:crypto';
import type {
  ExtensionAPI,
  InlineExtension,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { AgentTool, LoadedPlugin } from '../../plugins/types.js';
import type { UpUpAgentSpec, UpUpCreateSessionOptions, UpUpToolPolicyAudit, UpUpToolSafetyLevel } from '@upup/pi-runtime';
import { getPluginRegistry } from '../../plugins/registry.js';

export interface PiPluginBinding {
  plugin: LoadedPlugin;
  /** Absolute plugin directory used by the trust policy and audit log. */
  path: string;
  spec?: UpUpAgentSpec;
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'];
}

function pluginSchema(tool: AgentTool): TSchema {
  return (tool.schema ?? Type.Object({})) as TSchema;
}

function pluginSafetyLevel(tool: AgentTool): UpUpToolSafetyLevel {
  return tool.safetyLevel ?? 'warning';
}

function expectedSandbox(runtime: LoadedPlugin['runtime']): 'process' | 'wasm' | 'mcp' {
  if (runtime === 'wasm') return 'wasm';
  if (runtime === 'mcp') return 'mcp';
  return 'process';
}

/** Enforce the manifest/runtime boundary before a plugin tool reaches Pi. */
export function validatePluginSandbox(plugin: LoadedPlugin, tool: AgentTool): void {
  const declaredSandbox = plugin.manifest.security?.sandbox;
  const requiredSandbox = expectedSandbox(plugin.runtime);
  const safetyLevel = pluginSafetyLevel(tool);
  const sensitive = safetyLevel === 'dangerous' || safetyLevel === 'critical' || tool.hasFinancialImpact === true;
  const missingOrNone = declaredSandbox === undefined || declaredSandbox === 'none';

  if (declaredSandbox && declaredSandbox !== requiredSandbox) {
    throw new Error(
      `Plugin ${plugin.id} declares sandbox ${declaredSandbox}, but runtime ${plugin.runtime} requires ${requiredSandbox}`,
    );
  }
  if (sensitive && missingOrNone) {
    throw new Error(`Sensitive plugin tool ${plugin.id}:${tool.name} requires an explicit ${requiredSandbox} sandbox declaration`);
  }
  if (sensitive && (plugin.runtime === 'bun' || plugin.runtime === 'jiti')) {
    throw new Error(`Sensitive plugin tool ${plugin.id}:${tool.name} cannot run in-process; use wasm or mcp isolation`);
  }
  if (sensitive && (!plugin.manifest.security || !Array.isArray(plugin.manifest.security.networkDomains) || !Array.isArray(plugin.manifest.security.credentialScopes))) {
    throw new Error(`Sensitive plugin tool ${plugin.id}:${tool.name} requires explicit networkDomains and credentialScopes declarations`);
  }
}

const SENSITIVE_KEYS = new Set(['api_key', 'apikey', 'authorization', 'credential', 'password', 'secret', 'token', 'access_token', 'refresh_token']);

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return '[REDACTED]';
  if (key?.toLowerCase() === 'sourceurls' && Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? item.replace(/[?#].*$/, '') : sanitize(item));
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
}

function sourceUrl(value: unknown, pluginId: string, toolName: string): string {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const urls = record?.sourceUrls;
  if (Array.isArray(urls)) {
    const first = urls.find((item): item is string => typeof item === 'string' && item.length > 0);
    if (first) return first.replace(/[?#].*$/, '');
  }
  return `upup-plugin://${pluginId}/${toolName}`;
}

function pluginTool(
  spec: UpUpAgentSpec,
  plugin: LoadedPlugin,
  tool: AgentTool,
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): ToolDefinition {
  const safetyLevel = pluginSafetyLevel(tool);
  const security = plugin.manifest.security;
  const securityAudit = {
    sandbox: security?.sandbox ?? 'none',
    networkDomains: [...(security?.networkDomains ?? [])],
    credentialScopes: [...(security?.credentialScopes ?? [])],
  } as const;
  return {
    name: tool.name,
    label: `${plugin.manifest.id}:${tool.name}`,
    description: tool.description ?? `Plugin tool ${tool.name}`,
    promptSnippet: tool.description ?? `Plugin tool ${tool.name}`,
    parameters: pluginSchema(tool),
    executionMode: 'sequential',
    async execute(toolCallId, params, signal) {
      const auditId = `${plugin.manifest.id}:${toolCallId}`;
      const audit = (decision: UpUpToolPolicyAudit['decision'], reason: string) => ({
        auditId,
        tool: tool.name,
        safetyLevel,
        permissionProfile: spec.permissions.id,
        decision,
        reason,
        recordedAt: new Date().toISOString(),
      } satisfies UpUpToolPolicyAudit);
      const allowed = !spec.permissions.deny.includes(safetyLevel) && spec.permissions.allow.includes(safetyLevel);
      if (!allowed) {
        return {
          content: [{ type: 'text', text: `Plugin tool ${tool.name} is denied by permission profile ${spec.permissions.id}` }],
          isError: true,
          details: { pluginId: plugin.manifest.id, securityAudit, audit: audit('denied', 'plugin tool safety level is not allowed') },
        };
      }
      if (spec.permissions.requireApproval.includes(safetyLevel)) {
        const approved = requestToolApproval
          ? await requestToolApproval({ tool: tool.name, input: params, safetyLevel, auditId, permissionProfile: spec.permissions.id })
          : false;
        if (!approved) {
          return {
            content: [{ type: 'text', text: `Plugin tool ${tool.name} requires explicit approval` }],
            isError: true,
            details: { pluginId: plugin.manifest.id, securityAudit, audit: audit('approval_denied', 'approval was not granted') },
          };
        }
      }
      if (signal?.aborted) {
        return { content: [{ type: 'text', text: 'Plugin tool execution aborted' }], isError: true, details: { securityAudit, audit: audit('denied', 'aborted before execution') } };
      }
      try {
        const value = await tool.execute(params as Record<string, unknown>);
        const sanitized = sanitize(typeof value === 'string' ? (() => {
          try { return JSON.parse(value); } catch { return value; }
        })() : value);
        const text = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);
        const retrievedAt = new Date().toISOString();
        const evidence = {
          id: `${auditId}:evidence:0`,
          source: sourceUrl(sanitized, plugin.manifest.id, tool.name),
          retrievedAt,
          query: tool.name,
          dataHash: createHash('sha256').update(JSON.stringify(sanitized)).digest('hex'),
          confidence: 'medium' as const,
        };
        return {
          content: [{ type: 'text', text: text ?? '' }],
          details: {
            pluginId: plugin.manifest.id,
            pluginVersion: plugin.manifest.version,
            runtime: plugin.runtime,
            securityAudit,
            evidence: [evidence],
            dataFreshness: 'live',
            auditId,
            audit: audit('allowed', 'plugin tool allowed by Pi permission profile'),
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
          details: { pluginId: plugin.manifest.id, pluginVersion: plugin.manifest.version, runtime: plugin.runtime, securityAudit, audit: audit('allowed', 'plugin tool failed after policy approval') },
        };
      }
    },
  };
}

function skillPrompt(plugin: LoadedPlugin): string | undefined {
  const skills = plugin.manifest.skills;
  if (!skills?.length) return undefined;
  return skills
    .map((skill) => `### Plugin skill: ${skill.name}\n${skill.description}\n\n${skill.instructions}`)
    .join('\n\n');
}

/** Convert one already-loaded, trusted UpUp plugin into a Pi inline extension. */
export function createPiPluginExtension(binding: PiPluginBinding): InlineExtension {
  const { plugin } = binding;
  return {
    name: `upup-plugin-${plugin.manifest.id}`,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      if (!binding.spec) throw new Error(`Pi plugin ${plugin.manifest.id} requires an agent spec`);
      for (const tool of plugin.tools) {
        validatePluginSandbox(plugin, tool);
        pi.registerTool(pluginTool(binding.spec, plugin, tool, binding.requestToolApproval));
      }

      const instructions = skillPrompt(plugin);
      if (instructions) {
        pi.on('before_agent_start', async () => ({
          systemPrompt: `Trusted investment plugin skills from ${plugin.manifest.id}:\n${instructions}`,
        }));
      }

      // UpUp hooks are intentionally bridged only for events with a compatible
      // payload. The policy layer remains authoritative and can deny a tool call.
      const on = pi.on as unknown as (event: string, handler: (event: unknown) => Promise<unknown>) => void;
      for (const [event, handlers] of plugin.hooks) {
        on(event, async (payload) => {
          for (const handler of handlers) await handler({ event, data: payload });
          return undefined;
        });
      }
    },
  };
}

export function createPiPluginExtensions(bindings: readonly PiPluginBinding[]): InlineExtension[] {
  for (const binding of bindings) {
    for (const tool of binding.plugin.tools) validatePluginSandbox(binding.plugin, tool);
  }
  return bindings.map(createPiPluginExtension);
}

/** Build Pi bindings from enabled, already-loaded UpUp plugins. */
export function getLoadedPiPluginBindings(
  spec: UpUpAgentSpec,
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): PiPluginBinding[] {
  return getPluginRegistry().getEnabled().map((plugin) => ({
    plugin,
    path: plugin.path ?? process.cwd(),
    spec,
    requestToolApproval,
  }));
}
