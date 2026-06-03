## MODIFIED Requirements

### Requirement: LLM-Driven Intent Classification
The system SHALL classify user intent using an LLM-driven multi-layer classifier instead of pure keyword matching. The classifier covers 5 investment intents: stock-selection, analysis, backtest, trade, monitor.

#### Scenario: Investment intent recognized
- **WHEN** user says "分析一下 600519 该不该买"
- **THEN** LLM classifier returns intents: ['analysis', 'trade'] with confidence scores

## ADDED Requirements

### Requirement: Legacy Mode Fallback
The system SHALL provide a `legacy` mode that uses the old hardcoded keyword matching for environments where LLM calls are not desired (cost, latency, determinism).

#### Scenario: Use legacy
- **WHEN** user sets `UPUP_INTENT_MODE=legacy`
- **THEN** intent detector uses the old keyword matching, no LLM call

### Requirement: Few-Shot Examples
The system SHALL provide few-shot examples for each of the 5 investment intents to improve classification accuracy. Examples are stored in `agent/intent-detector/examples.json` and updated as the system learns.

#### Scenario: Improve with examples
- **WHEN** users mark certain queries as misclassified
- **THEN** examples are added to the few-shot set, improving future classification
