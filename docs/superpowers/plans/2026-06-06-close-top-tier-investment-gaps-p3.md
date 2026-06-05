---
change: close-top-tier-investment-gaps
design-doc: docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md
base-ref: bff212b4
---

# 实施计划: P3 — 横切加固(C1 双语 + C2 审计 + KAIROS 过期告警)

> 上游任务: `openspec/changes/close-top-tier-investment-gaps/tasks.md` P3 段
> 起点: P2 quality pass 已 ship(3 commits on `codex/close-top-tier-investment-gaps-impl` 头)
> 目标: 3 commits, 跨 3 个 gap, 严格复用 P2 已 ship 的 `t()` / `audit-signing` / `memory-audit` / `proactive.ts` + `investment-status-line.ts`

## 现状审计(2026-06-06)

tasks.md 把 P3 全标 `[ ]`, 但代码与测试已在多次 commit 中 ship, 只是没回写勾选 + 没回写实施记录。下面是 ground truth:

| 任务 | tasks.md | 代码 | 测试 | 状态 |
|------|----------|------|------|------|
| **P3.a.1** `src/agent/locale.ts` | [ ] | ✓ 78L, `getLocale` / `formatPrompt` / `normalizeLocale` | 13 tests 绿 | **shipped** |
| **P3.a.2** skill locale lint + zh-CN | [ ] | ✓ `scripts/lint-skill-locale.sh` | 50/50 SKILL.md 有 zh-CN | **shipped** |
| **P3.a.3** components 全面 i18n | [ ] | ⚠️ 只 `intro.ts` + `status-hint.ts` 接 `t()`, 5 个 components 仍硬编码英文 | — | **gap** |
| **P3.a.4** `src/i18n/` 抽出 | [ ] | ✓ `strings.ts`(EN + zh-CN) + `index.ts`(re-export) | 8 tests 绿 | **shipped** |
| **P3.a.5** i18n/locale 测试 | [ ] | ✓ | 21/21 pass | **shipped** |
| **P3.b.1** `stale_dossier` 告警 | [ ] | ✓ `proactive.ts` line 32-180 + `investment-status-line.ts` line 60-132 | 20 tests 绿 | **shipped** |
| **P3.b.2** 审计链 ed25519 + 威胁模型 | [ ] | ✓ `audit-signing.ts` (ed25519 + prevHash) + `memory-audit.ts` (fs append) + 篡改/删除/重排测试 5 个 | 14+ tests 绿 | **shipped, 但 design.md 附录 B 威胁模型缺失** |
| **P3.b.3** 回归测试(引用密度 / 审计 / 过期) | [ ] | ⚠️ `scratchpad.test.ts` + `proactive.test.ts` 有, `citation-density.test.ts` 缺 | — | **gap** |

**P2 quality pass 之后的 3 个真实 gap**:

1. **P3.a.3** components 硬编码英文(`approval-prompt.ts` / `chat-log.ts` / `select-list.ts` / `tool-event.ts` / `working-indicator.ts`)
2. **P3.b.2 附录 B** design.md 缺威胁模型章节,code 已 ship 但 design.md 没补
3. **P3.b.3** `src/evals/citation-density.test.ts` 缺(D-CTG-4 1 cite / 60 tokens 上限的回归)

## 任务边界

3 commits, 1:1 对应上述 3 个 gap, 每个独立可 revert, `bun run typecheck` + `bun test` 在每个 commit 之后绿。

| # | Task | 范围 | 主要文件 |
|---|------|------|----------|
| 1 | **P3.a.3 — components i18n sweep** | 5 个 components 全面接入 `t()`;`strings.ts` 加 ~12 个新 key(EN + zh-CN 对称);新增 i18n symmetry 测试覆盖新 key | `src/i18n/strings.ts`(扩展), `src/components/approval-prompt.ts`, `src/components/chat-log.ts`, `src/components/select-list.ts`, `src/components/tool-event.ts`, `src/components/working-indicator.ts`, `src/i18n/strings.test.ts`(+N tests) |
| 2 | **P3.b.2 — Appendix B 威胁模型** | design.md 末尾追加"附录 B 威胁模型"章节, 列出 6 项威胁 + 缓解 + 对应 `audit-signing` 提供的护栏 | `docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md`(纯文档) |
| 3 | **P3.b.3 — citation density 回归测试** | `src/evals/citation-density.test.ts` 新增, 跑 20 个 mock query(走 prompt builder + mock LLM), 断言 `(citations / tokens) ≤ 1/60` | `src/evals/citation-density.test.ts`(新), `src/evals/dataset/finance_agent.csv`(用现有 20 个 query) |

## 复用优先检查(对应 design.md D-CTG-1/2/3/4/7/8)

