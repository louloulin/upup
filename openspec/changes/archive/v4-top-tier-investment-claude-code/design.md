# Design: 顶级投资助手的 Claude Code v4 (top-tier-investment-claude-code-v4)

> **范围**:在 v3 (3/7 sprint 已落地) 基础上,补 2 个新维度——投研域竞品定位矩阵 + loucode 代码分析 AI Agent 能力吸收,
> 同时把 v2 的回测/交易核心 spec 拉进 v4 体系,形成"决策—回测—交易—复盘"完整闭环。
>
> **方法**:v4 = v3 续 + 2 个新 spec(competitive-positioning / claude-code-code-analysis) + 4 唯一差异化量化证据。
> 不破坏 v2 (101/191 已合) / v3 (3/7 已合) 的任何 spec;以 `?? []` / `?? default` 兜底扩展 capability-manifest。

---

## 一、目标与边界

### 1.1 v4 一句话定位

> **upup v4 = 唯一"CLI-first + 开源 + 全市场 + 三件套"的投研 Claude Code,具备 Bloomberg 级别的数据覆盖 + AlphaSense 级别的 NLP 研究 + Hebbia 级别的矩阵分析 + Kensho 级别的事件扫描,且把 loucode 的"代码分析 AI Agent"本职能力吸收到投研域。**

### 1.2 v4 增量边界(在 v3 之上)

| 维度 | v3 | v4 增量 |
|------|-----|---------|
| 架构 | 5 layer 投研 Claude Code | 复用,不破坏 |
| 投研 Coach | 4 主动推送模式 | 增 3 类新晨报(代码 / 竞品 / 回测) |
| CLI 隐藏命令 | 20+ 投研命令 | 增 5 新命令(competitive-scan / code-review / archaeology / refactor-suggest / test-coverage) |
| 竞品定位 | v3 design 没显式做 | **v4 新 spec**:13 竞品矩阵 + 4 唯一量化 |
| 代码分析 AI | v3 没显式做 | **v4 新 spec**:loucode 5 增强(自动考古 / 评审 / 重构 / 测试 / dream) |
| 回测 + 交易 | v3 sprint 4.1/4.2 | v4 拉入并串通到 Coach 推送 |
| 编译开关 | 16+ 雏形 | 50+ 完整化 + DCE friendly |
| Capability manifest | 5 group | 加 `competitorRefs` 字段 |

### 1.3 v4 不做

- 重新做 v2 101/191 已合的 spec(只**深化**和**引用**)
- 重新做 v3 5/7 已规划 spec(只**续做** 1.4-7)
- 引入新数据源(沿用 realtime / financial_datasets / 同花顺 / 雪球)
- 上云端(deep-plan 本地化,sandbox 优先)

---

## 二、竞品定位矩阵(competitive-positioning spec)

### 2.1 13 竞品 7 维度评分

```
              CLI  投研覆盖  自动交易  推送渠道  团队协作  开源  价格
              (是=2/部分=1/否=0)
              ─────────────────────────────────────────────────
Bloomberg       0     2        1        1        2       0    -2  (32K USD/年)
Capital IQ      0     2        0        1        2       0    -2  (15K USD/年)
FactSet         0     2        0        1        2       0    -2  (12K USD/年)
Wind            0     2        1        1        2       0    -2  (8K CNY/年)
同花顺 iFinD    0     2        1        1        1       0    -1  (3K CNY/年)
雪球            1     1        2        0        1       0     0  (免费/付费)
AlphaSense      0     2        0        0        2       0    -2  (12K USD/年)
Hebbia          0     2        0        0        2       0    -2  (30K USD/年)
Kensho          0     1        0        0        2       0    -1  (SaaS)
FinChat         0     1        0        0        1       0    -1  (300 USD/月)
问财(同花顺)    0     1        0        0        0       0     0  (免费)
Robinhood       0     1        2        0        0       0     0  (免费)
IBKR            1     1        2        0        0       0     0  (免费+佣金)
──────────────────────────────────────────────────────────────────
upup v4         2     2        2        2        2       2     2
                CLI  全 4 市场  sandbox  微飞钉邮  Bridge  MIT+  免费
                全栈  (A+港+美+  +4algo  + Bridge  (3 件套) Apache  (自托管)
                       加密)        +4 broker)
```

