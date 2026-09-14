import { join } from 'node:path';
import {
  DossierStore as PiDossierStore,
  canonicalJson,
  dossierPostPhase,
  dossierPrePhase,
  hashDossier,
} from '@upup/pi-storage';
import type {
  CompanySnapshot,
  Dossier,
  DossierOptions,
  DossierPostPhaseInput,
  DossierPrePhaseContext,
  EarningsCallNote,
  MetricSample,
  Thesis,
  WatchTrigger,
} from '@upup/pi-storage';
import { globalUpupPath } from '../utils/storage-paths.js';

const DEFAULT_FILENAME = 'dossiers.jsonl';

export class DossierStore extends PiDossierStore {
  constructor(opts: DossierOptions = {}) {
    super({
      ...opts,
      filePath: opts.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME),
      inMemory: opts.inMemory ?? false,
    });
  }
}

export {
  canonicalJson,
  dossierPostPhase,
  dossierPrePhase,
  hashDossier,
};

export type {
  CompanySnapshot,
  Dossier,
  DossierOptions,
  DossierPostPhaseInput,
  DossierPrePhaseContext,
  EarningsCallNote,
  MetricSample,
  Thesis,
  WatchTrigger,
};
