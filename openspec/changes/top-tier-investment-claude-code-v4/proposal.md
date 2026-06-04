# Proposal: 顶级投资助手的 Claude Code v4 (top-tier-investment-claude-code-v4)

> **范围**:在 v3(`top-tier-investment-claude-code`,已完成 3/7 sprint)的基础上,补齐 v3 没覆盖的 2 个维度——
> ① 投研域竞品定位矩阵 + 4 个唯一差异化 ② loucode "代码分析 AI Agent" 能力吸收,
> 同时把 v2 的回测/交易核心 spec 拉过来串成"决策—回测—交易—复盘"完整闭环。
> 形成 v4 = 投研 Claude Code 终极版,直接对标 Bloomberg / Capital IQ / AlphaSense / Hebbia / Kensho / Wind / 同花顺 / 雪球。

---

## Why

v3 (2026-06-04 启动) 是"深度"——把 5 layer 投研 Claude Code 架构 + loucode 7 隐藏功能投研化 + 4 唯一差异化 + 5 个投研核心 spec 的骨架搭起来。
v3 sprint 1.1 (role-system) / 1.2 (coach-memory) / 1.3 (coach-channels) 已落地 (commit `5497fbca`,tests 75/75 pass),
sprint 1.4 (5 个高优隐藏命令) 起尚未动工。

但原 ask 中两个关键维度 v3 还没显式覆盖:
1. **竞品定位**:v3 design.md 有 5 group 能力盘点,没做"投研 AI Agent"竞品矩阵。投研域有 Bloomberg / Capital IQ / FactSet / Wind / 同花顺 / 雪球 / AlphaSense / Hebbia / Kensho / FinChat 等十几家头部,upup 的"4 个唯一"(CLI-first / 开源自托管 / 全市场覆盖 / 三件套)还没量化对比,产品故事缺支柱。
2. **loucode 代码分析 AI Agent 能力**:v3 吸收了 loucode 7 大隐藏功能(KAIROS / Coordinator / Bridge / 50 编译开关 / 26+ 隐藏命令 / ULTRAPLAN / BUDDY),
   但 loucode 的"代码分析 AI Agent"本职(自动读代码 / 同行评审 / 重构建议 / 测试生成)—— 它是 Claude Code 的根基,所有隐藏功能都长在它上面——
   upup 还没显式吸收。v3 的 coach-mode 主要服务投研域,没把"代码分析 AI"做成独立 spec。

另外,v2 已落地的 `backtest-v2` / `trading-loop` / `feature-gates-v2` 等 spec 是"决策—回测—交易"闭环的关键一环,
v3 假设它们继续存在但没在 v3 改造计划里显式串通,v4 需要把它们正式纳入"投研 Claude Code 终极版"体系。

v4 目标:用 1 turn 完成"完善改造计划 + 2 个新 spec"——
① 竞品定位矩阵 + 4 唯一差异化文档化(`competitive-positioning` spec)
② loucode 代码分析 AI Agent 能力吸收(`claude-code-code-analysis` spec,既投研也能被 v3 coach-mode 复用)
③ 把 v2 的回测/交易 spec 拉进 v4 体系(深化 v3 sprint 4.x)
④ 4 唯一故事讲清楚(CLI-first / 开源 / 全市场 / 三件套)
让 upup 真正达到"顶级投资助手的 Claude Code"水平。

## What Changes

### A. 顶层架构深化(在 v3 5 layer 之上)

- **A1 `competitive-positioning` 新 spec**:投研 AI Agent 全竞品矩阵 + 4 唯一差异化
  - 13 家头部对标:Bloomberg / Capital IQ / FactSet / Wind / 同花顺 iFinD / 雪球 / AlphaSense / Hebbia / Kensho / FinChat / 问财 / Robinhood / IBKR
  - 7 维度评分:CLI 形态 / 投研覆盖 / 自动交易 / 推送渠道 / 团队协作 / 开源 / 价格
  - 4 唯一差异化的量化证据(代码 grep 数 / SKILL.md 数 / 推送渠道数 / 三件套完备度)
  - 投资者决策路径图(散户 / 活跃 / 私募 / 企业 4 类用户 → 不同入口)
- **A2 `claude-code-code-analysis` 新 spec**:loucode 代码分析 AI Agent 能力吸收
  - 自动代码考古(`src/` 全量扫描,生成模块依赖图)
  - 自动同行评审(PR diff 级别的 5 类问题检测:dead code / 重复 / 安全 / 性能 / 风格)
  - 自动重构建议(基于 5-layer 架构 + capability-manifest 双视角)
  - 自动测试生成(基于现有 *.test.ts 反推覆盖率)
  - KAIROS 集成:后台每日 dream 时跑代码考古,生成"代码晨报"
  - 投研特化:对每个 SKILL.md / tool / adapter 生成"质量评分"
