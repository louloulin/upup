---
comet_change: close-top-tier-investment-gaps
role: technical-design
canonical_spec: openspec
archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

# Technical Design: 补齐对标顶级投研助手的差距

> 上游事实源: `openspec/changes/close-top-tier-investment-gaps/{proposal,design,tasks}.md`
> 关联 design: `docs/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md`(v2 已定义 D12-D21 的基础设施层:coordinator V2 / bridge V2 / worktree / feature flags,本文档定义 D-CTG-1 ~ D-CTG-12 的差距层细节)
> 本文档聚焦"实现方案 / 技术风险 / 测试策略 / 边界条件",不复述 OpenSpec 的 why/what。

## D-CTG-1. 跨阶段 CI 门禁(强制)

每个 phase 完成 = 一次 OpenSpec change archive。CI 必须绿:

```bash
# 本地 + CI 必跑(不绿即拒绝 archive)
bun run typecheck
bun test
```

新增 evals 时额外跑:

```bash
bun run src/evals/run.ts --sample 10
```

**禁止的 shortcut**:
- 不允许 `--no-verify`
- 不允许 `test.skip` 绕开单测
- 不允许禁用 lint

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-2. Dossier 存储 schema(扩展 `investment-memory`)

**不新建 DB**,复用 `src/memory/investment-memory.ts` 现有实体 + `src/memory/memvid-rag.ts` RAG。

```ts
// src/memory/investment-memory.ts(扩展)
export interface Dossier<T = string> {
  ticker: T;
  snapshot: CompanySnapshot;        // name / sector / marketCap / 摘要
  metricsHistory: KvM[];            // 时间序列,append-only
  theses: Thesis[];                 // 历次研究论点,append-only
  watchTriggers: Trigger[];         // 盯盘触发器
  earningsCalls?: EarningsCall[];   // G3 复用,QoQ diff 依据
  freshnessTs: number;              // ms epoch
  versionHash: string;              // sha256 整个 dossier
}

export interface Thesis {
  id: string;                       // ulid
  createdTs: number;
  author: 'agent' | 'user';
  intent: string;                   // 原始 query
  claims: string[];                 // LLM 抽取的论点
  evidenceRefs: string[];           // [src:N] 引用,G1 复用
  confidence: number;               // 0-1
  auditRef?: string;                // C2 复用,ed25519 signature
}
```

**生命周期**:
- pre-phase hook 读 → 注入到 workflow context
- post-phase hook 写 → 追加 thesis + 更新 freshnessTs
- KAIROS proactive 监控 freshness > 30d → 告警

**版本控制**:`versionHash` 用 sha256(JSON.stringify(dossier, sorted-keys))。归档时只 append,不改历史。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-3. NL→FilterSpec 的 LLM 强约束 schema(G4)

**两段式防幻觉**:LLM 只能产出 typed schema,不能写 SQL/DSL。

```ts
// src/plan/filter-spec.ts(新文件,放 plan/ 既有目录下)
export interface FilterSpec {
  template?: 'AAPL-like' | 'momentum' | 'value' | string;  // 相似度参照
  universe: 'us' | 'cn' | 'hk' | 'crypto';
  filters: FilterClause[];
  sortBy?: SortKey;
  limit?: number;       // default 50, max 500
  realtime?: boolean;   // 是否拉日内行情过滤
}

export type FilterClause =
  | { field: string; op: '=' | '!=' | '>' | '<' | '>=' | '<='; value: Scalar }
  | { field: string; op: 'between'; value: [Scalar, Scalar] }
  | { field: string; op: 'in' | 'not-in'; value: Scalar[] };

// LLM 只能 emit 这个 schema;任何越界字段 → Zod validation fail → 重新 prompt
```

**`src/tools/screening/index.ts` 新工具 `nl_screen`**:

```ts
// 输入 = 自然语言
// 阶段 1: LLM 翻译 NL → FilterSpec(用 plan-builder 已有 NL→structured 链路)
// 阶段 2: 确定性执行 FilterSpec → 排序结果(纯代码,无 LLM)
// 阶段 3: 用 decision-dashboard 给每个结果附 1 句论点
const nlScreenTool = new DynamicStructuredTool({
  name: 'nl_screen',
  schema: z.object({
    query: z.string(),
    universe: z.enum(['us', 'cn', 'hk', 'crypto']).default('us'),
    limit: z.number().int().min(1).max(500).default(50),
    realtime: z.boolean().default(false),
  }),
  func: async ({ query, universe, limit, realtime }) => {
    const spec = await nlToFilterSpec(query, universe);  // LLM
    const results = await executeFilterSpec(spec, { realtime });  // 纯代码
    return results.slice(0, limit).map(r => ({
      ...r,
      thesis: await generateOneLineThesis(r),  // 复用 decision-dashboard
    }));
  },
});
```

**单测覆盖**:`8 个典型 NL + 3 个 eval case`,见 tasks.md P1.b.2。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-4. Citation registry 编号一致性(G1)

`[src:N]` 编号必须全 query 内全局唯一,顺序与出现顺序一致。

```ts
// src/tools/citation/registry.ts(新文件)
export class CitationRegistry {
  private refs: CitationRef[] = [];
  private byIndex = new Map<number, CitationRef>();

  add(ref: Omit<CitationRef, 'index'>): number {
    const index = this.refs.length + 1;  // 1-based
    const full: CitationRef = { ...ref, index };
    this.refs.push(full);
    this.byIndex.set(index, full);
    return index;
  }

  getMarkdownLink(index: number): string {
    const ref = this.byIndex.get(index);
    if (!ref) throw new Error(`Unknown citation [src:${index}]`);
    return `[${ref.snippet}](${ref.url})`;
  }

  toJSON() { return this.refs; }
}

export interface CitationRef {
  index: number;       // 1-based
  url: string;
  kind: 'filing' | 'news' | 'transcript' | 'tweet' | 'kb';
  offset?: number;     // 段落 / 行号
  snippet: string;
  ts: number;
}
```

**prompt 约束**(`src/agent/prompts.ts`):

```text
## Final Answer Constraints
- Every factual claim MUST cite a [src:N] reference.
- Maximum citation density: 1 citation per 60 tokens.
- Use the citation registry passed in context; do not invent [src:N] numbers.
- Render citations as inline markdown links via registry.getMarkdownLink(N).
```

**密度上限校验**:在 evals 加 `citation-density.test.ts`,跑 20 个真实 query,断言 (citations / tokens) ≤ 1/60。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-5. 引用 kind 映射规则(G1 数据流)

| 工具返回的 `kind` | 来源 | 引用 URL 模板 | 段落锚点 |
|---|---|---|---|
| `filing` | `tools/finance/read-filings.ts` | `https://www.sec.gov/Archives/.../{accession}` | `#{paragraph-id}` |
| `news` | `tools/finance/news.ts` 或 search | 原文 URL | 段落哈希 |
| `transcript` | `tools/finance/read-filings.ts` 8-K | 8-K URL | `#{turn-id}` |
| `tweet` | `tools/search/x-search.ts` | `https://x.com/{handle}/status/{id}` | 无 |
| `kb` | `memory/investment-memory` 历史 dossier | `upup://dossier/{ticker}#{thesis-id}` | `#{thesis-id}` |

**所有工具返回必须扩展为**:
```ts
interface ToolResultWithCitations<T> {
  data: T;
  citations: Omit<CitationRef, 'index'>[];  // 由 registry 编号
}
```

**改造点**:`tools/finance/{news,read-filings,earnings}.ts` + `tools/search/{exa,tavily,x-search,perplexity}.ts` 全部扩展(单测覆盖)。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-6. Subagent 3-worker isolation 协议(G3)

复用 v2 design 的 Worker XML 协议(`2026-06-04-top-tier-investment-assistant-v2-design.md` D15),不重新发明。

```ts
// src/agent/subagent.ts(扩展 manager API)
export interface EarningsPreviewSpec {
  ticker: string;
  scheduledAt: number;     // 财报时间
  mode: 'pre' | 'post';    // pre = 预告, post = 底稿
}

export async function runEarningsPreview(
  spec: EarningsPreviewSpec,
  scratchpad: Scratchpad,
): Promise<EarningsPreviewResult> {
  const [analyst, sentiment, transcript] = await Promise.all([
    spawnWorker('analyst', spec, scratchpad, { isolation: 'none' }),
    spawnWorker('sentiment', spec, scratchpad, { isolation: 'none' }),
    spawnWorker('transcript', spec, scratchpad, { isolation: 'worktree' }),  // 8-K 文件下载隔离
  ]);

  return synthesizeEarningsPreview({ analyst, sentiment, transcript });
}
```

