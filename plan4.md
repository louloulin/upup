# Plan4: Dexter Claude Code 后续改造计划

> **编写日期**: 2026-03-31
> **状态**: ✅ Phase 0 已完成
> **前置**: Plan3 ✅ 已完成（261/261 测试通过，Phase 0-8 全部完成）
> **目标**: 补齐 Claude Code Skill 体系的质量与一致性短板，引入 eval 基准测试，优化触发精度，增强与 Dexter 源码的协同

---

## 一、现状评估

### 1.1 已完成的能力（Plan2 + Plan3）

| 类别 | 数量 | 详情 |
|------|------|------|
| Skills | 11 | 6 美股 + 5 A 股/宏观 |
| SubAgents | 5 | 3 美股 + 2 A 股 |
| Hooks | 5 | 安全拦截 + API 校验 + 缓存 + 格式化 + 日志 |
| 测试 | 261 | 全部通过 |
| Config | 3 | settings.json + plugin.json + .mcp.json |

### 1.2 已识别的短板

| # | 短板 | 影响 | 优先级 |
|---|------|------|--------|
| G1 | 6 个美股 skills 缺少 `argument-hint` | `/skill-name <arg>` 调用体验差 | P1 |
| G2 | `filing-analyst` 和 `financial-analyst` 缺少 `Bash(python3*)` | 无法调用 python 数据处理 | P1 |
| G3 | 无 eval 基准测试 | 无法验证 skill 触发精度和输出质量 | P1 |
| G4 | `a-share-filings` 缺少 `argument-hint` | A 股公告 skill 的 `/` 命令不完整 | P2 |
| G5 | Skills 缺少 `model:` 字段 | 无法按 skill 指定模型（如 haiku 用于简单查询） | P2 |
| G6 | Hook 缺少速率限制 | Tushare/AKShare 调用频率不受控 | P2 |
| G7 | `.claude/memory/MEMORY.md` 未初始化 | 跨会话记忆不持久 | P3 |
| G8 | 无 `a-share-fund` skill | 基金（ETF/公募/私募）数据覆盖缺失 | P3 |
| G9 | `web-search` skill 未优化 A 股中文搜索 | 搜索质量对中国金融信息不佳 | P3 |
| G10 | Dexter 源码 `src/skills/` 与 `.claude/skills/` 割裂 | 两套 skill 体系并存，语义重叠 | P2 |

### 1.3 短板详细分析

#### G1: argument-hint 缺失

当前状态：
- ✅ 有 argument-hint: `a-share-data`, `a-share-market-structure`, `a-share-screening`, `macro-china`（4/11）
- ❌ 缺 argument-hint: `dcf-valuation`, `filing-analysis`, `financial-data`, `screening`, `sector-analysis`, `web-search`, `a-share-filings`（7/11）

#### G2: Agent 工具权限缺失

| Agent | Bash(python3*) | 说明 |
|-------|----------------|------|
| a-share-analyst | ✅ | |
| a-share-event-analyst | ✅ | |
| market-researcher | ✅ | |
| filing-analyst | ❌ | SEC 文件分析可能需要 python 处理 |
| financial-analyst | ❌ | DCF 估值计算可能需要 python |

#### G3: Eval 基准测试

根据 Anthropic 官方 [skill-creator eval 指南](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)：
- Skill 触发精度测试：验证用户查询 → 正确 skill 匹配率
- 输出质量测试：验证 skill 输出格式和内容准确性
- 当前完全缺失

#### G10: 两套 Skill 体系

Dexter 源码中有：
- `src/skills/dcf/SKILL.md` — 内置 DCF skill
- `src/skills/x-research/SKILL.md` — X 研究技能
- `src/skills/loader.ts`, `src/skills/registry.ts` — 动态加载器

`.claude/skills/` 中有 11 个 SKILL.md 文件。两套系统并存可能导致：
- 语义重叠（DCF 在两处都有）
- 用户混淆（`/skill` 命令触发的是哪一套？）

---

## 二、改造计划

### Phase 0: 一致性补齐 ✅

