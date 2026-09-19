---
change: close-top-tier-investment-gaps
design-doc: docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md
base-ref: 2ce84675a8be44a868d20863a067c648447d1ad5
---

# Plan: 实施 P0 速赢(close-top-tier-investment-gaps)

## 范围

只做 P0 阶段(5 个 commit),验证"复用优先"范式能 ship。
P1-P3 在后续 change 中实施,本计划不涉及。

## 复用锚点(强约束 — 不新建基础设施)

| 任务 | 新文件(若有) | 复用现有模块 |
|------|--------------|---------------|
| P0.1 引用归因 | `src/agent/citation.ts` | `prompts.ts` 注入约束;`capability-manifest.ts` 新增 citation group |
| P0.2 Dossier | `src/memory/dossier.ts` | `investment-memory.ts` JSONL 持久化;`investment-workflow.ts` 加 hook |
| P0.3 审计链 | `src/memory/audit-signing.ts` | `memory-audit.ts` ed25519 能力;`scratchpad.ts` 扩展 AuditRecord;`invest.ts` 拦截 BUY/SELL/COVER |
| P0.4 MCP 资源 | `src/mcp/upup-resources.ts` | `mcp/server.ts` 注册;`resource-tools.ts` list/读 |
| P0.5 `/dossier` | `src/commands/investment/dossier.ts` | `dossier.ts` 读;`registry.ts` 登记;`investment.test.ts` 扩 |

## 每个 commit 的验证

- `bun run typecheck` 0 错
- `bun test` 全绿(已有 + 新增)
- 单一职责,可独立 revert

## 任务清单

1. **P0.1** `src/agent/citation.ts` 创建 CitationRegistry;`prompts.ts` 注入引用约束;`capability-manifest.ts` 新增 citation group;新增测试
2. **P0.2** `src/memory/dossier.ts` 创建 Dossier 实体;`investment-memory.ts` 集成;`investment-workflow.ts` 加 pre/post hook;新增测试
3. **P0.3** `src/memory/audit-signing.ts` 创建 ed25519 签名;`scratchpad.ts` 加 AuditRecord;`invest.ts` 在 BUY/SELL/COVER emit 审计;新增测试
4. **P0.4** `src/mcp/upup-resources.ts` 创建 3 个资源 (dossier/audit/citations);`mcp/server.ts` 注册;`resource-tools.ts` 集成;新增测试
5. **P0.5** `src/commands/investment/dossier.ts` 创建 `/dossier <ticker>` 命令;`registry.ts` 登记;`investment.test.ts` 扩

## 完成定义

- 5 个 commit 全绿