- ✅ **P3.a.3** 复用 `t(key, locale?)` 单一入口(`src/i18n/index.ts`)— 不再内联中英文字符串, 不引第三方 i18n 库(date-fns / i18next), 保持 hermetic 测试
- ✅ **P3.a.3** 新 key 必须 EN + zh-CN 对称, 触发 `i18n symmetry` tests(`src/i18n/strings.test.ts` line 56-78)— 漏 zh-CN 测试 fail
- ✅ **P3.b.2** `audit-signing.ts` 14 tests 已覆盖篡改/删除/重排/密钥轮换/append-only API 表面 — design.md 附录 B 只需**引用**已有护栏, 不重写代码
- ✅ **P3.b.2** `memory-audit.ts` 9 tests 已覆盖读/写/搜索/更新/删除的审计写入 + 单例
- ✅ **P3.b.3** 复用 `src/evals/dataset/finance_agent.csv` 现有 20 个 query(D-CTG-4 设计要求)— 不新建 fixture
- ✅ **P3.b.3** 复用 `buildSystemPrompt` + `getLocale`(`src/agent/prompts.ts` 已接)— 走 prompt builder 路径, 不另起 mock LLM stub
- ✅ **P3.b.3** 引用密度算法: `count_citation_markers(text) / token_count(text)`, token 化复用 `src/utils/token-estimation.ts` 已有 `countTokens`

## 不做的事(P3 plan 的边界)

- 不重写 `audit-signing.ts` — 14 tests 已 ship, 附录 B 只补 design.md
- 不为 `encrypted-store.ts` 单独加 ed25519 — `audit-signing.ts` 是 D-CTG-7 单一 ed25519 真源, encrypted-store 只管 AES-256-GCM payload 加密
- 不改 `prompts.ts` 的 `citation_density` 字符串 — 已 EN + zh-CN 对称
- 不重写 `select-list.ts` 渲染层 — 只换硬编码字符串, 不动 focus / selection 逻辑
- 不在 `src/i18n/` 引入新文件 — 扩展现有 `strings.ts`, 新 key 走统一登记
- 不动 `BorderBox.ts` / `debug-panel.ts` / `custom-editor.ts` / `user-query.ts` — 这些没有 user-visible 硬编码英文字符串(扫描确认)
- 不为 P3.b.3 跑真 LLM — 用 `buildSystemPrompt` 走 prompt path, 引用标记从 query metadata 注入

## 关键决策(对应 design.md D-CTG 表的延伸)

| 决策 | 选择 | 理由 |
|------|------|------|
| i18n key 命名空间 | 沿用现有 `intro.*` / `hint.*` / `status.*` / `prompt.*` 4 个 namespace, 新 key 用 `ui.*` 或 `approval.*` 等语义 namespace | 不创造新约定, 旧 reviewer 心智成本 = 0 |
| `select-list.ts` "Untitled" 兜底 | 新 key `ui.untitled`, EN "Untitled" / zh-CN "未命名" | 与产品保持一致(其他空状态用"未"开头) |
| 引用密度 token 计数 | 复用 `countTokens`(BPE-lite),不引 tiktoken | hermetic, no network, 与现有 `src/utils/token-estimation.ts` 同源 |
| 引用密度测试 mock 策略 | 走 `buildSystemPrompt(query, mockCitations)`,citation 数量从 query metadata 取,不 mock 整个 LLM | 测的是"prompt 模板在引用 N 时的密度",不测 LLM 输出 |
| design.md 附录 B 位置 | 紧跟"风险矩阵"之后(原 design.md 末尾),用 `##` 二级标题 | 与设计文档"风险 → 缓解 → 附录"的逻辑顺序一致 |
| Appendix B 包含内容 | 6 项威胁(密钥泄露 / 日志篡改 / 重复使用 intent id / 时钟回拨 / 文件系统破坏 / API 滥用)+ 对应 audit-signing 护栏 + 测试 ID | 足够 1 页;超出 P3 范围(D-CTG-7 已定 1 个 ed25519 真源) |
| 不做 cite token-counter | 1 cite 视为 1 token (`[1]` 1 char), density = `cite_count / total_tokens` | 与 D-CTG-4 "1 citation per 60 tokens" 的口径一致 |

## 完成定义

- `bun run typecheck` 0 错
- `bun test` ≤ 23 fail(baseline, 0 新增回归)
- `src/i18n/strings.test.ts` i18n symmetry tests 全绿(新 key 必须 EN + zh-CN)
- `src/agent/locale.test.ts` 13/13 绿
- `src/components/investment-status-line.test.ts` 20/20 绿
- `src/memory/audit-signing.test.ts` 14+/14+ 绿(tamper / delete / reorder / append-only 全部)
- `src/evals/citation-density.test.ts` 20/20 query 断言 (cite / token) ≤ 1/60
- 3 个 commit 后, `git log --oneline bff212b4..HEAD` 列出 3 条新提交
- `tasks.md` P3 段勾选 + 实施记录表追加 3 行
