/**
 * Portfolio Repository — pure data layer
 *
 * High-cohesion design: this module owns position data and nothing else.
 * No tushare calls, no LangChain, no formatting. Other modules (service,
 * tracker tool) inject a `PortfolioRepository` instead of reaching into a
 * hidden module-level singleton.
 *
 * v7-2 refactor: split from the old `tracker.ts` so the data layer can be
 * unit-tested in isolation and swapped for a file-backed / multi-portfolio
 * repository without touching the tool wrapper.
 */

export interface Position {
  id: string;
  code: string;
  name?: string;
  quantity: number;
  entry_price: number;
  entry_date: string;
  // Enriched fields populated by PortfolioService.listWithPnl
  current_price?: number;
  pnl?: number;
  pnl_pct?: number;
}

/**
 * Repository contract. Implementations decide persistence (in-memory,
 * file-backed, multi-portfolio map, etc.).
 */
export interface PortfolioRepository {
  add(position: Position): void;
  remove(positionId: string): boolean;
  list(): Position[];
  get(positionId: string): Position | undefined;
  size(): number;
  clear(): void;
}

/**
 * Default in-memory repository. Module-level singleton kept for backward
 * compatibility with the original `tracker.ts` behavior. New code should
 * instantiate via `new InMemoryPortfolioRepository()`.
 */
export class InMemoryPortfolioRepository implements PortfolioRepository {
  private readonly store = new Map<string, Position>();
  private counter = 1;

  add(position: Position): void {
    this.store.set(position.id, position);
  }

  remove(positionId: string): boolean {
    return this.store.delete(positionId);
  }

  list(): Position[] {
    return Array.from(this.store.values());
  }

  get(positionId: string): Position | undefined {
    return this.store.get(positionId);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
    this.counter = 1;
  }

  /** Generate a unique position id (POS + ms + counter). */
  nextId(): string {
    return `POS${Date.now()}${this.counter++}`;
  }
}

// ---------------------------------------------------------------------------
// Default singleton accessor
// ---------------------------------------------------------------------------
// Kept as the default for the LangChain tool wrapper. Tests should construct
// their own repository to avoid global state pollution.

let defaultRepo: InMemoryPortfolioRepository | null = null;

export function getDefaultPortfolioRepository(): InMemoryPortfolioRepository {
  if (!defaultRepo) defaultRepo = new InMemoryPortfolioRepository();
  return defaultRepo;
}

export function __resetDefaultPortfolioRepository(): void {
  defaultRepo = null;
}