- **A3 回测+交易闭环正式纳入 v4 体系**(v2 已有 spec,深化)
  - `backtest-v2` 串通:数据→策略→撮合→归因→报告 5 步(已有 286 tool 文件,深化报告)
  - `trading-loop` 串通:策略→风控→下单→确认→监控→复盘 6 步(sandbox 默认 + 4 algo + 4 broker)
  - `feature-gates-v2` 完整化:50+ 编译开关(v2 雏形 16,v4 增到 50+)
  - `coach-mode` 增强:推送"今日回测报告" / "今日交易复盘" / "风险预警"

### B. loucode 代码分析 AI Agent 能力 → upup 5 增强(5 项)

| loucode 能力 | upup 投研 Claude Code | 差距 | v4 行动 |
|------------|---------------------|------|--------|
| **自动读 code + 总结** | `src/code-archaeology/` 全量扫描器,生成 `docs/CODE-MAP.md` | v3 没做,v4 新增 | Sprint 8.1 |
| **同行评审**(PR diff) | `src/code-review/` 5 类问题检测器,集成 git diff | v3 没做,v4 新增 | Sprint 8.2 |
| **自动重构建议** | `src/code-refactor/` 5-layer 合规检测 | v3 没做,v4 新增 | Sprint 8.3 |
| **测试生成** | `src/code-test-gen/` 基于现有 *.test.ts 反推覆盖率 + 生成 missing tests | v3 没做,v4 新增 | Sprint 8.4 |
| **KAIROS 集成**(每日 dream) | `src/kairos/code-dream.ts` 后台每日跑代码考古,生成晨报 | v3 Sprint 3.1 间接覆盖,v4 显式化 | Sprint 8.5 |

### C. 4 唯一差异化强化(在 v3 D1-D4 基础上加证据)

- **C1 CLI-first**:证据 = `bun run src/index.tsx` 起 CLI;`/morning-brief` 等 20+ 隐藏命令;TUI 美化
- **C2 开源自托管**:证据 = LICENSE(MIT/Apache);`Dockerfile` + `docker-compose.yml`;`.upup/settings.json` 配置可导出
- **C3 全市场覆盖**:证据 = `src/tools/finance/` 18 文件,显式分 a-share / us / hk / crypto 4 groups
- **C4 三件套**:
  - 多 Agent:`src/coordinator/` 6 Worker(fundamental / technical / capital-flow / sentiment / policy / industry)
  - KAIROS:`src/kairos/` 16 文件(6 状态机 + dream + 持久 cron)
  - Bridge:`src/bridge/` 34 文件(RBAC / UI / Permission / Poll / Status / 5 推送渠道)

### D. 投研域 5 个核心 spec 的 v4 增量(在 v3 1.1-1.3 之上)

- **D1 `coach-mode` 增强**:推送"代码晨报"(来自 A2)/"竞品异动"(来自 A1)/"今日回测"(来自 A3)
- **D2 `cli-extension` 增量**:加 5 个新命令 `/competitive-scan` `/code-review` `/archaeology` `/refactor-suggest` `/test-coverage`
- **D3 `deep-plan` 增强**:长任务规划可选 5 阶段 + loucode verification
- **D4 `investment-3d-positioning` 升级**:把 4 唯一的"量化证据"从 doc 变成 spec 必填项
- **D5 投研能力可发现性**:`capability-manifest.ts` 加 `competitorRefs` 字段(每个 capability 标注对标竞品)

### E. 非破坏性内部重构

- `src/agent/capability-manifest.ts` 加 `competitorRefs: string[]` 字段(`?? []` 兜底)
- `src/agent/role-system.ts` 在投研 Coach 人设里加 4 唯一口号
- `src/coach/memory.ts` 集成"代码晨报"记忆(用户看过的代码异动)
- `src/coach/channels/` 5 渠道已经准备好(Sprint 1.3 完成),v4 直接复用

### F. 破坏性变更(明确标记)

- **BREAKING**:`src/agent/capability-manifest.ts` 字段扩展,下游消费方需 `?? []` 兜底(向后兼容)
- **BREAKING**:`src/agent/role-system.ts` 的 prompt 增强(可读性 + 风险提示强化),通过 `UPUP_COACH_MODE=0` 软降级

---

## Capabilities

### New Capabilities

- `competitive-positioning`:投研 AI Agent 竞品矩阵 + 4 唯一差异化(产品+文档交付,量化证据)
- `claude-code-code-analysis`:loucode 代码分析 AI Agent 能力吸收(自动考古 / 评审 / 重构 / 测试 / KAIROS 集成)

### Modified Capabilities(深化 v3 已有 spec)

- `cli-extension`:增量 5 个新命令(`/competitive-scan` `/code-review` `/archaeology` `/refactor-suggest` `/test-coverage`)
- `coach-mode`:推送 3 类新晨报(代码晨报 / 竞品异动 / 回测/交易复盘)
- `investment-3d-positioning`:从 doc 升级为 spec,4 唯一成必填项
- `deep-plan`:5 阶段 + loucode verification 集成