### 2.2 upup 4 唯一差异化的量化证据

| 唯一 | 证据(v4 实测) |
|------|--------------|
| **D1 CLI-first 投研 Agent** | `src/index.tsx` 启动 CLI;`src/commands/` 20+ 隐藏命令(v3 1.4-3.5 落地);TUI 用 Ink + React 17;`feature()` 编译开关 50+ 门控 |
| **D2 完全开源 + 自托管** | LICENSE (MIT/Apache) + `Dockerfile` + `docker-compose.yml`;`.upup/settings.json` 可导出/导入;不依赖任何 SaaS |
| **D3 全市场覆盖**(A+港+美+加密) | `src/tools/finance/` 18 文件显式分 4 groups;`capability-manifest.ts` `markets: ['a-share', 'us', 'hk', 'crypto']` 字段 |
| **D4 多 Agent + KAIROS + Bridge 三件套** | 多 Agent:`src/coordinator/` 6 Worker(fundamental/technical/capital-flow/sentiment/policy/industry) + `src/subagent/` + `src/tasks/`;KAIROS:`src/kairos/` 16 文件(6 状态机 + dream + 持久 cron);Bridge:`src/bridge/` 34 文件(RBAC/UI/Permission/Poll/Status) + 5 推送渠道(微飞钉邮) |

### 2.3 投资者决策路径图(4 类用户 → 入口)

```
散户(A 股为主)
  └→ /morning-brief + /watchlist-edit + /risk-dashboard
     + /portfolio-review + 微信 Server 酱
     └→ 路径:晨会看异动 → 自选股编辑 → 风险仪表盘 → 收盘复盘

活跃(A+港+美+加密)
  └→ /screen (自然语言) + /compare + /backtest-run
     + /rebalance-now + 飞书 Lark Bot
     └→ 路径:NL 选股 → 多标对比 → 快速回测 → 调仓

私募(多账户 + 团队)
  └→ /portfolio-review (Brinson 归因) + /risk-dashboard
     + /session-share (团队分享) + 钉钉 DingTalk
     └→ 路径:组合归因 → 风险预警 → 团队协同

企业(合规 + 自托管)
  └→ Docker 部署 + Bridge web 控制台 + 邮件日报
     + 完整审计日志 + 持仓加密
     └→ 路径:本地私有化 → 远程审批 → 审计合规
```

---

## 三、loucode 代码分析 AI Agent 5 增强(claude-code-code-analysis spec)

### 3.1 5 增强总图