**worker XML 协议**(复用 v2 D15):
```xml
<task-notification>
  <task-id>upup-agent-analyst-{uuid}</task-id>
  <worker-type>analyst</worker-type>
  <status>completed</status>
  <result>
    <ticker>600519.SH</ticker>
    <verdict>BEAT_EXPECTATIONS</verdict>
    <metrics>{"revenue_actual": 124.5e9, "revenue_consensus": 121.0e9}</metrics>
    <evidence>
      <source url="..." timestamp="...">2025 Q3 营收超预期 2.9%</source>
    </evidence>
  </result>
  <notes>Q4 季报未发布</notes>
</task-notification>
```

**失败语义**:
- 1 个 worker 失败 → 降级为 2 worker 结果 + UI 标注"transcript unavailable"
- 2 个 worker 失败 → 整个 preview 标 `partial`,KAIROS 重试一次
- 3 个 worker 失败 → 标 `failed`,不写入 dossier

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-7. 审计链 ed25519 签名(C2)

复用 `src/memory/encrypted-store.ts` 的 ed25519 能力,不引入新密码学库。

```ts
// src/agent/scratchpad.ts(扩展 AuditRecord 类型)
export interface AuditRecord {
  id: string;                 // ulid
  intentId: string;           // 命令 + ticker + action
  ts: number;
  author: 'agent' | 'user';
  ticker?: string;
  action: 'BUY' | 'SELL' | 'COVER' | 'HOLD' | 'CANCEL';
  evidenceRefs: string[];     // [src:N] 引用
  agentChain: Array<{         // 完整 Agent 决策链
    agentId: string;
    toolCalls: string[];
    modelVersion: string;
  }>;
  payload: string;            // canonical JSON
  signature: string;          // ed25519 over payload
  prevHash: string;           // 链式,前一条 audit 的 sha256
}

export async function signAuditRecord(
  rec: Omit<AuditRecord, 'signature' | 'prevHash'>,
  signer: ed25519Key,
  prevHash: string,
): Promise<AuditRecord> {
  const payload = canonicalJson(rec);
  const signature = await ed25519Sign(payload, signer);
  return { ...rec, payload, signature, prevHash };
}

export async function verifyAuditChain(
  records: AuditRecord[],
  publicKey: ed25519PublicKey,
): Promise<{ valid: boolean; brokenAt?: number }> {
  // 验证每条 record 的 signature + prevHash 链
  ...
}
```

**不可篡改保证**:
- 物理上,审计链只在 `src/memory/encrypted-store.ts` 的 append-only log 里
- 逻辑上,每条 record 的 signature + prevHash 双重校验
- 测试:`memory-audit.test.ts` 已有 ed25519 基础,P3.b 加 `audit-chain-tamper.test.ts`

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-8. Web UI 严格边界(C3)

`src/web/**` 必须**只**通过 `src/bridge/server.ts` 的 read-only JSON snapshot 端点读数据,不允许 import 业务模块。

```ts
// scripts/lint-web-boundary.sh(新增, CI 跑)
#!/bin/bash
set -e
WEB_DIR="src/web"

# 1. 禁止 import 业务模块
FORBIDDEN_PATTERNS=(
  "src/agent/"
  "src/tools/"
  "src/skills/"
  "src/memory/"
  "src/realtime/"
  "src/kairos/"
  "src/coordinator/"
  "src/plan/"
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  if grep -rn "from ['\"]\\.\\./\\.\\./$pattern\\|from ['\"]@upup/$pattern" "$WEB_DIR" 2>/dev/null; then
    echo "ERROR: src/web/** imports forbidden module pattern: $pattern" >&2
    exit 1
  fi
done

# 2. 允许 import 的白名单
ALLOWED_PATTERNS=(
  "src/bridge/"
  "react"
  "react-dom"
)

echo "✓ src/web/ boundary lint passed"
```

**CI 集成**:`.github/workflows/ci.yml` 加一步 `bash scripts/lint-web-boundary.sh` 在 `bun test` 之前。