### Modified Capabilities(v2 已存在 spec,v4 拉入体系)

- `backtest-v2`:回测全链路 5 步报告化(数据→策略→撮合→归因→报告)
- `trading-loop`:交易全链路 6 步(策略→风控→下单→确认→监控→复盘)
- `feature-gates-v2`:50+ 编译开关完整化 + DCE friendly pattern

### Capabilities NOT in v4(已存在于 v3 或 v2,不在 v4 重复)

- `claude-code-5layer`(v3 新 spec):v4 不重复
- `kairos-v2`(v3 深化 v2):v4 8.5 仅做"代码 dream"子模块
- `bridge-v2`(v3 深化 v2):v4 不重复,5 推送渠道在 Sprint 1.3 已落地
- 7 竞品对标(research-deep-search / matrix-analysis / nl-screener / intent-routing-zh / institutional-data-feed / tradingagents-compat / web-search 增强):v2 spec 已建,v4 只**使用**不重复

---

## Impact

| 维度 | 影响 | 缓解 |
|------|------|------|
| 现有 SKILL.md | 新增 5-10 个(`code-archaeology` / `code-review` / `refactor` / `test-gen` / `code-dream` 等) | 走 `feature()` 开关,默认不加载 |
| 现有 tool | `capability-manifest.ts` 字段扩展 `competitorRefs` | 下游消费用 `?? []` 兜底 |
| Agent 主循环 | `role-system.ts` prompt 增强(4 唯一口号 + 风险提示) | `UPUP_COACH_MODE=0` 可关闭 |
| 配置文件 | `.upup/settings.json` 加 `competitive_scan` / `code_review` / `archaeology` 等开关 | 默认 `false` |
| 启动时间 | 5-10 个新 SKILL.md 启动扫描 | lazy-load:`feature` 启用才加载 |
| 兼容性 | v3 3/7 sprint 落地测试全绿 + v2 101/191 已合 | 任何 v4 PR 必须 `bun test` + `bun run typecheck` 全绿 |
| Bundle size | 50+ 编译开关 + 5-10 SKILL.md,bundle 略涨 | DCE friendly pattern + 懒加载 |

---

## 关键里程碑(预计 5 sprint, 1-2 turn 完成)

| Sprint | 内容 | 估算 | 依赖 |
|--------|------|------|------|
| **v4-Sprint 1 code-archaeology** | `src/code-archaeology/` 全量扫描器 + `docs/CODE-MAP.md` 自动生成 | 0.3 turn | - |
| **v4-Sprint 2 competitive-positioning** | 13 竞品矩阵 + 4 唯一差异化 + `docs/COMPETITIVE.md` | 0.3 turn | - |
| **v4-Sprint 3 code-review** | `src/code-review/` 5 类问题检测 + git diff 集成 | 0.4 turn | 1 |
| **v4-Sprint 4 refactor + test-gen** | `src/code-refactor/` + `src/code-test-gen/` 4 工具 | 0.4 turn | 1 |
| **v4-Sprint 5 kairos-code-dream** | `src/kairos/code-dream.ts` 后台每日代码晨报 | 0.2 turn | 1, 3, 4 |
| **v4-Sprint 6 cli-extension v4** | 5 新命令 + 集成到 manifest | 0.3 turn | 2, 3, 4 |
| **v4-Sprint 7 manifest-competitorRefs** | capability-manifest 扩展 + 下游兼容 | 0.2 turn | 2 |
| **v4-Sprint 8 archive v3** | v3 archive 到 `openspec/changes/archive/` | 0.1 turn | 全部 |

**v4 完成标志**:
- 13 竞品矩阵量化对比 + 4 唯一故事 doc + spec
- loucode 代码分析 AI 5 增强全部落地
- v3 5/7 sprint 落地
- v2 101/191 维持(不破坏)
- `bun test` + `bun run typecheck` 全绿

---

## Open Questions(等用户确认)

1. **v4 优先级**:code-archaeology 和 competitive-positioning 哪个先做?建议并行(独立模块)
2. **代码分析 AI 输出形式**:是生成 Markdown 报告 / 还是直接提示到 CLI / 还是 push 推送?建议三选一(用户配置)
3. **竞品矩阵更新频率**:是 v4 archive 时一次性 / 还是每 sprint 更新 / 还是 KAIROS 每日跑?建议每 sprint + v4 release
4. **v3 怎么处置**:v4 不 archive v3,v3 跟 v4 并行;v3 完成后一起 archive
5. **v4 是否包含 v3 未做完的 sprint 1.4-7**?建议**包含**——v4 接管 v3 所有未做 sprint,作为"v3 续 + v4 新"
6. **4 唯一 spec 化还是 doc 化**?建议 spec 化(`investment-3d-positioning` 升级),投资域对外宣称有依据
