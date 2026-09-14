import { join } from 'node:path';
import {
  StrategyStore as PiStrategyStore,
  computeStrategyPrevHash,
  hashStrategyFingerprint,
} from '@upup/pi-storage';
import type {
  StrategyDependency,
  StrategyRecord,
  StrategyRecordInput,
  StrategyStoreOptions,
} from '@upup/pi-storage';
import { globalUpupPath } from '@upup/utils';

const DEFAULT_FILE = 'strategies.jsonl';
const DEFAULT_KEY = 'strategy-key.json';

export class StrategyStore extends PiStrategyStore {
  constructor(opts: StrategyStoreOptions = {}) {
    super({
      ...opts,
      filePath: opts.filePath ?? globalUpupPath(DEFAULT_FILE),
      keyPath: opts.keyPath ?? globalUpupPath(DEFAULT_KEY),
      inMemory: opts.inMemory ?? false,
    });
  }
}

export {
  computeStrategyPrevHash,
  hashStrategyFingerprint,
};

export type {
  StrategyDependency,
  StrategyRecord,
  StrategyRecordInput,
  StrategyStoreOptions,
};