**违规用例测试**:`web-boundary.test.ts` 故意写一行违规 import,断言 lint 报错。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-9. 测试策略(分类 + 覆盖率)

| 类别 | 工具 | 触发时机 | 覆盖率目标 |
|------|------|----------|-----------|
| **单元** | `bun test` | 每个 commit | 改动的工具函数 ≥ 90% |
| **集成** | `bun test src/evals` | 每个 P 阶段结束 | 5 个 gap 至少 5 个 e2e case |
| **e2e** | Playwright(仅 P2.b C3 Web) | P2.b 完成时 | 3 个页面截图 + 交互流 |
| **evals** | `src/evals/run.ts --sample N` | 每个 P 阶段 | 引用密度 / NL 准确率 / QoQ diff 正确性 |
| **回归** | `bun test`(已有 ~4447 个) | 每个 commit | 不能破 |

**Mock vs Real**:
- LLM 调用一律 mock(用 `src/agent/__fixtures__/` 录制的真实响应)
- 工具调用 mock + 真实混合(关键工具用真实,边缘工具用 mock)
- DB / 文件系统用 in-memory 实现

**新增 fixture 目录**:
```
src/evals/fixtures/
├── g1_citations/        # 引用归因的 20 个真实 query + 期望引用
├── g2_dossier/          # dossier 生命周期 10 个 case
├── g3_earnings/         # 业绩预告 5 个 case(pre + post)
├── g4_nl_screen/        # NL 选股 8 个典型 NL
└── g5_strategy/         # 策略回测 5 个 case
```

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-10. 性能预算(p50 / p99)

| 操作 | p50 | p99 | 备注 |
|------|-----|-----|------|
| 引用 lookup(G1) | <50ms | <200ms | 内存表,无 IO |
| Dossier 读(G2) | <100ms | <300ms | JSON 反序列化 |
| Dossier 写(G2) | <200ms | <500ms | 含 versionHash 计算 |
| Earnings preview(G3) | <20s | <45s | 3 worker 并行,含 LLM |
| NL→FilterSpec(G4) | <1.5s | <4s | 单次 LLM 调用 |
| FilterSpec 执行(G4) | <500ms | <2s | 纯 DB 查询 |
| Strategy 执行(G5) | <60s | <180s | worktree 隔离 + 沙箱 |
| Web snapshot 端点(C3) | <50ms | <150ms | 内存快照 |

**测量**:`src/telemetry/` 加 `perf-budget.test.ts`,每个 P 阶段跑一次,断言 p50/p99 不超预算。

**超预算处理**:P1 / P2 阶段任一超预算 → 阻塞 archive,必须先优化或调预算(调预算要更新本文档)。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-11. 可观测性(metrics / logs / traces)

**Metrics**(`src/telemetry/metrics.ts` 扩展):
- `tool_call_total{tool, status}` Counter
- `tool_call_duration_ms{tool}` Histogram
- `citation_density{query_id}` Gauge
- `dossier_freshness_days{ticker}` Gauge
- `nl_screen_filter_clauses{count}` Histogram
- `strategy_execution_duration_ms` Histogram

**Logs**(`src/utils/logging/logger.ts` 扩展):
- 所有工具调用: `info(tool, ticker, duration_ms, status)`
- 审计记录 emit: `info(audit, intent_id, signature_short, action)`
- Dossier 写: `info(dossier_write, ticker, theses_added, version_hash_short)`

**Traces**(LangSmith,已配置 `LANGSMITH_API_KEY`):
- 每个 P 阶段起一个 trace
- 每个工具调用 + LLM 调用是 trace 的 span
- trace_id 写入 dossier 关联

**Sampling**:
- Dev: 100%
- Prod: 10% by default;BUY/SELL/COVER 100%(合规要求)

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## D-CTG-12. 灰度 / 迁移策略

每个 P 阶段 = 1 个 OpenSpec change,自带 feature flag + 灰度:

| 阶段 | Feature Flag | 灰度节奏 | 回滚 |
|------|-------------|----------|------|
| P0 G1 | `BUN_CONFIG_FEATURE_UPUP_CITATION_V1` | dev(1 周) → canary(10%) → 100% | 关闭 flag 即可 |
| P0 G2 | `BUN_CONFIG_FEATURE_UPUP_DOSSIER_V1` | dev → canary → 100% | 同上 |
| P0 C2 | `BUN_CONFIG_FEATURE_UPUP_AUDIT_V1` | dev → 100%(合规要求) | 关闭即停写,但历史链不动 |
| P1 G3 | `BUN_CONFIG_FEATURE_UPUP_EARNINGS_PREVIEW_V2` | dev → canary → 100% | 同 P0 |
| P1 G4 | `BUN_CONFIG_FEATURE_UPUP_NL_SCREEN_V1` | dev → canary → 100% | 同 P0 |
| P2 G5 | `BUN_CONFIG_FEATURE_UPUP_STRATEGY_MARKET_V1` | dev(2 周) → canary → 100%(安全敏感) | 同 P0 |
| P2 C3 | `BUN_CONFIG_FEATURE_UPUP_WEB_V1` | dev(2 周) → canary → 100% | 同 P0 |
| P3 C1 | `BUN_CONFIG_FEATURE_UPUP_LOCALE_V1` | dev → canary → 100% | 同 P0 |

**Backward compatibility**:
- 关闭 flag → 旧行为完全保留
- 工具函数签名扩展(可选项)→ 用 TypeScript optional, 不破坏现有 caller
- 新增的 MCP resource → 旧 client 忽略即可

**Rollout checklist**:
- [ ] 单元测试 ≥ 90% 覆盖
- [ ] evals 全绿
- [ ] 性能预算满足 D-CTG-10
- [ ] docs/CHANGELOG.md 写入用户可见变化
- [ ] README 给出开关说明

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## Spec Patches(回写 OpenSpec delta spec)

**无**。本 change 显式声明"无 capability 变化",后续 4 个实现 change 会各自声明自己的 capability,届时再回写 `specs/<capability>/spec.md`。

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## 风险矩阵(本设计层)

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| LLM 翻译 NL→FilterSpec 越界(Zod fail) | 中 | 中 | D-CTG-3 强约束 schema + 8 单测 |
| 引用密度上限过严导致答案可读性下降 | 中 | 低 | D-CTG-4 调密度 + evals 监控 |
| 3-worker 并行 worktree 隔离泄漏 | 低 | 高 | D-CTG-6 `isolation: worktree` + 并发单测 |
| ed25519 密钥泄露 | 极低 | 高 | 密钥从 `encrypted-store` 派生,不直接持久 |
| Web 边界 lint 误报 | 中 | 低 | 白名单 + 违规用例测试 |
| 性能预算被突破 | 中 | 中 | `perf-budget.test.ts` 阻塞 archive |
| feature flag 命名冲突(已有 `BUN_CONFIG_FEATURE_UPUP_*`) | 中 | 低 | D-CTG-12 命名对齐现有 v2 flag 风格 |
| `docs/superpowers/specs/` 目录不存在 → Design Doc 写失败 | 0 | - | 已确认存在(2 个 v1/v2 design) |

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## 关键设计决策小结(便于 Step 1c 用户确认)

| 决策 | 选择 | 理由 |
|------|------|------|
| 持久化层 | 扩展 `investment-memory`,不新建 DB | D-CTG-2;保持高内聚 |
| NL→spec 强约束 | LLM 只能 emit typed schema,不能写 SQL | D-CTG-3;防幻觉 |
| 引用上限 | ≤ 1 引用 / 60 tokens | D-CTG-4;不污染答案 |
| 3-worker isolation | `worktree` 仅给 transcript worker(8-K 下载) | D-CTG-6;最小爆炸面 |
| 审计签名 | ed25519 复用 `encrypted-store` | D-CTG-7;不引入新密码学 |
| Web 边界 | CI lint 强制 `src/web/**` 不 import 业务 | D-CTG-8;架构守门员 |
| 性能预算 | 8 项 p50/p99 显式 | D-CTG-10;阻塞 archive |
| 灰度节奏 | 8 个 feature flag 各自 dev→canary→100% | D-CTG-12;对齐 v2 风格 |

archived-with: 2026-06-06-close-top-tier-investment-gaps
status: final
---

## 附录 B — 审计链威胁模型(对应 C2 / D-CTG-7 / P3.b)

> 6 项威胁 + 对应护栏 + 测试 ID。`audit-signing.ts` 是 ed25519 + prevHash 链的单一真源,`memory-audit.ts` 提供文件系统级 append-only 落地。两者组合是 D-CTG-7 "不引入新密码学, 复用 node:crypto" 的实现载体。

