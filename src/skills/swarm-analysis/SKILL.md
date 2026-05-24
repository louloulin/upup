---
name: swarm-analysis
description: Multi-agent stock analysis workflow using a team of specialized agents (researcher, analyst, summarizer)
context: swarm
agent: coordinator
aliases:
  - /swarm
  - /multi-agent
  - /analyze
whenToUse: |
  When you need to analyze a stock using multiple specialized agents:
  - Research company fundamentals (researcher agent)
  - Analyze financial metrics (analyst agent)
  - Generate investment recommendation (summarizer agent)
argumentHint: "<symbol> <name> [depth]"
---

# Multi-Agent Stock Analysis Workflow

This skill coordinates a team of AI agents to perform comprehensive stock analysis.

## Agents

| Agent | Role | Focus |
|-------|------|-------|
| researcher | Stock Researcher | Company fundamentals, business overview, competitive position |
| analyst | Financial Analyst | Revenue trends, valuation metrics, profitability |
| summarizer | Investment Advisor | Synthesis, recommendation, risk assessment |

## Workflow

1. **Team Creation**: Create a team named `stock-analysis-{symbol}`
2. **Research Phase**: Researcher agent analyzes company fundamentals
3. **Analysis Phase**: Analyst agent evaluates financial metrics
4. **Synthesis Phase**: Summarizer generates investment recommendation
5. **Output**: Comprehensive analysis report with risks and recommendation

## Usage

Use the `stock_analysis` tool to trigger the workflow:

```
stock_analysis(symbol="000001.SZ", name="平安银行", depth="basic")
```

Or use the swarm tools directly:

```
swarm_team_create(team_name="stock-analysis-000001")
swarm_agent_spawn(team_name="stock-analysis-000001", agent_name="researcher", role="researcher", prompt="...")
swarm_agent_spawn(team_name="stock-analysis-000001", agent_name="analyst", role="analyst", prompt="...")
swarm_agent_spawn(team_name="stock-analysis-000001", agent_name="summarizer", role="summarizer", prompt="...")
swarm_agent_results(team_name="stock-analysis-000001")
```

## Example Analysis

Analyze 平安银行 (symbol: 000001.SZ):

1. Research: Company overview, banking business, market share
2. Analysis: Financial metrics, P/E ratio, ROE, profitability
3. Recommendation: BUY/HOLD/SELL with target price

## Depth Levels

| Level | Turns | Use Case |
|-------|-------|----------|
| basic | 5 | Quick overview |
| detailed | 10 | Standard analysis |
| comprehensive | 15 | Deep dive research |
