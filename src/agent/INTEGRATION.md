# Agent Auto-Trigger Integration Guide

## Overview

This document describes how to integrate the Auto-Trigger system into the main Agent.

## Integration Points

### 1. At Agent Creation

```typescript
import { getAgentAutoTriggerIntegration } from './agent-auto-trigger.js';

// In Agent constructor or static create()
const autoTriggerIntegration = getAgentAutoTriggerIntegration({ enabled: true });
```

### 2. At Query Start (run method)

```typescript
// In Agent.run() method, after initial setup
const autoTrigger = getAgentAutoTriggerIntegration();
const triggerResult = await autoTrigger.onQueryStart(query);

// Log detected intents
if (triggerResult.intents.length > 0) {
  info('agent', `Investment intents: ${triggerResult.intents.map(i => i.type).join(', ')}`);
}

// Log extracted tickers
if (triggerResult.tickers.length > 0) {
  info('agent', `Ticker symbols: ${triggerResult.tickers.join(', ')}`);
}

// Yield skill suggestion event for UI
if (triggerResult.suggestion) {
  yield {
    type: 'skill_suggestion',
    intents: triggerResult.intents,
    suggestion: triggerResult.suggestion,
    tickers: triggerResult.tickers,
  };
}

// Execute Pre-Research hook
const preResult = await autoTrigger.executePreResearch(query, triggerResult.tickers);
if (!preResult.allowed) {
  // Handle blocked research
}
```

### 3. At Query End

```typescript
// At the end of Agent.run()
await autoTrigger.onQueryEnd(query, triggerResult, Date.now() - startTime);
```

## Feature Flags

- `DEXTER_AUTO_TRIGGER_ENABLED`: Enable/disable auto-trigger (default: true)
- `DEXTER_AUTO_TRIGGER_MODE`: Mode: 'auto', 'suggest', 'manual' (default: 'suggest')

## Events

The integration produces the following events:

- `skill_suggestion`: Emitted when skill suggestions are available
- `intent_detected`: Emitted when investment intents are detected

## Configuration

```typescript
const autoTrigger = getAgentAutoTriggerIntegration({
  enabled: true,
  mode: 'suggest',      // 'auto' | 'suggest' | 'manual'
  showSuggestions: true,
  autoExecuteHighConfidence: false,
  highConfidenceThreshold: 0.8,
});
```

## Example Output

```
[agent] Investment intents: valuation, fundamental, ticker
[agent] Ticker symbols: 600519
[agent] Triggered skills: dcf-valuation(suggested), pe-ratio(suggested)
```

## Files

- `src/agent/agent-auto-trigger.ts` - Integration layer
- `src/agent/auto-trigger.ts` - Core auto-trigger logic
- `src/skills/intent-detector.ts` - Intent detection
- `src/skills/skill-trigger.ts` - Skill triggering
