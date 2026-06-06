# Skills

> **Skills are the heart of UpUp.** A skill is a markdown file that teaches the LLM agent *when* and *how* to do a specific research task. UpUp ships with **50+ skills** (file-based, hot-reloadable) + **14 bundled skills** (code-based, always available).

---

## TL;DR

```bash
# Authoring
mkdir src/skills/<name>
$EDITOR src/skills/<name>/SKILL.md    # YAML frontmatter + markdown body

# Discovery
/skills                                  # list all
/skills --search dcf                     # fuzzy search
/skills --category 估值                   # group

# Hot-reload
# Just edit and save — no restart needed
```

---

## Two Kinds of Skills

### File-based (`src/skills/<name>/SKILL.md`)

- Plain markdown + YAML frontmatter
- Hot-reload (no restart)
- Best for: domain knowledge, analysis frameworks, prompt templates
- Discovery: `src/skills/registry.ts` walks the directory on startup + watches for changes
- Example: `src/skills/dcf/SKILL.md`

### Bundled (code-based, `src/skills/bundled/<name>.ts`)

- TypeScript modules exporting `register(ctx)` or `execute(args)`
- Always available (compiled in)
- Best for: parameterized tools, complex logic, performance-critical code
- Example: `src/skills/bundled/dcf.ts`

---

## SKILL.md Format

```markdown
---
name: your-skill-name
description: >
  One-sentence description that the LLM will see in its system prompt.
  Include trigger keywords (Chinese + English) so the LLM knows when to use it.
  Example: "DCF 估值。Trigger keywords: DCF, discounted cash flow, 现金流折现, 估值"
---

# Your Skill Title

## When to use
<!-- Concrete situations. The LLM reads this to decide whether to invoke. -->

Use this skill when the user asks for:
- DCF valuation of a single company
- ...
- NOT for: relative valuation (use `valuation-comparison` instead)

## How to use
<!-- The actual procedure. The LLM follows this. -->

1. Fetch the 3 financial statements via Tushare
2. Compute free cash flow = OCF - CapEx
3. Project 5 years of FCF
4. Apply WACC = 8% (configurable)
5. Compute terminal value with Gordon growth model
6. Discount to PV
7. Divide by shares outstanding → intrinsic value per share

## Assumptions
<!-- Make these explicit. The LLM should always state them to the user. -->

- WACC: 8% (default), configurable
- Growth rate: 5% (default), configurable
- Terminal growth: 3%

## Example output
<!-- Show a concrete example. Helps the LLM calibrate. -->

```
DCF for 贵州茅台 (600519.SH):
- 2025E FCF: 850 亿
- ...
- Intrinsic value: 1,820 元 / 股
- Current price: 1,650 元
- Margin of safety: 9.3%
```

## Limitations
<!-- Be honest. The LLM should warn the user. -->

- DCF is sensitive to WACC and growth assumptions
- Not suitable for early-stage / pre-revenue companies
- ...

## Related skills
- `valuation-comparison` — for relative valuation
- `earnings-forecast` — for projecting future earnings
```

---

## YAML Frontmatter Fields

| Field | Required | Description |
|---|---|---|
| `name` | ✅ | Lowercase, hyphenated, unique. Used as the skill identifier. |
| `description` | ✅ | One-line description. The LLM uses this for selection. Include trigger keywords (zh + en). |
| `category` | optional | Group for `/skills --category X` |
| `tags` | optional | Free-form tags |
| `requires` | optional | List of skill names this depends on |
| `version` | optional | Semver of the skill definition |
| `experimental` | optional | If `true`, the LLM is warned before invoking |

---

## Trigger Keywords: The Secret Sauce

The LLM picks skills by matching the user's query against skill descriptions. **Be generous with trigger keywords:**

```yaml
description: >
  DCF / discounted cash flow / 现金流折现 / intrinsic value / 内在价值 /
  company valuation / 公司估值. Use when the user wants a fundamental
  valuation of a single company with predictable cash flows.
```

The more specific triggers, the better the LLM can route.

---

## Bundled Skills (Code-based)

Use when you need code-level control. Each bundled skill is a TypeScript module.

```ts
// src/skills/bundled/my-bundled.ts
import type { SkillContext, SkillResult } from '../types.js';

export const metadata = {
  name: 'my-bundled',
  description: 'Does X with Y algorithm',
  triggers: ['keyword1', '关键词1'],
};

export async function execute(
  args: { input: string },
  ctx: SkillContext,
): Promise<SkillResult> {
  // … your logic …
  return {
    success: true,
    data: { /* … */ },
    summary: 'Did X with Y',
  };
}
```

The skill is auto-registered at startup by `src/skills/builtin-skills.ts`.

---

## Available Skills (50+)

### 估值 / 财务

