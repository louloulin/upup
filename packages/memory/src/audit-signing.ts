import { join } from 'node:path';
import {
  AuditChain as PiAuditChain,
  getDefaultAuditChain as getPiDefaultAuditChain,
  _resetDefaultAuditChain as resetPiDefaultAuditChain,
} from '@upup/pi-storage';
import type {
  AgentStep,
  AuditAction,
  AuditChainOptions,
  AuditInput,
  AuditKeyPair,
  AuditRecord,
  AuditVerifyResult,
} from '@upup/pi-storage';
import { globalUpupPath } from '@upup/utils';

const DEFAULT_FILENAME = 'audit-chain.jsonl';
const DEFAULT_KEY_FILENAME = 'audit-key.json';

export class AuditChain extends PiAuditChain {
  constructor(opts: AuditChainOptions = {}) {
    super({
      ...opts,
      filePath: opts.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME),
      keyPath: opts.keyPath ?? join(globalUpupPath(), DEFAULT_KEY_FILENAME),
      inMemory: opts.inMemory ?? false,
    });
  }

  append(input: AuditInput): AuditRecord {
    return super.append(input);
  }

  list(): AuditRecord[] {
    return super.list();
  }

  getByIntent(intentId: string): AuditRecord | undefined {
    return super.getByIntent(intentId);
  }

  verify(publicKey: string): AuditVerifyResult {
    return super.verify(publicKey);
  }

  getPublicKey(): string {
    return super.getPublicKey();
  }
}

export function getDefaultAuditChain(
  rotate = false,
  options: Omit<AuditChainOptions, 'rotate'> = {},
): AuditChain {
  return getPiDefaultAuditChain(rotate, {
    ...options,
    filePath: options.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME),
    keyPath: options.keyPath ?? join(globalUpupPath(), DEFAULT_KEY_FILENAME),
    inMemory: options.inMemory ?? false,
  }) as AuditChain;
}

export function _resetDefaultAuditChain(): void {
  resetPiDefaultAuditChain();
}

export type {
  AgentStep,
  AuditAction,
  AuditChainOptions,
  AuditInput,
  AuditKeyPair,
  AuditRecord,
  AuditVerifyResult,
};
