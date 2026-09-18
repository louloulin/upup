/**
 * Tiny JSON-file state store for the web overlay.
 *
 * Atomic write via tmp + rename. Used by /api/upup/state so the sidecar
 * can remember last-selected ticker / SOP / plan between reloads.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface InvestmentState {
  readonly ticker?: string;
  readonly sop?: string;
  readonly planId?: string;
  readonly note?: string;
  readonly updatedAt: string;
}

export class InvestmentStateStore {
  private readonly file: string;
  private cache: InvestmentState | undefined;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'investment-state.json');
  }

  read(): InvestmentState {
    if (this.cache) return this.cache;
    if (!existsSync(this.file)) {
      this.cache = { updatedAt: new Date(0).toISOString() };
      return this.cache;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<InvestmentState>;
      this.cache = {
        ...(typeof parsed.ticker === 'string' ? { ticker: parsed.ticker } : {}),
        ...(typeof parsed.sop === 'string' ? { sop: parsed.sop } : {}),
        ...(typeof parsed.planId === 'string' ? { planId: parsed.planId } : {}),
        ...(typeof parsed.note === 'string' ? { note: parsed.note } : {}),
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
      return this.cache;
    } catch {
      this.cache = { updatedAt: new Date().toISOString() };
      return this.cache;
    }
  }

  patch(patch: Record<string, unknown>): InvestmentState {
    const next: InvestmentState = {
      ...(typeof patch.ticker === 'string' ? { ticker: patch.ticker } : {}),
      ...(typeof patch.sop === 'string' ? { sop: patch.sop } : {}),
      ...(typeof patch.planId === 'string' ? { planId: patch.planId } : {}),
      ...(typeof patch.note === 'string' ? { note: patch.note } : {}),
      updatedAt: new Date().toISOString(),
    };
    const merged: InvestmentState = { ...this.read(), ...next };
    this.cache = merged;
    const tmp = `${this.file}.tmp`;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(merged, null, 2));
    renameSync(tmp, this.file);
    return merged;
  }
}

export function getInvestmentState(opts: { dataDir: string }): InvestmentState {
  return new InvestmentStateStore(opts.dataDir).read();
}

export function patchInvestmentState(
  opts: { dataDir: string },
  patch: Record<string, unknown>,
): InvestmentState {
  return new InvestmentStateStore(opts.dataDir).patch(patch);
}