### 威胁清单

| ID | 威胁 | 攻击向量 | 护栏(实现) | 测试 ID |
|----|------|----------|------------|---------|
| **B.1** | ed25519 私钥泄露 | 进程内存 dump / 反编译 / `.env` 泄漏 | 密钥从 `src/memory/encrypted-store.ts` 派生, 不直接持久到 `.upup/`;运行时只在 `KeyObject` 里 | `audit-signing.test.ts` › `key rotation: inMemory chains with distinct keys fail cross-verify` |
| **B.2** | 审计记录字段篡改 | 改 `action` / `intentId` / `ts` 后重写文件 | `audit-signing.ts` 用 `sign(secretKey, canonicalJson(record without sig/prevHash))` 签名;`verify()` 失败时 `AuditVerifyResult.valid = false` | `audit-signing.test.ts` › `tampering with action field breaks signature` |
| **B.3** | 审计记录删除 | `rm` 删中间一条 / 截断文件 | `prevHash = sha256(上一条 record 的 canonicalJson)`, 删除后第 N+1 条的 `prevHash` 与文件实际不匹配 | `audit-signing.test.ts` › `deleting a record breaks prevHash chain` |
| **B.4** | 审计记录重排 | 调换两条的顺序 | 同 B.3, 链式 hash 依赖顺序, 重排后 `prevHash` 全部错位 | `audit-signing.test.ts` › `reordering records breaks chain` |
| **B.5** | 公开 API 暴露 edit/delete/overwrite | 调用方拿到 `AuditChain` 实例后误调 `update` / `remove` | `AuditChain` 公开 API 表面只有 `append / list / getByIntent / verify`;`test` 用 `expect(Object.keys(chain)).not.toContain('update')` 守住 | `audit-signing.test.ts` › `public API does not expose edit / delete / overwrite methods` |
| **B.6** | 文件系统层破坏(覆盖写) | 攻击者拿到文件读写权限, 直接覆盖 `.upup/audit-chain.jsonl` | `memory-audit.ts` 用 `appendFileSync` 写 + 物理路径固定;破坏后 `verify()` 失败 + `reload from disk` 重新加载可检测 | `audit-signing.test.ts` › `reload from disk restores chain` + `memory-audit.test.ts` › `logRead/logSearch/logWrite/logUpdate/logDelete` 5 个写入路径 |

### 不在威胁模型内(显式接受风险)

- **B.7 时钟回拨** — `ts` 字段由调用方提供, 不强制 monotonic。理由: 多设备同步下 NTP 校时是基础设施责任, 不是审计层;若需要 monotonic, 上层在 `intentId` 里强制 server-assigned id 即可
- **B.8 重复使用 intent id** — `intentId` 不强制 unique, 同一 intent 可以记录多次修订。理由: 投资意图本身会演化(BUY → SELL → CANCEL 是正常路径), 不应被 unique 约束挡住;链式 hash 已经隐含版本顺序
- **B.9 进程崩溃中途写入** — `appendFileSync` 是 POSIX atomic append, 单条 record 要么完整要么没有, 不会出现"半条 record"留下;崩溃后的 verify 会失败, 调用方应清空并重新 append

### 复用 + 单一真源

- `audit-signing.ts` 是 ed25519 + prevHash 链的**唯一**真源(D-CTG-7);`encrypted-store.ts` 不重做签名, 只做 payload AES-256-GCM 加密
- `memory-audit.ts` 的文件系统 append-only 是 `audit-signing.ts` 的**持久化**载体, 不是替代
- `upup://audit/{intent-id}` MCP 资源(若未来加入)只读 `AuditChain.list()` + `getByIntent()`, 不引入新签名

### 验证流程(投资合规审计)

```
1. audit verify <file>        # 全链 verify
2. audit list --intent <id>    # 单 intent 历史
3. audit tail -n 10            # 最近 10 条
4. 任意一条 verify.valid=false → 全链不可信, 触发告警
```

实现见 `src/memory/audit-signing.ts` `verifyAll()` / `list()` / `getByIntent()`;CLI 入口可在后续 change 加 `bin/upup-audit.ts`, 当前 change 不开新命令面。
