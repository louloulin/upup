import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {createPiCapabilityHostResolver, definePiCapabilityHost, resolvePiCapabilityHost} from '@upup/pi-capability-registry';
import { PI_MANAGEMENT_HOST_CONTRACT, PI_MANAGEMENT_PACKAGE_NAME, PI_MANAGEMENT_PACKAGE_VERSION, type PiManagementSnapshot } from '../src/index';

const emptyParameters = Type.Object({});
const providerParameters = Type.Object({ provider: Type.Optional(Type.Union([Type.Literal('yahoo'), Type.Literal('tushare')])) });

type ManagementHost = {
  readonly contract: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly string[];
  providers: { management?: { getManagementSnapshot?: () => PiManagementSnapshot } };
};

/**
 * A host is only usable when it carries the session-scoped
 * `getManagementSnapshot` provider. The extension's own metadata-only
 * self-publish (`providers: {}`) is deliberately rejected so it is never
 * memoized before the orchestrator publishes the real provider tree.
 */
function isUsableHost(host: ManagementHost | undefined): boolean {
  return Boolean(
    host
    && host.contract === PI_MANAGEMENT_HOST_CONTRACT
    && host.packageName === PI_MANAGEMENT_PACKAGE_NAME
    && host.packageVersion === PI_MANAGEMENT_PACKAGE_VERSION
    && host.sessionId
    && host.capabilities.includes('management-snapshot')
    && host.providers.management?.getManagementSnapshot,
  );
}

function getHost(events: { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void }): ManagementHost | undefined {
  const host = resolvePiCapabilityHost<ManagementHost>(events, PI_MANAGEMENT_PACKAGE_NAME, undefined);
  return isUsableHost(host) ? host : undefined;
}

function result(id: string, value: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    ...(isError ? { isError: true, details: undefined } : {}),
    details: { auditId: id, source: 'upup-pi://management', dataFreshness: 'live', evidence: [{ source: 'upup-pi://management/session', retrievedAt: new Date().toISOString() }] },
  };
}

function snapshotOrError(id: string, host: ManagementHost | undefined): { value?: PiManagementSnapshot; error?: ReturnType<typeof result> } {
  const snapshot = host?.providers.management?.getManagementSnapshot?.();
  return snapshot ? { value: snapshot } : { error: result(id, { error: 'management snapshot capability is unavailable', policy: 'fail-closed' }, true) };
}

export default function managementExtension(pi: ExtensionAPI): void {
  // Sprint D: self-publish the capability host so the extension is
  // self-contained (resolvable via `resolvePiCapabilityHost` without the
  // agent-session-factory side-channel). Session-level providers still flow
  // through the orchestrator's later publish — both publishers coexist and
  // last-write-wins. The host we publish here is metadata-only.
  definePiCapabilityHost(pi, {
    packageName: PI_MANAGEMENT_PACKAGE_NAME,
    packageVersion: PI_MANAGEMENT_PACKAGE_VERSION,
        capabilities: ['management-snapshot'],
        contract: PI_MANAGEMENT_HOST_CONTRACT,
    providers: {},
    register: () => undefined,
  });

  // Resolve per tool call: Pi loads extensions before the session publishes its
  // provider tree, so a load-time snapshot would fail closed for the whole
  // session (`management snapshot capability is unavailable`).
  const resolveHost = createPiCapabilityHostResolver<ManagementHost>(pi.events, PI_MANAGEMENT_PACKAGE_NAME, isUsableHost);
  pi.registerTool({ name: 'management_system_snapshot', label: 'System Snapshot', description: 'Read a redacted, read-only snapshot of the current Pi investment runtime.', parameters: emptyParameters, async execute(id, _params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, true); const output = snapshotOrError(id, resolveHost()); return output.error ?? result(id, output.value); } });
  pi.registerTool({ name: 'management_provider_status', label: 'Provider Status', description: 'Inspect configured market-data provider status and session metrics without secrets or raw responses.', parameters: providerParameters, async execute(id, params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, true); const output = snapshotOrError(id, resolveHost()); if (output.error) return output.error; const providers = output.value!.providers.marketData.providers.filter((provider) => !params.provider || provider.name === params.provider); return result(id, { providers, metrics: output.value!.providers.marketData.metrics, capturedAt: output.value!.capturedAt }); } });
  pi.registerTool({ name: 'management_package_status', label: 'Package Status', description: 'List enabled trusted Pi packages and their versions for the current session.', parameters: emptyParameters, async execute(id, _params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, true); const output = snapshotOrError(id, resolveHost()); return output.error ?? result(id, { packages: output.value!.packages, capturedAt: output.value!.capturedAt }); } });
  pi.registerTool({ name: 'management_runtime_status', label: 'Runtime Status', description: 'Read Pi runtime, permission summary, and tool counts for the current session.', parameters: emptyParameters, async execute(id, _params, signal) { if (signal?.aborted) return result(id, { error: 'request aborted' }, true); const output = snapshotOrError(id, resolveHost()); return output.error ?? result(id, { runtime: output.value!.runtime, permissions: output.value!.permissions, tools: output.value!.tools, sessionId: output.value!.sessionId, capturedAt: output.value!.capturedAt }); } });
}
