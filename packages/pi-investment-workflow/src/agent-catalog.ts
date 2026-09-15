import { validateAgentSpec } from './agent-spec';
import type { UpUpAgentSpec } from '@upup/pi-runtime';

export interface PiAgentCatalogRecord {
  readonly spec: UpUpAgentSpec;
  readonly isBuiltIn: boolean;
  readonly createdAt: number;
  readonly source?: string;
}

export class PiAgentCatalog {
  private readonly records = new Map<string, PiAgentCatalogRecord>();
  private defaultAgentId: string;

  constructor(defaultAgentId: string) {
    this.defaultAgentId = defaultAgentId;
  }

  register(spec: UpUpAgentSpec, options: { isBuiltIn?: boolean; source?: string } = {}): void {
    validateAgentSpec(spec);
    this.records.set(spec.id, {
      spec,
      isBuiltIn: options.isBuiltIn ?? false,
      createdAt: Date.now(),
      ...(options.source ? { source: options.source } : {}),
    });
  }

  unregister(id: string, force = false): boolean {
    const record = this.records.get(id);
    if (record?.isBuiltIn && !force) return false;
    return this.records.delete(id);
  }

  get(id: string): PiAgentCatalogRecord | undefined {
    return this.records.get(id);
  }

  getAll(): PiAgentCatalogRecord[] {
    return Array.from(this.records.values());
  }

  getByCapability(capability: string): PiAgentCatalogRecord[] {
    return this.getAll().filter(({ spec }) => spec.capabilities.includes(capability));
  }

  getByTaskType(taskType: string): PiAgentCatalogRecord[] {
    const normalized = taskType.toLowerCase();
    return this.getAll().filter(({ spec }) => spec.taskTypes.some((task) => normalized.includes(task.toLowerCase())));
  }

  select(taskDescription: string): PiAgentCatalogRecord {
    const byTask = this.getByTaskType(taskDescription);
    if (byTask.length > 0) return byTask[0];

    const keywords: Record<string, string> = {
      research: 'research', financial: 'research', analysis: 'analysis',
      implement: 'coding', code: 'coding', build: 'coding', create: 'coding',
      debug: 'debugging', fix: 'debugging', error: 'debugging',
      test: 'testing', verify: 'testing', review: 'review', check: 'review',
      docs: 'documentation', document: 'documentation', readme: 'documentation',
    };
    const normalized = taskDescription.toLowerCase();
    for (const [keyword, capability] of Object.entries(keywords)) {
      if (normalized.includes(keyword)) {
        const matches = this.getByCapability(capability);
        if (matches.length > 0) return matches[0];
      }
    }

    const fallback = this.records.get(this.defaultAgentId) ?? this.getAll()[0];
    if (!fallback) throw new Error('Pi agent catalog is empty');
    return fallback;
  }

  setDefault(id: string): void {
    if (!this.records.has(id)) throw new Error(`Pi agent ${id} is not registered`);
    this.defaultAgentId = id;
  }

  getDefault(): PiAgentCatalogRecord {
    const record = this.records.get(this.defaultAgentId) ?? this.getAll()[0];
    if (!record) throw new Error('Pi agent catalog is empty');
    return record;
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  get count(): number {
    return this.records.size;
  }
}

export function createPiAgentCatalog(specs: readonly UpUpAgentSpec[], defaultAgentId = specs[0]?.id ?? ''): PiAgentCatalog {
  const catalog = new PiAgentCatalog(defaultAgentId);
  for (const spec of specs) catalog.register(spec, { isBuiltIn: true, source: 'pi' });
  return catalog;
}
