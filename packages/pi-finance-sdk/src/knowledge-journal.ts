export interface NativeTrackedCompany {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly industry: string;
  readonly marketCap?: number;
  readonly summary: string;
  readonly keyMetrics: Readonly<Record<string, number>>;
  readonly competitiveAdvantages: readonly string[];
  readonly risks: readonly string[];
  readonly updatedAt: string;
}

export interface NativeTrackedSector {
  readonly name: string;
  readonly description: string;
  readonly trends: readonly string[];
  readonly keyMetrics: Readonly<Record<string, number>>;
  readonly outlook: 'bullish' | 'bearish' | 'neutral';
  readonly updatedAt: string;
}

export interface NativeKnowledgeJournalState {
  readonly schema: 1;
  readonly companies: Readonly<Record<string, NativeTrackedCompany>>;
  readonly sectors: Readonly<Record<string, NativeTrackedSector>>;
  readonly lastUpdated?: string;
}

export interface NativeTrackedCompanyInput {
  readonly ticker: string;
  readonly name: string;
  readonly sector: string;
  readonly industry: string;
  readonly marketCap?: number;
  readonly summary: string;
  readonly keyMetrics?: Readonly<Record<string, number>>;
  readonly competitiveAdvantages?: readonly string[];
  readonly risks?: readonly string[];
}

export interface NativeTrackedSectorInput {
  readonly name: string;
  readonly description: string;
  readonly trends: readonly string[];
  readonly keyMetrics?: Readonly<Record<string, number>>;
  readonly outlook: NativeTrackedSector['outlook'];
}

export function createInitialKnowledgeJournalState(): NativeKnowledgeJournalState {
  return { schema: 1, companies: {}, sectors: {} };
}

function text(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${field} must contain 1-${maxLength} characters`);
  return normalized;
}

function list(values: readonly string[] | undefined, field: string, maxItems: number, maxLength: number): readonly string[] {
  if (!values) return [];
  if (values.length > maxItems) throw new Error(`${field} must contain at most ${maxItems} items`);
  return values.map((value) => text(value, field, maxLength));
}

function metrics(values: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const normalizedKey = text(key, 'metric name', 80);
    if (!Number.isFinite(value)) throw new Error(`metric ${normalizedKey} must be finite`);
    result[normalizedKey] = Number(value);
  }
  return result;
}

function ticker(value: string): string {
  const normalized = text(value, 'ticker', 20).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(normalized)) throw new Error('ticker must be a valid symbol');
  return normalized;
}

function cloneCompany(company: NativeTrackedCompany): NativeTrackedCompany {
  return { ...company, keyMetrics: { ...company.keyMetrics }, competitiveAdvantages: [...company.competitiveAdvantages], risks: [...company.risks] };
}

function cloneSector(sector: NativeTrackedSector): NativeTrackedSector {
  return { ...sector, keyMetrics: { ...sector.keyMetrics }, trends: [...sector.trends] };
}

export function trackNativeCompany(state: NativeKnowledgeJournalState, input: NativeTrackedCompanyInput, updatedAt: string): { readonly state: NativeKnowledgeJournalState; readonly company: NativeTrackedCompany } {
  const normalizedTicker = ticker(input.ticker);
  const company: NativeTrackedCompany = {
    ticker: normalizedTicker,
    name: text(input.name, 'name', 160),
    sector: text(input.sector, 'sector', 80),
    industry: text(input.industry, 'industry', 120),
    ...(input.marketCap === undefined ? {} : Number.isFinite(input.marketCap) && input.marketCap >= 0 ? { marketCap: input.marketCap } : (() => { throw new Error('marketCap must be a finite non-negative number'); })()),
    summary: text(input.summary, 'summary', 4000),
    keyMetrics: metrics(input.keyMetrics),
    competitiveAdvantages: list(input.competitiveAdvantages, 'competitiveAdvantages', 20, 240),
    risks: list(input.risks, 'risks', 20, 240),
    updatedAt,
  };
  return { state: { schema: 1, companies: { ...state.companies, [normalizedTicker]: company }, sectors: state.sectors, lastUpdated: updatedAt }, company: cloneCompany(company) };
}

export function trackNativeSector(state: NativeKnowledgeJournalState, input: NativeTrackedSectorInput, updatedAt: string): { readonly state: NativeKnowledgeJournalState; readonly sector: NativeTrackedSector } {
  const normalizedName = text(input.name, 'name', 120);
  const sector: NativeTrackedSector = {
    name: normalizedName,
    description: text(input.description, 'description', 4000),
    trends: list(input.trends, 'trends', 20, 240),
    keyMetrics: metrics(input.keyMetrics),
    outlook: input.outlook,
    updatedAt,
  };
  const key = normalizedName.toLocaleLowerCase();
  return { state: { schema: 1, companies: state.companies, sectors: { ...state.sectors, [key]: sector }, lastUpdated: updatedAt }, sector: cloneSector(sector) };
}

export function listTrackedCompanies(state: NativeKnowledgeJournalState): readonly NativeTrackedCompany[] {
  return Object.values(state.companies).sort((left, right) => left.ticker.localeCompare(right.ticker)).map(cloneCompany);
}

export function listTrackedSectors(state: NativeKnowledgeJournalState): readonly NativeTrackedSector[] {
  return Object.values(state.sectors).sort((left, right) => left.name.localeCompare(right.name)).map(cloneSector);
}

export function getTrackedCompany(state: NativeKnowledgeJournalState, value: string): NativeTrackedCompany | undefined {
  const company = state.companies[value.trim().toUpperCase()];
  return company ? cloneCompany(company) : undefined;
}