```
┌─────────────────────────────────────────────────────────────────┐
│                    代码分析 AI Agent (v4 新)                     │
│                                                                  │
│  1. 自动考古 (code-archaeology)                                  │
│     └→ src/ 全量扫描,生成 docs/CODE-MAP.md + 模块依赖图          │
│                                                                  │
│  2. 同行评审 (code-review)                                        │
│     └→ PR diff 级别 5 类问题检测                                  │
│        ├─ dead code    (未引用导出)                              │
│        ├─ duplication  (重复代码 ≥ 80% 相似)                     │
│        ├─ security     (硬编码 key / SQL 注入 / XSS)             │
│        ├─ performance  (O(n²) 循环 / 同步 IO)                    │
│        └─ style        (命名 / 注释 / 长度)                       │
│                                                                  │
│  3. 重构建议 (refactor-suggest)                                   │
│     └→ 基于 5-layer 合规 + capability-manifest 双视角             │
│        ├─ L1/L2/L3 边界检查(模块不该跨层依赖)                    │
│        ├─ capability-manifest 字段完整性                         │
│        └─ 投研域特殊(无 BUY/SELL 关键词)                        │
│                                                                  │
│  4. 测试生成 (test-coverage)                                      │
│     └→ 基于现有 *.test.ts 反推覆盖率                               │
│        ├─ 缺测文件列表                                            │
│        ├─ 自动生成 stub test 模板                                │
│        └─ CI 集成: < 80% 覆盖率 fail build                       │
│                                                                  │
│  5. KAIROS 集成 (kairos-code-dream)                               │
│     └→ 后台每日 dream 时跑代码考古 + 评审                          │
│        ├─ 每日 CODE-MAP 增量 diff                                 │
│        ├─ 每周 code-review 全量重跑                              │
│        └─ 生成"代码晨报" 推送(可选)                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 自动考古 (code-archaeology) 详细设计

**输入**:`src/**/*.ts` + `src/**/*.tsx`
**输出**:`docs/CODE-MAP.md` + `docs/CODE-MAP.json`(机器可读)

**生成内容**:
- 模块清单(每个 .ts/.tsx 1 行:文件路径 / LOC / exports / imports / 所属 layer)
- 依赖图(谁依赖谁,反向)
- 5 layer 分布统计(L1/L2/L3/L4/L5 文件数 / LOC 占比)
- capability-manifest 命中度(每个 group 覆盖的 tool 文件)
- "orphans": 无 imports / 无 exports 的死文件候选
- "hot spots": imports 最多的 20 个文件(架构核心)
- "god files": 单文件 > 500 行的复杂模块

**示例 CODE-MAP.md 节选**:
```markdown
# upup 代码地图 (auto-generated by code-archaeology v0.1)

## 模块清单
| File | LOC | Exports | Imports | Layer |
|------|-----|---------|---------|-------|
| src/agent/agent.ts | 1232 | Agent | 18 | L1 |
| src/agent/role-system.ts | 179 | buildCoachSystemPrompt | 4 | L1 |
| ... | | | | |

## 5 layer 分布
- L1 基础循环: 72 files, 18K LOC (35%)
- L2 工具+技能: 286 files, 80K LOC (45%)
- L3 多 Agent: 14 files, 5K LOC (5%)
- L4 远程协同: 19 files, 5K LOC (5%)
- L5 持续自主: 16 files, 4K LOC (3%)
- Other (data, ui, utils): 547 files, 50K LOC (7%)

## Top 10 Hot Spots (most-imported)
1. src/tools/registry/index.ts (imported by 89 files)
2. src/utils/env.ts (imported by 67 files)
...

