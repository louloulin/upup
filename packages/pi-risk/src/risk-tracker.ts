export type RiskType = 'market' | 'company' | 'sector' | 'portfolio';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskRecord {
  readonly id: string;
  readonly ticker?: string;
  readonly type: RiskType;
  readonly severity: RiskSeverity;
  readonly title: string;
  readonly description: string;
  readonly probability: number;
  readonly impact: number;
  readonly mitigation?: string;
}

export interface RiskTracker {
  add(input: Omit<RiskRecord, 'id'>): RiskRecord;
  list(): readonly RiskRecord[];
}

function cleanText(value: string, field: string, maxLength: number): string {
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) throw new Error(`${field} must contain 1-${maxLength} characters`);
  return text;
}

function cleanProbability(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${field} must be between 0 and 1`);
  return Number(value.toFixed(6));
}

export function createRiskTracker(): RiskTracker {
  const records: RiskRecord[] = [];
  return {
    add(input) {
      const ticker = input.ticker?.trim().toUpperCase();
      if (ticker && !/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(ticker)) throw new Error('ticker must be a valid symbol');
      const record: RiskRecord = {
        id: `risk-${records.length + 1}`,
        ...(ticker ? { ticker } : {}),
        type: input.type,
        severity: input.severity,
        title: cleanText(input.title, 'title', 160),
        description: cleanText(input.description, 'description', 4000),
        probability: cleanProbability(input.probability, 'probability'),
        impact: cleanProbability(input.impact, 'impact'),
        ...(input.mitigation?.trim() ? { mitigation: cleanText(input.mitigation, 'mitigation', 2000) } : {}),
      };
      records.push(record);
      return record;
    },
    list() {
      return records.map((record) => ({ ...record }));
    },
  };
}