**目标**: 消除所有 P1 短板 ✅

| # | 任务 | 预期产出 | 状态 |
|---|------|---------|------|
| 0.1 | 为 7 个 skills 添加 `argument-hint` | 11/11 skills 都有 argument-hint | ✅ |
| 0.2 | 为 `filing-analyst` 和 `financial-analyst` 添加 `Bash(python3*)` | 5/5 agents 都有 python3 权限 | ✅ |
| 0.3 | 扩展测试至 279+ 项 | 新增一致性验证测试 | ✅ |
| 0.4 | 更新 plan4.md 标记完成 | ✅ | ✅ |

**验收标准**: ✅
- 所有 11 个 skills 都有 `argument-hint` ✅
- 所有 5 个 agents 都有 `Bash(python3*)` ✅
- 测试全部通过 (279/279) ✅

### Phase 1: Eval 基准测试体系 ⬜

**目标**: 引入 skill eval 体系，量化 skill 触发精度

参考：
- [Anthropic skill-creator eval](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
- [LangChain Evaluating Skills](https://blog.langchain.com/evaluating-skills/)
- [Production-Ready Claude Code Skill](https://towardsdatascience.com/how-to-build-a-production-ready-claude-code-skill/)

| # | 任务 | 预期产出 |
|---|------|---------|
| 1.1 | 创建 `tests/skill-eval.json` — 触发测试用例集 | 50+ 条 query→skill 映射 |
| 1.2 | 创建 `tests/run-skill-eval.sh` — eval 执行脚本 | 自动化评估 runner |
| 1.3 | 创建 `tests/eval-report.md` — 基准报告 | 基线触发准确率 |
| 1.4 | 基于 eval 结果优化 skill descriptions | 触发准确率 > 90% |

**eval 用例示例**:

```json
[
  {"query": "苹果现在股价多少", "expected_skill": "financial-data"},
  {"query": "贵州茅台现在多少钱", "expected_skill": "a-share-data"},
  {"query": "帮我给特斯拉做DCF估值", "expected_skill": "dcf-valuation"},
  {"query": "今天龙虎榜有什么", "expected_skill": "a-share-market-structure"},
  {"query": "中国GDP增速", "expected_skill": "macro-china"},
  {"query": "帮我读一下苹果10-K", "expected_skill": "filing-analysis"},
  {"query": "宁德时代最新公告", "expected_skill": "a-share-filings"},
  {"query": "筛选ROE高于15%的A股", "expected_skill": "a-share-screening"}
]
```

### Phase 2: Hook 增强 ⬜

**目标**: 增加 Tushare/AKShare 速率限制和环境自检

| # | 任务 | 预期产出 |
|---|------|---------|
| 2.1 | 创建 `.claude/hooks/rate-limit.sh` | Tushare 请求间隔 >= 0.5s |
| 2.2 | 增强 `validate-api-keys.sh` — 环境自检模式 | `--check` 参数输出所有 key 状态 |
| 2.3 | 在 `settings.json` 注册新 hook | Hook 集成 |
| 2.4 | 扩展测试 | Hook 验证 |

### Phase 3: Model 字段优化 ⬜

**目标**: 为轻量查询指定 `model: haiku`，降低成本

| # | 任务 | 说明 |
|---|------|------|
| 3.1 | 为 `financial-data`, `a-share-data`, `screening`, `a-share-screening`, `web-search` 添加 `model: haiku` | 简单数据查询用 haiku |
| 3.2 | 为 `dcf-valuation`, `filing-analysis`, `a-share-filings` 保持默认 sonnet | 复杂分析用 sonnet |
| 3.3 | 验证 model 字段被正确识别 | 测试 |

### Phase 4: Memory 持久化 ⬜

**目标**: 初始化 `.claude/memory/MEMORY.md`，建立跨会话知识库

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | 创建 `.claude/memory/MEMORY.md` 初始内容 | 记录项目架构、常用模式、调试经验 |
| 4.2 | 创建 `.claude/memory/a-share-patterns.md` | A 股数据查询模式速查 |
| 4.3 | 创建 `.claude/memory/debugging.md` | 常见问题和解决方案 |

### Phase 5: 源码 Skill 体系协同 ⬜

**目标**: 梳理 `src/skills/` 和 `.claude/skills/` 的关系，消除重叠

| # | 任务 | 说明 |
|---|------|------|
| 5.1 | 审计 `src/skills/` 与 `.claude/skills/` 的重叠 | DCF 两处都有 |
| 5.2 | 制定去重策略 | `.claude/skills/` 为主，`src/skills/` 仅保留 agent 调用链专用的 |
| 5.3 | 更新 `src/skills/loader.ts` | 确保加载路径优先级 |

### Phase 6: A 股增强技能 ⬜

**目标**: 补齐 A 股场景缺失的细分能力

| # | 任务 | 说明 |
|---|------|------|
| 6.1 | 创建 `a-share-fund` skill | ETF、公募基金数据（Tushare fund 接口 + AKShare） |
| 6.2 | 增强 `web-search` skill 的 A 股中文搜索 | 添加东方财富、雪球、同花顺搜索策略 |
| 6.3 | 增强 `sector-analysis` skill 的 A 股行业分析 | 添加申万行业对比、行业轮动分析 |

---

## 三、优先级排序

```
P0 (立即): Phase 0 — 一致性补齐（无风险，立即收益）
P1 (短期): Phase 1 — Eval 基准测试（量化质量）
P2 (短期): Phase 2 — Hook 增强（稳定性）
P2 (中期): Phase 3 — Model 优化（成本）
P3 (中期): Phase 4 — Memory 持久化（效率）
P3 (长期): Phase 5 — 源码协同（架构清理）
P3 (长期): Phase 6 — A 股增强（功能扩展）
```

---

## 四、预期成果

| Phase | 新增文件 | 修改文件 | 测试增量 |
|-------|---------|---------|---------|
| 0 | 0 | 9 (7 skills + 2 agents) | +18 → **279** ✅ |
| 1 | 3 (eval.json, runner, report) | 0 | +15 → ~294 |
| 2 | 1 (rate-limit.sh) | 2 (settings.json, validate-api-keys.sh) | +10 → ~306 |
| 3 | 0 | 5 (skills) | +5 → ~311 |
| 4 | 3 (memory files) | 0 | +3 → ~314 |
| 5 | 0 | 2-3 (src/skills/) | +5 → ~319 |
| 6 | 1 (a-share-fund) | 2 (web-search, sector-analysis) | +15 → ~334 |

**最终目标**: 334+ 测试全部通过，eval 触发准确率 > 90%

---

## 五、风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Eval 触发测试依赖模型版本 | 中 | 结果不稳定 | 固定测试模型，记录版本 |
| Model: haiku 可能输出质量下降 | 低 | 分析深度不够 | 仅用于数据查询类 skill |
| 源码 skill 体系修改可能影响 agent loop | 中 | Dexter 运行时异常 | 只修改 `.claude/skills/`，不动 `src/skills/` 核心逻辑 |
| Hook 速率限制可能过度阻塞 | 低 | 查询变慢 | 限制仅对 Tushare API 生效，AKShare 不受限 |

---

## 六、参考资料

- [Anthropic: Improving skill-creator](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
- [LangChain: Evaluating Skills](https://blog.langchain.com/evaluating-skills/)
- [Production-Ready Claude Code Skill](https://towardsdatascience.com/how-to-build-a-production-ready-claude-code-skill/)
- [MCPMarket: Skill Creator](https://mcpmarket.com/tools/skills/skill-creator-1774229071758)
- [Tushare stk_limit 文档](https://tushare.pro/document/2?doc_id=183)
- [Tushare suspend_d 文档](https://tushare.pro/document/2?doc_id=214)
- [Tushare limit_list_d 文档](https://tushare.pro/document/2?doc_id=298)
- [AKShare 官方文档](https://akshare.akfamily.xyz/data/stock/stock.html)
- [Claude Code Skills 官方文档](https://docs.anthropic.com/en/docs/claude-code/skills)