## 10 Orphans (no external imports)
1. src/legacy/old-format.ts (candidate for deletion)
...
```

**实现**:
- `src/code-archaeology/index.ts` — 主入口
- `src/code-archaeology/scanner.ts` — 文件扫描 + AST 解析(用 `ts-morph` 或正则)
- `src/code-archaeology/layer-detector.ts` — 5 layer 推断(基于路径前缀 + import 模式)
- `src/code-archaeology/manifest-checker.ts` — capability-manifest 命中度
- `src/code-archaeology/orphan-finder.ts` — 死文件检测
- `src/code-archaeology/hot-spot-finder.ts` — hot spot 检测
- `src/code-archaeology/markdown-renderer.ts` — 渲染 CODE-MAP.md
- `scripts/code-archaeology.ts` — CLI 入口
- `src/code-archaeology/scanner.test.ts` — 测试

**依赖**:`ts-morph` (npm,加到 bun.lock) 或手写 AST 解析
**编译开关**:`feature('CODE_ARCHAEOLOGY')`,默认 off

### 3.3 同行评审 (code-review) 详细设计

**输入**:`git diff` 输出(unstaged + staged)
**输出**:PR comment 风格的 Markdown 报告,5 类问题分级(critical / warning / info)

**5 类检测器**:
1. **dead code**:用正则 + AST 检测未引用的 export
   ```ts
   // 检测:  export const foo = ...  但 grep foo in src/ 0 结果
   ```
2. **duplication**:Jaccard 相似度 ≥ 0.8 的代码块
   ```ts
   // 检测: 5 行 token-set 相似度 ≥ 80%
   ```
3. **security**:硬编码 key / SQL 注入 / XSS
   ```ts
   // 规则:  /(api[_-]?key|token|secret)\s*[:=]\s*['"][^'"]{16,}/i
   // 规则:  /\$\{.*\}.*(?:SELECT|INSERT|DELETE|UPDATE)/i
   ```
4. **performance**:O(n²) 循环 / 同步 IO / 未释放资源
   ```ts
   // 检测: for(...) { for(...) { ... } } 嵌套 ≥ 2
   // 检测:  fs.readFileSync / fs.writeFileSync (在 hot path)
   ```
5. **style**:命名 / 注释 / 长度
   ```ts
   // 规则:  文件名应 kebab-case / camelCase
   // 规则:  函数 > 100 行应拆分
   // 规则:  export 应有 JSDoc 注释
   ```

**实现**:
- `src/code-review/index.ts` — 主入口
- `src/code-review/diff-parser.ts` — 解析 git diff
- `src/code-review/detectors/{dead-code,duplication,security,performance,style}.ts` — 5 检测器
- `src/code-review/report-renderer.ts` — Markdown 报告
- `src/code-review/cli.ts` — `bun run code-review` CLI
- `src/code-review/detectors/*.test.ts` — 每检测器 1 测

**集成**:
- 手工:`bun run code-review`
- CI:PR 自动跑 + 报告 comment
- KAIROS:每日全量跑一次,差异推送

**编译开关**:`feature('CODE_REVIEW')`,默认 off

### 3.4 重构建议 (refactor-suggest) 详细设计

**输入**:`src/**/*.ts` 全量扫描
**输出**:Markdown 报告,3 类规则

**3 类规则**:
1. **L1/L2/L3 边界检查**
   - L1 (agent/) 不应 import L3 (coordinator/)
   - L2 (tools/) 不应 import L4 (bridge/)
   - 反向:L4 (bridge/) 不应被 L1 (agent/) 依赖
2. **capability-manifest 字段完整性**
   - 每个 CapabilityGroup 应有 `layer` / `featureGate` / `coachEnabled` / `markets` / `competitorRefs` 字段
3. **投研域特殊规则**
   - 任何 .ts 文件不应出现 `BUY` / `SELL` 硬编码建议关键词
   - 任何 output 应有风险提示

**实现**:
- `src/code-refactor/index.ts`
- `src/code-refactor/layer-boundary-checker.ts`
- `src/code-refactor/manifest-completeness-checker.ts`
- `src/code-refactor/investment-rules-checker.ts`
- `src/code-refactor/cli.ts`

**编译开关**:`feature('REFACTOR_SUGGEST')`,默认 off

### 3.5 测试生成 (test-coverage) 详细设计

**输入**:`src/**/*.ts` (源) + `src/**/*.test.ts` (测试)
**输出**:`docs/COVERAGE-GAP.md` + stub test templates

**分析**:
- 找到源文件,看有无 `*.test.ts` 兄弟
- 找现有 test 反推覆盖范围
- 计算覆盖率(行级,基于 import 追踪 + 函数计数)
- 列出 < 80% 覆盖的文件

**stub test 生成**:
- 用 LLM 或模板生成 `*.missing.test.ts`
- 模板:每个 export 函数 1 个 `test('fnName', () => { expect(true).toBe(true); })`

**实现**:
- `src/code-test-gen/index.ts`
- `src/code-test-gen/coverage-analyzer.ts`
- `src/code-test-gen/stub-generator.ts`
- `src/code-test-gen/cli.ts`
- `src/code-test-gen/ci-integration.ts` — Bun test 集成

**编译开关**:`feature('TEST_COVERAGE')`,默认 off

### 3.6 KAIROS 集成 (kairos-code-dream) 详细设计

**触发**:`src/kairos/code-dream.ts` 在 KAIROS 6 状态机的 `dream` 阶段被调用

**流程**:
1. KAIROS 每日 dream 触发(24h+ 5 会话阈值)
2. 跑 `code-archaeology`(全量)
3. 跑 `code-review`(全量)
4. 跑 `refactor-suggest`(全量)
5. 比对昨日 CODE-MAP,生成 diff
6. 写 `.upup/kairos/logs/YYYY/MM/YYYY-MM-DD-code-dream.md`
7. 推送(可选):`UPUP_CODE_DREAM_PUSH=true` 时推送到 5 渠道

**输出示例**:
```markdown
# Code Dream 2026-06-05

