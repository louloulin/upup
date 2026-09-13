import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

export const PI_FINANCE_HOST_CONTRACT = 'upup.pi.finance.host.v1' as const;
export const PI_FINANCE_PACKAGE_NAME = '@upup/pi-finance-sdk' as const;
export const PI_FINANCE_PACKAGE_VERSION = '0.1.0' as const;
export const PI_FINANCE_HOST_CAPABILITIES = ['tool-definitions'] as const;

export type PiFinanceHostCapability = (typeof PI_FINANCE_HOST_CAPABILITIES)[number];

export interface PiFinanceHostRequest {
  readonly contract: typeof PI_FINANCE_HOST_CONTRACT;
  readonly packageName: typeof PI_FINANCE_PACKAGE_NAME;
  readonly packageVersion: typeof PI_FINANCE_PACKAGE_VERSION;
  readonly sessionId: string;
  readonly capability: PiFinanceHostCapability;
}

export interface PiFinanceHostBridge {
  readonly contract: typeof PI_FINANCE_HOST_CONTRACT;
  readonly packageName: typeof PI_FINANCE_PACKAGE_NAME;
  readonly packageVersion: typeof PI_FINANCE_PACKAGE_VERSION;
  readonly sessionId: string;
  readonly capabilities: readonly PiFinanceHostCapability[];
  getToolDefinitions(request: PiFinanceHostRequest): readonly ToolDefinition[];
}

export function createPiFinanceHostBridge(
  sessionId: string,
  getToolDefinitions: () => readonly ToolDefinition[],
): PiFinanceHostBridge {
  return {
    contract: PI_FINANCE_HOST_CONTRACT,
    packageName: PI_FINANCE_PACKAGE_NAME,
    packageVersion: PI_FINANCE_PACKAGE_VERSION,
    sessionId,
    capabilities: PI_FINANCE_HOST_CAPABILITIES,
    getToolDefinitions(request) {
      if (request.contract !== PI_FINANCE_HOST_CONTRACT) return [];
      if (request.packageName !== PI_FINANCE_PACKAGE_NAME) return [];
      if (request.packageVersion !== PI_FINANCE_PACKAGE_VERSION) return [];
      if (request.sessionId !== sessionId) return [];
      if (request.capability !== 'tool-definitions') return [];
      return getToolDefinitions();
    },
  };
}