- `dcf` — Discounted Cash Flow 估值
- `cash-flow-analysis` — 现金流量表分析
- `dividend-analysis` — 股息 / 分红分析
- `earnings-forecast` — 盈利预测
- `earnings-season` — 财报季策略
- `earnings-calendar` — 财报披露日历
- `valuation-comparison` — 相对估值
- `valuation-alert` — 估值偏离告警
- `financial-interpretation` — 财报解读
- `financial-report` — 财报生成
- `performance-prediction` — 业绩预测

### 技术 / 量价

- `technical-analysis` — RSI, MACD, 布林带, KDJ
- `money-flow` — 资金流（北向 / 主力 / 散户）
- `shareholder-analysis` — 股东分析
- `momentum-investing` — 动量策略
- `backtest-dca` — 定投回测
- `dca-strategy` — 定投策略

### 行业 / 主题

- `sector-analysis` — 行业分析
- `sector-rotation` — 板块轮动
- `macro-analysis` — 宏观分析
- `market-monitor` — 大盘监控
- `market-overview` — 市场概览
- `swarm-analysis` — 群体行为分析
- `x-research` — 跨源研究

### 风格 / 投资流派

- `value-investing` — 价值投资
- `growth-investing` — 成长投资
- `momentum-investing` — 动量投资

### 基金 / 机构

- `fund-analysis` — 基金分析
- `fund-comparison` — 基金对比
- `fund-holdings` — 基金持仓
- `fund-management` — 基金管理
- `manager-analysis` — 基金经理分析
- `institution-research` — 机构研究
- `institutional-holding` — 机构持仓

### 组合

- `portfolio-management` — 组合管理
- `portfolio-rebalancing` — 组合再平衡
- `personalized-recommendation` — 个性化推荐

### A 股专属

- `a-share-analysis` — A 股标的画像
- (市场结构 / 资金流向) — integrated in `a-share-analysis` + `money-flow`

### 数据 / 报告

- `api-integration` — 多数据源 API 整合
- `research-report` — 投研报告生成
- `alert-management` — 告警管理
- `multi-market-analysis` — 跨市场分析

### Bundled Skills (14)

- `research` — 投研报告骨架
- `fund` — 基金分析
- `portfolio` / `portfolio-review` — 组合构建/复盘
- `risk-assessment` — 风险评估
- `alert` — 告警
- `batch` — 批量分析
- `stock-screen` — 多因子筛选
- `dream` / `hunter` — 主题轮动/板块猎手
- `sandbox` — 沙箱执行
- `verify` — 引用验证
- `index` — 索引入口
- `prompt-helpers` — Prompt 辅助

---

## Testing a Skill

```ts
// src/skills/<name>/<name>.test.ts
import { describe, it, expect } from 'bun:test';
import { loadSkill } from '../loader.js';

describe('dcf skill', () => {
  it('loads with valid frontmatter', async () => {
    const skill = await loadSkill('./dcf/SKILL.md');
    expect(skill.name).toBe('dcf');
    expect(skill.description).toContain('DCF');
  });

  it('handles missing input gracefully', async () => {
    const result = await runSkill('dcf', { ticker: '' });
    expect(result.success).toBe(false);
  });
});
```

Run with: `bun test src/skills/<name>/`

---

## Sharing a Skill

Skills are just files. To share:

1. Push to a git repo (your own or PR to upup)
2. Users install via:

```bash
# One-off
git clone https://github.com/<you>/<skill-repo> ~/.upup/skills/<skill-name>

# Or via the registry (planned)
upup skills add <owner>/<skill-name>
```

Or use the `/plugin` system for richer packaging (see [docs/plugins.md](./plugins.md)).

---

## Best Practices

- **Keep skills focused** — one skill = one task
- **Use both zh + en triggers** — Chinese users will describe tasks in Chinese
- **Document limitations** — the LLM should know when NOT to use your skill
- **Show examples** — example output is the most useful part of a SKILL.md
- **Hot-reload** — there's no excuse to skip iteration; save and try
- **Test** — at minimum, a happy-path + a failure-case test
- **Version your skill** — add a `version:` to your frontmatter

---

## Custom Commands

You can also define slash commands via skill-like markdown:

```bash
mkdir -p .upup/commands
$EDITOR .upup/commands/morning.md
```

```markdown
---
name: morning
description: My personal morning routine
triggers: ['/morning']
---

# My Morning

1. Run `/morning-brief`
2. Run `/risk-dashboard --portfolio`
3. If 风险 > 0.7, run `/portfolio-review --urgent`
4. Echo "Ready for the day!"
```

Type `/morning` and UpUp runs the recipe.

---

## See Also

- `src/skills/registry.ts` — discovery implementation
- `src/skills/hot-reload.ts` — hot-reload implementation
- `src/skills/loader.ts` — frontmatter parser
- [docs/plugins.md](./plugins.md) — for richer plugin packaging
- [docs/i18n.md](./i18n.md) — for i18n in skill descriptions

---

<p align="center"><strong>One skill = one research task. Write what you know.</strong></p>