## 增量变化
- 新增 3 文件 (src/code-archaeology/{scanner,markdown-renderer}.ts)
- 删除 1 文件 (src/legacy/foo.ts)
- 修改 5 文件 (+127 / -45)

## 5 类问题(本次)
- dead code: 2 (warning)
- duplication: 0
- security: 0
- performance: 1 (info)
- style: 3 (info)

## 重构建议
- 边界违反: 0
- manifest 不完整: 0
- 投研域规则违反: 0
```

**实现**:
- `src/kairos/code-dream.ts` — KAIROS 集成入口
- `src/kairos/code-dream.test.ts`

**编译开关**:`feature('KAIROS_CODE_DREAM')`,默认 off

---

## 四、回测 + 交易全链路串通(v4 强化)

### 4.1 回测 5 步(已有,v4 拉入体系)

```
1. 数据: src/data/historical/{eod,intraday,fundamental,alt}.ts
   已有: realtime + financial_datasets + 同花顺 + 雪球
   v4 增量: 加 market=us/hk/crypto 显式参数

2. 策略: src/strategies/{factor,risk-parity,grid,momentum,dca,value,growth}.ts
   已有: 7 策略
   v4 增量: 加 4 行业策略(科技/消费/金融/医药)

3. 撮合: src/tools/trading/sandbox-engine.ts
   已有: 完整 sandbox(已 Sprint 1.5 完成)
   v4 增量: 加 4 broker 适配(IBKR/雪球/华泰/东财)

4. 归因: src/tools/portfolio/{brinson,style,sector,attribution}.ts
   已有: Brinson 3-factor + 风格 + 行业(16 文件)
   v4 增量: 加基准对比(沪深 300 / 标普 500 / 恒生)

5. 报告: src/multimodal/reports/{backtest,attribution,risk}.ts
   已有: 报告渲染(已有)
   v4 增量: 加 Coach 推送"今日回测报告"
```

### 4.2 交易 6 步(v4 拉入体系 + Coach 推送)

```
1. 策略: 从 backtest 拿(参数 + 标的列表)
2. 风控: src/tools/trading/risk-gate.ts
   已有: 仓位限额 + 行业暴露 + 集中度
   v4 增量: 加止损线 + 凯利公式

3. 下单: src/tools/trading/{pipeline,algos,brokers}.ts
   已有: 4 algo (TWAP/VWAP/POV/IS) + sandbox
   v4 增量: 加 4 broker 适配 + 实盘二次确认

4. 确认: src/tools/trading/approval.ts
   已有: 人工审批(默认)
   v4 增量: 加 UPUP_AUTO_TRADE=1 自动确认(配 UPUP_AUTO_TRADE_PIN)

5. 监控: src/kairos/position-monitor.ts
   已有: KAIROS 实时跟踪(异动 / 止损)
   v4 增量: 加止盈 + 风险预算监控

6. 复盘: src/tools/trading/review.ts
   已有: 交易日志 + 归因
   v4 增量: 加 Coach 推送"今日交易复盘"
