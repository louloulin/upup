export type NativeRiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type NativeRiskType = 'market' | 'company' | 'sector' | 'portfolio';
export type NativeSectorOutlook = 'bullish' | 'bearish' | 'neutral';

export interface NativeCompanyProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  marketCapBillion: number;
  summary: string;
  keyMetrics: Readonly<Record<string, number>>;
  competitiveAdvantages: readonly string[];
  risks: readonly string[];
  asOf: '2026-09-12';
}

export interface NativeRiskAssessment {
  id: string;
  ticker?: string;
  type: NativeRiskType;
  severity: NativeRiskSeverity;
  title: string;
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
  asOf: '2026-09-12';
}

export interface NativeSectorAnalysis {
  name: string;
  description: string;
  trends: readonly string[];
  keyMetrics: Readonly<Record<string, number>>;
  outlook: NativeSectorOutlook;
  asOf: '2026-09-12';
}

const AS_OF = '2026-09-12' as const;

const COMPANIES: readonly NativeCompanyProfile[] = [
  {
    ticker: '600519.SH', name: '贵州茅台', sector: '消费', industry: '白酒', marketCapBillion: 1800,
    summary: '高端白酒品牌与渠道运营商，收入结构以核心产品和直营/经销渠道为主。',
    keyMetrics: { pe: 25.4, roe: 28.4, grossMargin: 91.2, revenueGrowth: 2.5 },
    competitiveAdvantages: ['品牌力', '渠道控制力', '现金流质量'],
    risks: ['高端消费需求波动', '渠道库存变化', '估值回撤'], asOf: AS_OF,
  },
  {
    ticker: '002594.SZ', name: '比亚迪', sector: '新能源', industry: '新能源汽车', marketCapBillion: 950,
    summary: '覆盖新能源汽车、动力电池和电子业务的综合制造企业。',
    keyMetrics: { pe: 22.1, roe: 18.6, grossMargin: 21.8, revenueGrowth: 4.5 },
    competitiveAdvantages: ['垂直整合', '规模制造', '电池技术积累'],
    risks: ['行业价格竞争', '海外市场合规', '原材料价格波动'], asOf: AS_OF,
  },
  {
    ticker: 'AAPL', name: 'Apple', sector: 'Technology', industry: 'Consumer Electronics', marketCapBillion: 3500,
    summary: '以硬件、软件和服务生态为核心的全球消费科技公司。',
    keyMetrics: { pe: 34.2, roe: 148.0, grossMargin: 46.8, revenueGrowth: 3.1 },
    competitiveAdvantages: ['生态黏性', '品牌与定价能力', '服务收入'],
    risks: ['供应链集中', '监管与反垄断', '产品周期波动'], asOf: AS_OF,
  },
];

const SECTORS: readonly NativeSectorAnalysis[] = [
  { name: '新能源', description: '新能源汽车、动力电池及相关设备产业链。', trends: ['渗透率提升', '行业竞争加剧', '海外产能布局'], keyMetrics: { penetration: 0.38, revenueGrowth: 0.045, grossMargin: 21.8 }, outlook: 'neutral', asOf: AS_OF },
  { name: '消费', description: '食品饮料、品牌消费和可选消费相关行业。', trends: ['高端化分化', '渠道数字化', '需求温和复苏'], keyMetrics: { revenueGrowth: 0.025, grossMargin: 91.2, inventoryDays: 42 }, outlook: 'neutral', asOf: AS_OF },
  { name: 'Technology', description: '软件、硬件、半导体和互联网科技行业。', trends: ['AI 投入增加', '云服务增长', '监管持续演进'], keyMetrics: { revenueGrowth: 0.031, grossMargin: 46.8, rdIntensity: 0.08 }, outlook: 'bullish', asOf: AS_OF },
];

const RISKS: readonly NativeRiskAssessment[] = [
  { id: 'risk-600519-valuation', ticker: '600519.SH', type: 'company', severity: 'medium', title: '估值回撤风险', description: '估值处于历史较高区间时，盈利预期变化可能放大价格波动。', probability: 0.45, impact: 0.55, mitigation: '跟踪盈利兑现与估值区间，避免单一估值指标决策。', asOf: AS_OF },
  { id: 'risk-002594-competition', ticker: '002594.SZ', type: 'sector', severity: 'high', title: '行业价格竞争', description: '新能源汽车行业竞争可能压缩单车利润和现金流。', probability: 0.62, impact: 0.68, mitigation: '跟踪销量、单车毛利、库存和经营现金流变化。', asOf: AS_OF },
  { id: 'risk-market-rate', type: 'market', severity: 'medium', title: '利率与风险偏好', description: '利率和市场风险偏好变化会影响成长股估值中枢。', probability: 0.5, impact: 0.5, mitigation: '采用情景分析并控制组合集中度。', asOf: AS_OF },
];

const NAME_TO_TICKER: Readonly<Record<string, string>> = { 贵州茅台: '600519.SH', 比亚迪: '002594.SZ', Apple: 'AAPL', 苹果: 'AAPL' };

function normalizeTicker(value: string): string {
  const trimmed = value.trim();
  if (NAME_TO_TICKER[trimmed]) return NAME_TO_TICKER[trimmed];
  if (/^\d{6}$/u.test(trimmed)) return `${trimmed}.${trimmed.startsWith('6') || trimmed.startsWith('68') ? 'SH' : 'SZ'}`;
  return trimmed.toUpperCase();
}

export function getNativeCompanyProfile(ticker: string): NativeCompanyProfile | null {
  const profile = COMPANIES.find((candidate) => candidate.ticker === normalizeTicker(ticker));
  return profile ? { ...profile, keyMetrics: { ...profile.keyMetrics }, competitiveAdvantages: [...profile.competitiveAdvantages], risks: [...profile.risks] } : null;
}

export function getNativeRisks(filters: { ticker?: string; severity?: NativeRiskSeverity; type?: NativeRiskType } = {}): NativeRiskAssessment[] {
  return RISKS.filter((risk) => (!filters.ticker || risk.ticker === normalizeTicker(filters.ticker)) && (!filters.severity || risk.severity === filters.severity) && (!filters.type || risk.type === filters.type)).map((risk) => ({ ...risk }));
}

export function getNativeSectors(name?: string): NativeSectorAnalysis[] {
  const normalized = name?.trim().toLocaleLowerCase();
  return SECTORS.filter((sector) => !normalized || sector.name.toLocaleLowerCase() === normalized).map((sector) => ({ ...sector, trends: [...sector.trends], keyMetrics: { ...sector.keyMetrics } }));
}
