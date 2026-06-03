---
name: upup-skill-system
description: UpUp SKILL.md技能系统。用于理解技能定义、发现机制、执行流程、创建新技能。当需要创建自定义技能、修改技能行为、理解技能触发时触发。
---

# UpUp Skill System - 技能系统 Skill

## 概述

UpUp的技能系统允许通过SKILL.md文件定义可扩展的工作流程，支持金融分析、研究、自动化等复杂任务。

## 架构

```
src/skills/
├── registry.ts          # 技能发现与注册
├── loader.ts            # SKILL.md解析
├── executor.ts         # 技能执行器
├── intent-detector.ts  # 意图检测
├── skill-trigger.ts    # 触发逻辑
├── types.ts            # 类型定义
├── bundled/           # 内置技能代码
└── [skill-name]/      # 技能目录
    └── SKILL.md       # 技能定义
```

## 技能发现

### 搜索顺序（优先级递增）

1. `src/skills/` - 内置技能
2. `~/.claude/skills/` - 用户技能
3. `.upup/skills/` - 项目技能

### 元数据格式

```typescript
interface SkillMetadata {
  name: string          // 技能名称 (唯一)
  description: string   // 触发描述
  path: string          // 文件路径
  source: 'builtin' | 'user' | 'project'
  userInvocable?: boolean  // 是否可用户调用
  argumentHint?: string    // 参数提示
}
```

## SKILL.md格式

```markdown
---
name: my-skill
description: 技能描述，用于触发检测。当用户询问XX时触发。
---

# My Skill

## 工作流程

1. Step 1...
2. Step 2...

## 工具使用

- 使用 `get_financials` 获取财务数据
- 使用 `memory_search` 搜索记忆
```

## 创建新技能

### 1. 创建目录

```bash
mkdir -p .upup/skills/my-skill
touch .upup/skills/my-skill/SKILL.md
```

### 2. 编写SKILL.md

```markdown
---
name: my-financial-skill
description: 执行XX金融分析。当用户询问XX时触发。
---

# My Financial Skill

## 目标

[简短描述技能目标]

## 工作流程

1. **数据收集**: 调用 `get_financials` 获取...
2. **数据处理**: ...
3. **结果输出**: ...

## 示例查询

用户: "分析AAPL的估值"

## 限制

- 数据有效期
- 计算假设
```

### 3. 触发检测

技能触发基于description匹配:

```markdown
description: |
  Performs XX analysis.
  Triggers when user asks for XX, wants XX,
  mentions XX, or needs XX.
```

### 4. 技能执行

```typescript
import { executeSkill } from '@/skills/executor';

const result = await executeSkill('my-skill', {
  ticker: 'AAPL',
  analysisType: 'valuation'
});
```

## 内置技能

### 金融类

| Skill | Description |
|-------|-------------|
| `dcf-valuation` | DCF估值分析 |
| `dividend-analysis` | 股息分析 |
| `earnings-forecast` | 盈利预测 |
| `growth-investing` | 成长股投资 |
| `value-investing` | 价值投资 |

### 分析类

| Skill | Description |
|-------|-------------|
| `sector-rotation` | 行业轮动 |
| `sentiment-analysis` | 情绪分析 |
| `technical-analysis` | 技术分析 |
| `risk-assessment` | 风险评估 |

### 研究类

| Skill | Description |
|-------|-------------|
| `institution-research` | 机构研究 |
| `earnings-season` | 财报季分析 |
| `macro-analysis` | 宏观分析 |

## 技能执行器

### 执行流程

```
intent-detector.ts
    ↓ (检测触发)
skill-trigger.ts
    ↓ (调用)
executor.ts
    ├── loadSkill(skillName)
    ├── buildContext(query, skill)
    ├── executeWorkflow(skill.instructions)
    └── return Result
```

### 执行选项

```typescript
interface SkillExecutionOptions {
  skillName: string
  query: string
  context?: Record<string, any>
  maxSteps?: number
  abortSignal?: AbortSignal
}
```

## 技能追踪

```typescript
skillTracker.track({
  skillName: 'dcf-valuation',
  invocationPoint: 'intent_match',
  query: 'analyze AAPL valuation',
  result: 'success'
});
```

## Bundled Skills

内置技能也可通过代码注册:

```typescript
import { registerBundledSkill } from '@/skills/registry';

registerBundledSkill({
  name: 'quick-analysis',
  description: 'Quick financial analysis...',
  instructions: '...',
  userInvocable: true,
  getPromptForCommand: (cmd) => `...`
});
```

## 最佳实践

### 技能描述编写

1. **具体**: 明确触发场景
2. **全面**: 覆盖常见变体
3. **排他**: 避免与其他技能重叠

```markdown
description: |
  Performs DCF valuation.
  Triggers when user asks: "what is X worth",
  "DCF", "fair value", "intrinsic value",
  "undervalued/overvalued", "price target"
```

### 工作流程设计

1. 使用检查清单格式
2. 提供默认值和备选方案
3. 包含验证步骤
4. 说明输出格式

### 工具限制

在技能中明确允许的工具:

```typescript
const skill: Skill = {
  name: 'my-skill',
  // ...
  allowedTools: ['get_financials', 'get_market_data']
};
```

## 技能测试

```typescript
const result = await executeSkill('dcf-valuation', {
  ticker: 'AAPL'
});

// 验证输出
expect(result.fairValue).toBeDefined();
expect(result.upside).toBeLessThan(50);
```