```

### 4.3 编译开关完整化(feature-gates-v2 深化)

v2 已有 16+ 开关,v4 增到 50+:
```
# 投研域 (10+)
COACH_MODE / DEEP_PLAN / MORNING_BRIEF / EARNINGS_PREVIEW /
RISK_DASHBOARD / PORTFOLIO_REVIEW / WATCHLIST_EDIT /
REBALANCE_NOW / SCREEN / COMPARE

# KAIROS 域 (5+)
KAIROS / KAIROS_BRIEF / KAIROS_CHANNELS / KAIROS_DREAM /
KAIROS_CODE_DREAM (v4 新)

# Bridge 域 (5+)
BRIDGE_MODE / DAEMON / BRIDGE_WECHAT / BRIDGE_FEISHU /
BRIDGE_DINGTALK

# v4 代码分析 AI 域 (5+, v4 新)
CODE_ARCHAEOLOGY / CODE_REVIEW / REFACTOR_SUGGEST /
TEST_COVERAGE / KAIROS_CODE_DREAM

# 数据 + 多 Agent (10+)
COORDINATOR_MODE / COORDINATOR_V2 / TASK_RUNTIME /
WORKTREE_ISOLATION / RESEARCH_DEEP_SEARCH / MATRIX_ANALYSIS /
NL_SCREENER / INTENT_ROUTING_ZH / INSTITUTIONAL_FEED /
NORTH_BOUND / DRAGON_TIGER / REALTIME_EASTMONEY_PROD

