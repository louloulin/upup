---
change: close-top-tier-investment-gaps
design-doc: docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md
base-ref: c0cfb177
---

# 实施计划: P1.a — G3 业绩预告 + 财报会 diff

> 上游任务: `openspec/changes/close-top-tier-investment-gaps/tasks.md` P1.a 段
> 起点: P0 已 ship(7 commits on `codex/close-top-tier-investment-gaps-impl` 头)
> 目标: 6 commits, 跨 6 个 P1.a 子任务, 保持 P0 复用范式

## 任务边界

每个 commit 独立可 revert;`bun run typecheck` + `bun test` 在每个 commit 之后绿。

| # | Task | 范围 | 主要文件 |
|---|------|------|----------|
| 1 | **P1.a.5** | `upup://earnings-preview/{ticker}` 资源 + `/earnings` alias + `EarningsPreview` 数据类型 | `src/commands/investment/earnings-preview.ts`(refactor), `src/mcp/upup-resources.ts`(扩展), `src/commands/investment/registry.ts`(alias), 2 test files |
| 2 | **P1.a.1** | 数据层: estimates + x-search + 8-K earnings_transcript | `src/search/x-search.ts`(新), `src/commands/investment/earnings-preview.ts` 接入, `src/tools/finance/read-filings.ts` 加 `earnings_transcript` kind |
| 3 | **P1.a.2** | 3-worker 并行 manager(analyst/sentiment/transcript) | `src/agent/subagent.ts` 加 `runEarningsPreview3W()`, 扩展 `subagent-parallel.test.ts` |
| 4 | **P1.a.3** | T-7d 财报前触发器 | `src/kairos/scanner.ts` 新增 `EarningsCalendarSource` 接口, scanner 检测 T-7d |
| 5 | **P1.a.4** | `diff_against_prior_call` + 写入 dossier.earningsCalls[] | `src/commands/investment/earnings-preview.ts` 输出 diff, `src/memory/dossier.ts` appendEarningsCall, 集成在 post-phase |
| 6 | **P1.a.6** | 单测 + evals 收尾, typecheck/test 全绿 | test 调整 + 文档 follow-up |

## 复用优先检查

- ✅ `EarningsPreview` 数据类型: 不新建 ORM/DTO, 纯 TS interface, 序列化直接 JSON.stringify 给 MCP 资源
- ✅ `buildEarningsPreview(ticker)`: 复用 `buildResearchPlan` + `loadPlan` + `PLANS_DIR`
- ✅ MCP 资源: 完全复用 P0.4 `upup-resources.ts` 的 parseUpupUri / listUpupResourceTemplates 模式
- ✅ `x-search.ts`: 与 `exa` / `tavily` 同级(在 `src/search/`), 暂以 mock 形式给出(等真实 Twitter API)
- ✅ 8-K transcript: 复用 `read-filings.ts` 的 plan→step2 工具链, 新增 `earnings_transcript` resource kind
- ✅ 3-worker manager: 复用 v2 design D15 的 worker XML 协议(注: 实际目前没有 worktree 隔离, 用并发 Promise.all 即可)
- ✅ T-7d 触发器: 复用 KAIROS scanner 的 ScanSymbol 模式, 注入 mock 财报日历
- ✅ diff: 复用 dossier.ts 的 `EarningsCallNote` + `versionHash` 链

## 不做的事

- 不新建数据库 / 文件目录
- 不引入新依赖
- 不重写 earnings-preview.ts 的 UI(只增加字段, 渲染风格不变)
- 不在 src/ 下新建顶层目录
- 不发 API key / 网络请求(全部 mock / noop)

## 完成定义

- `bun run typecheck` 0 错
- `bun test` 不引入新失败(允许 16 pre-existing 失败不变)
- 每个 commit 有对应 test(单测或测试扩展)
- 6 个 commit 后, `git log --oneline c0cfb177..HEAD` 列出 6 条新提交
