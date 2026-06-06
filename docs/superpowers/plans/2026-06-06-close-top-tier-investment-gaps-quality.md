---
change: close-top-tier-investment-gaps
design-doc: docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md
base-ref: 21b5a397
---

# 实施计划: P2 quality pass — 复用 + 高内聚低耦合重构

> 上游任务: `openspec/changes/close-top-tier-investment-gaps/tasks.md` P2 段
> 起点: P2 已 ship(8 commits on `codex/close-top-tier-investment-gaps-impl` 头,含 P2.a 1-7 + P2.b.1-2 + P2 closeout docs)
> 目标: 2 commits, 跨 2 个 quality 重构, 对应设计文档 D-CTG-2 / D-CTG-7 / D-CTG-8 的"高内聚 / 低耦合"原则

## 任务边界

每个 commit 独立可 revert;`bun run typecheck` + `bun test` 在每个 commit 之后绿。

| # | Task | 范围 | 主要文件 |
|---|------|------|----------|
| 1 | **QP.a — StrategyStore 重构**(P2.a.4/P2.a.5 内部去重) | 抽出 `computeStrategyPrevHash`(static)+ `latestPerName(records?)`(instance);新增 `asMethodology(unknown): MethodologyDisclosure` narrowing helper;`upup-resources.ts` 两处 case 改用 `getLatest` + `latestPerName`;新增 6 个单测覆盖 hash 链 + 重复 name 合并 + 非法 methodology 拒绝 | `src/memory/strategy-store.ts`(refactor), `src/commands/investment/strategy.ts`(消除 4 次 `as Parameters<...>` cast), `src/mcp/upup-resources.ts`(消除内联 createHash + canonicalJson), `src/memory/strategy-store.test.ts`(扩展), `src/mcp/upup-resources.test.ts`(去重) |
| 2 | **QP.b — Bridge 重构**(P2.b.2 内部去重) | 抽出 `jsonResponse(status, body)`、`verifyBridgeToken(token, expectedSecret, auth)`、`SNAPSHOT_HANDLERS: Record<string, SnapshotHandler>` + `parseSnapshotPath()`;WS fetch handler 和 `handleSnapshot` 共享 `verifyBridgeToken`;`_internal.parseSnapshotPath` 导出供单测直击 | `src/bridge/server.ts`(refactor) |

## 复用优先检查(对应 design.md D-CTG-2 / D-CTG-7 / D-CTG-8)

- ✅ **QP.a** 把 `computeStrategyPrevHash` 提到静态方法 — 它本质是 `createHash(latest?.prevHash + canonicalJson(record))` 的纯函数,无 instance state,适合被 `sign()` / `verify()` 之外的工具(审计脚本、迁移脚本)复用
- ✅ **QP.a** 把 `latestPerName` 提到 instance 方法 — `upup-resources.ts` 的 `strategy-list` case 以前内联构建同名策略分组 Map,现在直接调 `store.latestPerName(records)`,避免 "内联分组逻辑" 在两处漂移
- ✅ **QP.a** `asMethodology` narrowing helper 替代 4 处 `as Parameters<typeof validateMethodology>[0]` cast — 之前每次调用都做一次 unsafe cast,集中后单点验证 + 测试覆盖
- ✅ **QP.b** `jsonResponse` 替代 6+ 处内联 `new Response(JSON.stringify(...), { headers: { 'content-type': ... } })` — 4 个 snapshot 状态码 (200/400/401/404/405/503) 全部走同一构造,header 不会漂移
- ✅ **QP.b** `verifyBridgeToken` 替代 WS 路径和 snapshot 路径的两份 verify + raw-secret fallback 重复 — 唯一真源;两条路径都 `audit('reject', { reason: v.reason })`,reason 来源一致
- ✅ **QP.b** `SNAPSHOT_HANDLERS: Record<string, SnapshotHandler>` 是 D-CTG-8 的延伸:Web 边界 lint 守"src/web/ 不能 import 业务",snapshot table 把"业务响应形态"集中到 bridge 层,新增 snapshot kind 不需要改 handleSnapshot 主体
- ✅ **QP.b** `_internal.parseSnapshotPath` 导出供单测 — 不需要 spin up `Bun.serve` 就能测 path 解析,这是高内聚(可单独推理) + 低耦合(不依赖 server 生命周期)的直接体现

## 不做的事(quality pass 的边界)

- 不重写 `StrategyStore` 持久化格式 — 链式 hash 的序列化是 P2.a.2 的设计决定,QP.a 只搬位置不动语义
- 不改 `validateMethodology` 4 项披露 — P2.a.6 已 ship,QP.a 只换 narrowing 写法,不动规则
- 不改 `handleSnapshot` 的 HTTP 行为 — 鉴权、状态码、audit log reason、JSON body 形态全保留(14/14 server.test.ts 绿)
- 不删 `BridgeAuth.issueToken` / `BridgeAuth.verifyToken` — QP.b 只抽出"shared auth model",底层签名 / 验签不变
- 不重命名 `dossiers?` 注入点 — `BridgeServerConfig.dossiers?` 是 P2.b.2 的设计,QP.b 保留
- 不动 `src/web/` 占位 + boundary lint(P2.b.1)— quality pass 的范围是 P2.b.2 内部
- 不为 P2.b.3+ 写代码 — Vite+React + WebSocket + Playwright E2E 已 scope-down deferred(见 tasks.md P2.b 实施记录)

## 关键决策(对应 design.md D-CTG 表的延伸)

| 决策 | 选择 | 理由 |
|------|------|------|
| `verifyBridgeToken` 失败 reason 来源 | 用 `v.reason ?? 'bad-token'`,WS 路径和 snapshot 路径一致 | audit log grep 不用分两条 case |
| `jsonResponse` 是否支持 `init.headers` 覆盖 | 不支持 — 当前所有调用方都用同一组 header,扩展点用 `new Response` 直接构造 | 保持 helper 单职责;YAGNI |
| `SNAPSHOT_HANDLERS` handler 签名 | `(id: string, deps: SnapshotDeps) => Response \| Promise<Response>` | id 已 parse 过,deps 只放 cfg + sync,handler 不直接读 URL |
| `parseSnapshotPath` 导出位置 | `export const _internal = { parseSnapshotPath }` 而不是单独 named export | 单点 export,避免测试 import 污染公共 API |
| `computeStrategyPrevHash` 静态 vs 实例 | 静态 — 不依赖 store state,纯函数 | 可被 sign 之外的工具复用;test 不用 mock store |
| `latestPerName` 静态 vs 实例 | 实例 — 接受可选 records 参数,默认 `this.list()` | caller 可以传已过滤的 records(性能 + 测试便利) |
| `asMethodology` 是否 throw | throw on invalid | publish path 之前会 `validateMethodology`,这里先 narrow 是为了让 cast 集中;非法数据 throw 比 silent wrong-type 安全 |

## 完成定义

- `bun run typecheck` 0 错
- `bun test` ≤ 23 fail(baseline, 0 新增回归)
- `src/bridge/server.test.ts` 14/14 绿
- 2 个 commit 后, `git log --oneline 21b5a397..HEAD` 列出 2 条新提交
- `tasks.md` P2 段实施记录追加 QP.a / QP.b 行