# 交易域 (10+)
PAPER_TRADING / BACKTEST_V2 / RISK_CONTROL / POSITION_SIZING /
STOP_LOSS_AUTO / PORTFOLIO_REBALANCE / TRADE_ROUTING /
ORDER_TYPES_ADVANCED / MARGIN_TRADING / ALGO_TWAP / ALGO_VWAP /
ALGO_POV / ALGO_IS
```

合计 50+ 编译开关,全部走 v3 的 Positive ternary DCE pattern。

---

## 五、4 唯一差异化在 v4 的强化

### 5.1 D1 CLI-first:加 5 新命令(v4-6)

| 命令 | 功能 | 编译开关 |
|------|------|----------|
| `/competitive-scan` | 13 竞品矩阵实时扫描 + 异动告警 | `COMMAND_COMPETITIVE_SCAN` |
| `/code-review` | 当前 branch 5 类问题评审 | `COMMAND_CODE_REVIEW` |
| `/archaeology` | 生成 `docs/CODE-MAP.md` | `COMMAND_ARCHAEOLOGY` |
| `/refactor-suggest` | 5 layer 合规 + manifest 完整性 | `COMMAND_REFACTOR_SUGGEST` |
| `/test-coverage` | 覆盖率 gap + stub 生成 | `COMMAND_TEST_COVERAGE` |

### 5.2 D2 开源 + 自托管:不强求,v4 不动

### 5.3 D3 全市场:在 `capability-manifest.ts` `markets` 字段显式分 4 groups

```ts
// src/agent/capability-manifest.ts (v4 升级)
export interface CapabilityGroup {
  // v3 字段
  layer?: 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
  featureGate?: string;
  coachEnabled?: boolean;
  // v4 增量
  markets?: Array<'a-share' | 'us' | 'hk' | 'crypto'>;  // v3 已有
  competitorRefs?: string[];                              // v4 新
}
```

### 5.4 D4 三件套:在 `role-system.ts` 显式"投研 Claude Code 三件套"提示

```ts
// src/agent/role-system.ts (v4 升级)
const COACH_V4_SOLOGAN = `
你是"投研 Claude Code 三件套"主对话:
  1. 多 Agent (6 Worker: 基本面/技术/资金/情绪/政策/行业)
  2. KAIROS 6 状态机 (持续监控: 异动/财报/政策/行业/风险)
  3. Bridge (本地 CLI ↔ 网页 ↔ 微信/飞书/钉钉)
`;
```

---

## 六、5-8 Sprint 详细计划

### v4-Sprint 1: code-archaeology(0.3 turn)

- 1.1 `src/code-archaeology/{index,scanner,layer-detector,manifest-checker,orphan-finder,hot-spot-finder,markdown-renderer}.ts` 7 文件
- 1.2 `scripts/code-archaeology.ts` CLI 入口
- 1.3 `src/code-archaeology/*.test.ts` 8+ tests
- 1.4 在 `src/agent/feature-gates.ts` 注册 `CODE_ARCHAEOLOGY` flag
- 1.5 `bun run code-archaeology` → 生成 `docs/CODE-MAP.md`
- 1.6 typecheck + test 全绿

**交付**:`docs/CODE-MAP.md` (5-10K 字)+ 7 源文件

### v4-Sprint 2: competitive-positioning(0.3 turn)

- 2.1 `src/competitive-positioning/matrix.ts` — 13 竞品 7 维度评分
- 2.2 `src/competitive-positioning/4-uniques.ts` — 4 唯一量化证据
- 2.3 `src/competitive-positioning/decision-path.ts` — 4 类用户路径
- 2.4 `docs/COMPETITIVE.md` — 产品故事 doc
- 2.5 `src/competitive-positioning/index.ts` + 测试
- 2.6 在 `capability-manifest.ts` 加 `competitorRefs` 字段

**交付**:`docs/COMPETITIVE.md` (5-10K 字)+ 5 源文件

### v4-Sprint 3: code-review(0.4 turn)

- 3.1 `src/code-review/{index,diff-parser,report-renderer,cli}.ts` 4 文件
- 3.2 `src/code-review/detectors/{dead-code,duplication,security,performance,style}.ts` 5 检测器
- 3.3 `src/code-review/detectors/*.test.ts` 每检测器 3+ tests
- 3.4 在 `feature-gates.ts` 注册 `CODE_REVIEW` flag
- 3.5 `bun run code-review` → 报告 stdout

**交付**:`bun run code-review` CLI + 9 源文件

### v4-Sprint 4: refactor + test-coverage(0.4 turn)

- 4.1 `src/code-refactor/{index,layer-boundary-checker,manifest-completeness-checker,investment-rules-checker,cli}.ts` 5 文件
- 4.2 `src/code-test-gen/{index,coverage-analyzer,stub-generator,cli,ci-integration}.ts` 5 文件
- 4.3 `src/code-refactor/*.test.ts` + `src/code-test-gen/*.test.ts`
- 4.4 在 `feature-gates.ts` 注册 `REFACTOR_SUGGEST` + `TEST_COVERAGE` flag

**交付**:2 CLI + 10 源文件

### v4-Sprint 5: kairos-code-dream(0.2 turn)

- 5.1 `src/kairos/code-dream.ts` KAIROS 集成
- 5.2 `src/kairos/code-dream.test.ts`
- 5.3 在 `feature-gates.ts` 注册 `KAIROS_CODE_DREAM` flag

**交付**:`KAIROS_DREAM` 自动跑代码晨报

### v4-Sprint 6: cli-extension v4(0.3 turn)

- 6.1 `src/commands/{competitive-scan,code-review,archaeology,refactor-suggest,test-coverage}.tsx` 5 命令
- 6.2 每个命令 export `command: Command` + `feature` 字符串
- 6.3 集成到 `src/commands/index.ts` 中央注册表
- 6.4 `src/commands/cli-extension-v4.test.ts` 5+ tests per command

**交付**:5 新命令

### v4-Sprint 7: manifest `competitorRefs`(0.2 turn)

- 7.1 `src/agent/capability-manifest.ts` 字段扩展(向后兼容)
- 7.2 `src/agent/manifest-competitor-refs.test.ts` 兼容测试
- 7.3 更新 `src/agent/role-system.ts` 加 4 唯一口号

**交付**:manifest v4 字段

### v4-Sprint 8: archive v3(0.1 turn)

- 8.1 v3 7 sprint 全部落地后,`openspec archive top-tier-investment-claude-code`
- 8.2 v3 specs sync 到 `openspec/specs/`
- 8.3 v3 tasks 标记完成

**交付**:v3 archived

---

## 七、关键文件路径(实施时)

```
openspec/changes/top-tier-investment-claude-code-v4/
├── .openspec.yaml
├── proposal.md          (Why + What — 已写)
├── design.md            (How — 本文档)
├── specs/
│   ├── competitive-positioning/
│   │   └── spec.md
│   └── claude-code-code-analysis/
│       └── spec.md
└── tasks.md             (5-8 sprint 任务清单 — 待写)

src/
├── code-archaeology/    (v4 新, 8 文件)
├── code-review/         (v4 新, 9 文件)
├── code-refactor/       (v4 新, 5 文件)
├── code-test-gen/       (v4 新, 5 文件)
├── kairos/code-dream.ts (v4 新, KAIROS 集成)
├── competitive-positioning/ (v4 新, 4 文件)
├── commands/
│   ├── competitive-scan.tsx
│   ├── code-review.tsx
│   ├── archaeology.tsx
│   ├── refactor-suggest.tsx
│   └── test-coverage.tsx  (v4 新, 5 命令)
├── agent/
│   ├── capability-manifest.ts (升级,加 competitorRefs)
│   ├── role-system.ts        (升级,加 4 唯一口号)
│   └── feature-gates.ts      (升级,5 新 flag)
├── coach/
│   └── memory.ts              (升级,集成 code-dream 记忆)
└── kairos/                   (v4 升级,加 code-dream)

docs/
├── CODE-MAP.md          (v4 新, code-archaeology 自动生成)
└── COMPETITIVE.md       (v4 新, competitive-positioning 文档)
```

---

## 八、风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| v3 / v2 已落地 spec 测试基线退化 | 高 | 任何 v4 PR 必须 `bun test` + `bun run typecheck` 全绿 |
| 5 layer 边界检测误报 | 中 | 起始白名单(src/cli.tsx, src/index.tsx 等特殊),后续 fine-tune |
| 5 类 code review 误报 | 中 | 每个 detector 配 `disabledRules` 配置 + CI 自适应 |
| 13 竞品矩阵信息更新滞后 | 中 | 每 sprint 更新 + v4 release 时一次性 refresh |
| code-archaeology 大项目性能 | 中 | 增量扫描 + 缓存 .upup/archaeology-cache.json |
| 5 渠道 push 信息过载 | 中 | UPUP_CODE_DREAM_PUSH=false 默认关闭;用户主动开 |
| ts-morph 依赖 | 中 | 优先手写 AST 解析;实在不行再加 npm 依赖 |
| 4 唯一口号 prompt 改变 LLM 行为 | 中 | `UPUP_COACH_MODE=0` 软降级 + e2e 对比测试 |

---

## 九、与 v3 / v2 / v1 的关系

| 维度 | v1 | v2 | v3 | v4 |
|------|----|----|----|-----|
| 时间 | 2026.6.3 前 | 2026.6.3 | 2026.6.4 | 2026.6.4 起 |
| 定位 | 骨架 | 广度 (25 spec) | 深度 (5 layer + 7 隐藏) | 顶级 (2 新 + 4 唯一) |
| 新 spec | 11 | 25 | 5 | 2 |
| 深化 spec | 0 | 0 | 2 | 4 |
| 跨 8 大 sprint | - | - | 7 | 5-8 |
| 跨 turn | - | - | 1 turn (3 sprint) | 1-2 turn (5-8 sprint) |
| 输出 | 11 spec | 25 spec | 5 spec + 7 sprint | 2 spec + 5-8 sprint + 13 竞品 + docs |

**v4 = v3 续 + 2 个新维度,完全不破坏 v1/v2/v3**。
