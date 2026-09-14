import type { UpUpAgentSession } from '../runtime/pi/types.js';
import { PiAgentSessionFactory } from '../runtime/pi/agent-session-factory.js';
import { getBuiltinPiPackageOptions } from '../runtime/pi/package-config.js';
import type { PiManagementSnapshot } from '@upup/pi-session';
import { globalUpupPath } from '../utils/storage-paths.js';
import { JsonFileMarketQuoteTrendStore } from '@upup/pi-market-data';

const MANAGEMENT_TOOLS = [
  'management_system_snapshot',
  'management_provider_status',
  'management_package_status',
  'management_runtime_status',
] as const;

export interface ManagementSnapshotProvider {
  snapshot(): Promise<PiManagementSnapshot>;
  close(): void;
}

export interface CreateManagementSnapshotProviderOptions {
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly marketQuoteTrendStore?: import('@upup/pi-market-data').NativeMarketQuoteTrendStore;
}

function readToolText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) return '';
  return result.content
    .filter((part): part is { readonly type: 'text'; readonly text: string } => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function createManagementSpec() {
  return {
    id: 'upup-management-dashboard',
    version: '1.0.0',
    name: 'UpUp Pi Management Dashboard',
    description: 'Read-only management dashboard backed by the Pi runtime.',
    tools: '*' as const,
    mode: 'primary' as const,
    capabilities: ['management', 'observability'],
    taskTypes: ['management'],
    permissions: {
      id: 'upup-management-readonly',
      allow: ['safe', 'warning'] as const,
      requireApproval: [] as const,
      deny: ['dangerous', 'critical'] as const,
      allowExternalNetwork: false,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
    thinkingLevel: 'minimal' as const,
    dataPolicy: 'live' as const,
    outputContract: 'json' as const,
  };
}

export async function createManagementSnapshotProvider(
  options: CreateManagementSnapshotProviderOptions = {},
): Promise<ManagementSnapshotProvider> {
  const cwd = options.cwd ?? process.cwd();
  const trendStore = options.marketQuoteTrendStore ?? new JsonFileMarketQuoteTrendStore(globalUpupPath('metrics', 'market-provider-trend.json'));
  const configured = getBuiltinPiPackageOptions(cwd);
  if (!configured) throw new Error('Pi built-in packages are unavailable; management dashboard is fail-closed');
  let session: UpUpAgentSession;
  try {
    session = await new PiAgentSessionFactory().createSession(createManagementSpec(), {
      cwd,
      sessionId: options.sessionId ?? 'upup-management-dashboard',
      piPackagePaths: configured.piPackagePaths,
      piPackageTrust: configured.piPackageTrust,
      marketQuoteTrendStore: trendStore,
    });
  } catch (error) { throw error; }
  return {
    async snapshot(): Promise<PiManagementSnapshot> {
      const result = await session.executeTool('management_system_snapshot', `management-dashboard-${Date.now()}`, {});
      if ('isError' in result && result.isError) throw new Error(readToolText(result) || 'management snapshot tool failed');
      const text = readToolText(result);
      if (!text) throw new Error('management snapshot tool returned no data');
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !('schema' in parsed) || parsed.schema !== 1) throw new Error('management snapshot schema is invalid');
      return parsed as PiManagementSnapshot;
    },
    close(): void {
      session.dispose();
    },
  };
}

export { MANAGEMENT_TOOLS };
