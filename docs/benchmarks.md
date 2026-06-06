# Benchmarks & Evaluations

> **How good is UpUp at financial research?** This page is a working draft — full benchmarks are still being collected. We include the framework, the dataset, and early numbers.

---

## Evaluation Framework

We use [LangSmith](https://www.langchain.com/langsmith) with a custom Ink UI (`src/evals/`). The framework:

```bash
# Run full eval suite (200+ questions, takes ~30 min)
bun run src/evals/run.ts

# Run a sample
bun run src/evals/run.ts --sample 10

# Run a specific question type
bun run src/evals/run.ts --type "财务分析"
```

Each eval:

1. Loads a question from `src/evals/dataset/finance_agent.csv`
2. Runs the agent with the question as the only input
3. Captures the final answer + intermediate tool calls
4. Scores against a rubric (correctness, contradiction, citation density, …)
5. Reports per-question and aggregate metrics

---

## Dataset

`src/evals/dataset/finance_agent.csv` has **240+ questions** spanning:

| Type | Count | Example |
|---|---:|---|
| Market Analysis | 80 | "How has US Steel addressed its planned merger with Nippon Steel?" |
| Trends | 40 | "How has Netflix's Average Revenue Per Paying User changed 2019-2024?" |
| Financials | 50 | "What was Apple's gross margin in 2024?" |
| Ratios | 30 | "Calculate Tesla's debt-to-equity ratio over 5 years" |
| Filings | 20 | "What did NVIDIA disclose about China revenue in the 10-K?" |
| News | 20 | "Recent M&A in the semiconductor space" |
| A 股 (planned) | 100+ | Chinese-market specific questions (in progress) |

Each row has:

```csv
Question,Answer,Question Type,Expert time (mins),Rubric
"How has US Steel...","The proposed merger...",Market Analysis,30,"[{'operator': 'correctness', 'criteria': '...'}, ...]"
```

The `Rubric` column is a JSON list of `{operator, criteria}` pairs scored by an LLM judge.

---

## Metrics

### Per-Question

| Metric | Definition | Target |
|---|---|---|
| **Correctness** | % of rubric criteria the answer satisfies | ≥ 80% |
| **Contradiction** | % of claims in answer that contradict the ground truth | ≤ 5% |
| **Citation Density** | Cited claims per 100 words | ≥ 3.0 |
| **Latency** | Wall-clock time | ≤ 120s for 4-tool calls |
| **Tool Calls** | # of tool invocations | 3-10 typical |
| **Tokens** | Total LLM tokens | ≤ 50k for short answers |

### Aggregate

| Metric | Definition |
|---|---|
| **Pass Rate** | % of questions where all rubric criteria met |
| **Mean Reciprocal Rank** | Where the correct answer ranks in tool selection |
| **Citation Coverage** | % of numerical claims with a cited source |
| **Hallucination Rate** | % of answers containing fabricated numbers / facts |

---

## Early Results (Sample of 10 Questions, 2026-05)

> ⚠️ These are preliminary. Full suite results will be published in [CHANGELOG.md → Benchmarks](../CHANGELOG.md).

| Question | Pass | Citation Density | Latency | Tokens |
|---|:---:|---:|---:|---:|
| US Steel merger | ✓ | 4.2 | 78s | 24k |
| Netflix ARPU | ✓ | 5.1 | 65s | 19k |
| Apple gross margin | ✓ | 6.3 | 42s | 12k |
| Tesla D/E | ✗ | 2.1 | 91s | 31k |
| NVIDIA 10-K China | ✓ | 4.8 | 88s | 28k |
| Recent M&A | ✓ | 3.5 | 56s | 18k |
| ... | | | | |
| **Avg** | **8/10** | **4.3** | **68s** | **22k** |

---

## A-Share-Specific Evals (In Progress)

We are building 100+ A-share specific questions:

| Category | Sample questions |
|---|---|
| 财报披露 | "贵州茅台 2025Q3 营收同比" |
| 资金流 | "近 30 日北向资金净流入 Top 10" |
| 行业 | "白酒板块当前 PE 处于历史分位" |
| 公告 | "近 7 日公司回购公告" |
| 估值 | "宁德时代 DCF 内在价值" |
| 风险 | "房地产敞口较高的银行股" |
| 政策 | "近期对储能行业的政策影响" |
| 衍生 | "50ETF 期权波动率" |
| 北交所 | "北证 50 成分股筛选" |
| 港股通 | "南向资金流向" |

Contributions welcome — see [CONTRIBUTING.md → Adding an Eval](../CONTRIBUTING.md).

---

## Running Evals Locally

```bash
# 1. Set up LangSmith
export LANGSMITH_API_KEY=...
export LANGSMITH_TRACING=true
export LANGSMITH_PROJECT=upup-evals

# 2. Run
bun run src/evals/run.ts

# 3. View results
# LangSmith UI will show all runs + scores
# Or open .upup/evals/<run-id>.jsonl
```

The Ink UI shows live progress:

```
$ bun run src/evals/run.ts --sample 10

  涨涨 · Evaluation Runner
  
  ▰▰▰▰▰▰▱▱▱▱  6/10  (60% pass)
  
  Recent:
    ✓ US Steel merger              (78s, 4.2 cite/100w)
    ✓ Netflix ARPU                 (65s, 5.1 cite/100w)
    ✗ Tesla D/E                    (91s, 2.1 cite/100w)
    ...
  
  Press Ctrl-C to abort, Enter to see details.
```

---

## Citation Density Counter

`src/evals/citation-density.ts` measures the quality of the agent's citations:

```ts
// Counts: "Tushare 2025-10-25", "[1]", "https://...", etc.
const citations = countCitations(answer);
const wordCount = answer.split(/\s+/).length;
const density = (citations / wordCount) * 100;
```

Higher is better. Target: ≥ 3.0 citations per 100 words. This is enforced in the agent's system prompt:

> "Cite your sources. Target: at least 3 cited claims per 100 words. Use Tushare / AKShare / 巨潮 as preferred sources for A-share data."

---

## Limitations of This Eval

- **Ground truth bias** — rubric is written by humans, may favor certain phrasings
- **LLM judge variance** — scoring LLM is itself non-deterministic
- **US-heavy** — current dataset is 70% US equities; A-share evals in progress
- **No real-time test** — all questions are about historical data
- **No user satisfaction** — automated metrics ≠ human usefulness

We welcome community-contributed questions, especially for A-share. See [`src/evals/dataset/`](../../src/evals/dataset/).

---

## Roadmap for Evals

- [ ] 100+ A-share specific questions (Q3 2026)
- [ ] 50+ Hong Kong stock questions (Q3 2026)
- [ ] 20+ multi-market comparative questions (Q3 2026)
- [ ] Adversarial questions (prompt injection, conflicting data) (Q4 2026)
- [ ] User satisfaction survey (Q4 2026)
- [ ] Public leaderboard (Q4 2026)

---

## See Also

- [src/evals/run.ts](../../src/evals/run.ts) — eval runner
- [src/evals/citation-density.ts](../../src/evals/citation-density.ts) — citation metric
- [src/evals/dataset/](../../src/evals/dataset/) — question bank
- [docs/showcase.md](./showcase.md) — real output samples

---

<p align="center"><strong>Numbers without context are noise. Context without numbers is opinion. We strive for both.</strong></p>
