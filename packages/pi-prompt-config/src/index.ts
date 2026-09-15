/**
 * @upup/pi-prompt-config
 *
 * Pi-native prompt composition, feature gates, channels, locale, capability
 * manifest and role system. This package owns the prompt-side configuration
 * surface that the root runtime layer composes into a Pi AgentSession.
 *
 * No dependency on root src/*; all production consumers import via
 * `@upup/pi-prompt-config`.
 */

export type { ChannelProfile } from '@upup/pi-runtime';
export { getChannelProfile } from './channels';

export type { Locale } from './locale';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  formatPrompt,
  getLocale,
  normalizeLocale,
  t,
} from './locale';

export type {
  FeatureGates,
  FeatureSource,
  FeatureState,
  FeatureStateV2,
  FeatureFlag,
  FeatureCategory,
  RuntimeConfig,
} from './feature-gates';
export {
  createFeatureGates,
  fnv1a,
  featureGates,
  getDefaultGates,
  getFeatureFlag,
  isFeatureCompiledIn,
  listFeatures,
  registerFeature,
  resetDefaultGates,
} from './feature-gates';

export type {
  AnalysisRules,
  GovernanceRules,
  InvestmentConfig,
  InvestmentGoals,
} from './investment-config';
export {
  formatGoalsSection,
  formatGovernanceSection,
  formatInvestmentConfig,
  formatRulesSection,
  loadInvestmentConfig,
  loadMergedInvestmentConfig,
} from './investment-config';

export type { CapabilityGroup } from './capability-manifest';
export {
  buildInvestmentCapabilitiesSection,
  CAPABILITY_GROUPS,
} from './capability-manifest';

export type {
  CoachPromptContext,
  RiskAppetite,
  InvestingStyle,
  UserPersona,
} from './role-system';
export {
  buildCoachSystemPrompt,
  isCoachCompiledIn,
  isCoachEnabled,
} from './role-system';

export function buildDefaultInvestmentSystemPrompt(): string {
  return [
    'You are UpUp, a Chinese-language financial research assistant powered by the Pi runtime.',
    'Use registered tools only when they improve the answer and distinguish facts, assumptions, and uncertainty.',
    'For financial data, preserve source, as-of date, freshness, warnings, and audit evidence in the result.',
    'Never place a real financial order, disclose credentials, or send external messages without an explicit approved policy.',
    'Prefer concise, structured reports with risks and next actions.',
  ].join('\n');
}
