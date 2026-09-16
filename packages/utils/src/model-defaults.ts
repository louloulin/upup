export const DEFAULT_PROVIDER = 'deepseek';
export const DEFAULT_MODEL = 'deepseek-v4-flash';

/**
 * Curated "offer this first" model per provider. These ids are moved to the top
 * of every model list (TUI `/model`, onboarding, headless default resolution),
 * and the first entry doubles as the provider's default model.
 *
 * This is the single source of truth shared by the TUI (`Pi InteractiveMode`'s
 * model list) and the headless surfaces (print / gateway / cron / bridge), so a
 * model id chosen in one place is not silently different in another. Ids that
 * the Pi catalog does not know are skipped at lookup time.
 */
export const RECOMMENDED_MODELS: Readonly<Record<string, readonly string[]>> = {
  openai: ['gpt-5.4', 'gpt-4.1'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-7'],
  google: ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
  xai: ['grok-4.6', 'grok-4.5'],
  moonshotai: ['kimi-k2.5'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
};
