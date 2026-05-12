/**
 * @upup/adapter-paperclip - Paperclip adapter for UpUp Agent
 *
 * Enables UpUp as a Paperclip company employee agent.
 */

import type { AdapterModel } from '@paperclipai/adapter-utils';

import { ADAPTER_TYPE, ADAPTER_LABEL } from './shared/constants.js';

// Server module
export { execute, testEnvironment, sessionCodec, detectModel } from './server/index.js';

// Server module re-export for convenience
export { type UpupAdapterConfig, type UpupSessionParams } from './shared/types.js';

// ── Adapter identity ─────────────────────────────────────────────────────

export const type = ADAPTER_TYPE;
export const label = ADAPTER_LABEL;

// ── Model list ────────────────────────────────────────────────────────────

export const models: AdapterModel[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
  },
  {
    id: 'gpt-4.5',
    label: 'GPT-4.5',
  },
];

// ── Agent configuration documentation ──────────────────────────────────

export const agentConfigurationDoc = `
# UpUp Agent Configuration

## Overview
UpUp is a financial research AI agent that can analyze investments, run quantitative models, and research companies.

## Model
The default model is **DeepSeek V4 Flash** (optimized for speed and cost). For better reasoning, use **Claude Sonnet 4.6** or **Claude Opus 4.7**.

## Execution Settings

### Timeout
Maximum execution time in seconds. Default: 1800 (30 minutes).

### Max Iterations
Maximum number of agent iterations. Default: 50.

### Session Persistence
Keep agent context across heartbeats for multi-turn tasks.

## Capabilities
- Financial data analysis (US + A-share markets)
- Quantitative modeling and backtesting
- Investment portfolio analysis
- Company valuation (DCF, comparables)
- Web research for financial information
`;

// ── ServerAdapterModule compatible export ─────────────────────────────────

export const createServerAdapter = () => ({
  type: ADAPTER_TYPE,
  label: ADAPTER_LABEL,
  models,
  agentConfigurationDoc,
  execute,
  testEnvironment,
  sessionCodec,
  detectModel,
});

export default {
  type: ADAPTER_TYPE,
  label: ADAPTER_LABEL,
  models,
  agentConfigurationDoc,
};
