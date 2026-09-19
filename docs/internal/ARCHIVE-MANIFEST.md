# 归档清单与消费者扫描报告（ARCHIVE-MANIFEST）

> 生成时间：2026-09-19 · 基线 `main` @ `db655b41`
> 目的：把「中间过程产物」从主树迁入归档目录（`git mv`，保留 history），使仓库达到顶级生产级开源项目的整洁度。
> **本文件是 task-2 的交付物与 task-3 的执行依据。** 扫描为只读，无任何文件被修改。

---

## 0. 判定规则（objective 硬约束）

1. 必须用 `git mv` 归档（保留 `git log --follow` 可追溯），**禁止 `git rm`**。
2. **任何被 CI 或 scripts 引用的文件禁止归档** —— 这是硬约束，优先于「4 类中间过程产物」的归档诉求。
3. 被其他文档以 Markdown 链接引用的文件**可归档**，但必须在同一次变更中更新引用方，保证零死链。
4. 仅注释中提及（非文件读取）不视为功能性消费者，但注释文案需同步修正。

---

## 1. 扫描覆盖范围与命令

| 扫描面 | 方法 | 结果 |
|---|---|---|
| `package.json` 全部 scripts 值 | 正则提取 `scripts/\|src/\|packages/` 路径 | 92 个被引用文件 |
| `.github/workflows/*.yml` | 提取 `bun run <name>` + 全文包含性检查 | 21 个 script 名 |
| 全仓 `*.test.ts` import | `grep -rl` 每个候选 basename | 0 个真实消费者 |
| 全仓非 test 文本引用（md/ts/js/json/yml/sh） | 逐候选 basename 全文匹配 | 9 个候选被命中（见 §3） |
| scripts 间交叉引用 | 候选 basename 在其他脚本中的出现 | 4 处（全在同组内，见 §4） |
| README / docs 内链 + 死链 | 相对链接存在性解析 | 30 条死链（见 `docs/GAP-ANALYSIS.md` §5.2） |

候选文件总数：**78**

---

## 2. ❌ 黑名单（有功能性消费者 → 禁止归档）

| 文件 | 消费者证据 | 判定 |
|---|---|---|
| `pi5.md` | `scripts/verify-pi5.ts:52 (readFileSync 真读取) → package.json:77 "verify:pi5"` | **保留在仓库根** |

**黑名单共 1 个文件。**

### 为什么 `pi5.md` 不能归档

`scripts/verify-pi5.ts:52` 对 `pi5.md` 做**真实文件读取**：

```ts
// scripts/verify-pi5.ts:52-54
const plan = readFileSync(join(root, 'pi5.md'), 'utf8');
if (!plan.includes(marker)) throw new Error(`pi5.md is missing required marker: ${marker}`);
```
且该脚本挂在 `package.json:77` 的 `"verify:pi5"` 上。归档会直接打断 `bun run verify:pi5`，
触发 objective 硬约束「任何被 CI 或 scripts 引用的文件禁止归档」。**故 `pi5.md` 保留原位。**

> 副作用：`pi*.md` 家族出现一处不对称（`pi5.md` 在根，其余 5 份在 `docs/internal/migrations/`）。
> 这是硬约束的必然结果，刻意如此，**不视为缺陷**。

---

## 3. 引用方更新清单（归档时必须同步修改，否则产生死链）

| 被归档文件 | 引用方:行 | 引用形式 | 处理 |
|---|---|---|---|
| `pi7.md` | `AGENTS.md:28` | `[pi7.md](./pi7.md)` Markdown 链接 | → `./docs/internal/migrations/pi7.md` |
| `pi7.md` | `AGENTS.md:233` | 反引号纯文本 `pi7.md` | → 更新为新路径文案 |
| `pi7.md` | `README.md:372` | `[pi7.md](./pi7.md)` 链接 | → 指向归档路径（task-4 README 重构时一并处理） |
| `pi7.md` | `README_CN.md:375` | `[pi7.md](./pi7.md)` 链接 | → 文件将在 task-4 被删除 |
| `pi7.md` | `src/runtime/pi/pi-version-lock.test.ts:11` | **仅注释**（`declared in pi7.md`） | 修正注释路径 |
| `pi7.md` | `src/runtime/pi/pi-fixture-schema.test.ts:11` | **仅注释**（`documented in pi7.md`） | 修正注释路径 |
| `pi5.md` | `docs/ARCHITECTURE.md:130` | `[`pi5.md`](../pi5.md)` 链接 | **无需改**（pi5.md 不归档） |
| `pi5.md` | `docs/architecture-overview.md:5` | 反引号纯文本 | **无需改** |
| `pi6.md` `pi10.md` | `docs/pi7-final-summary.md:92,95` | 反引号纯文本列在「相关文档」 | 该文档自身留在 `docs/`，需更新路径 |
| `pi11.md` | `docs/roadmap.md:164,182,219,221` | `[`pi11.md`](./pi11.md)` 链接 + 纯文本 | → `./internal/migrations/pi11.md` |
| `pi11.md` | `docs/pi-native-invest-assistant-analysis.md:115,116,173` | 反引号纯文本 | → 更新为新路径文案 |
| `docs/analysis/2026-09-18-…status-and-plan.md` | `docs/roadmap.md:164,241` | `[`…`](./analysis/…)` 链接 ×2 | → `./internal/analysis/…` |
| `docs/superpowers/specs/2026-06-05-…-design.md` | `scripts/lint-web-boundary.sh:67` | **`echo` 诊断字符串**（非文件读取；该脚本未挂 CI/package.json） | → 更新 echo 路径，保持脚本自洽 |
| `docs/comet/…` | `pi7.md:6487` | 反引号纯文本（pi7.md 自身也归档） | 同组迁移，相对关系不变 |

> **误报澄清（已排除）**：
> - `packages/pi-app/src/bootstrap-agent.test.ts:63` 的 `prompts/brief.md` 是测试**自建临时文件**，与 `docs/comet/...` 无关。
> - `packages/pi-runtime/src/{skill-filter,brand-extension}.test.ts` 的 `superpowers` 指**用户全局 skill `~/.agents/skills/using-superpowers/SKILL.md`**，与 `docs/superpowers/` 无关。
> - `.pi/goals/**.md` 对 `pi11.md` / `docs/analysis/…` 的引用属于 goal ledger（历史记录），**objective 明确要求不动 `.pi/`**，其引用保持为历史快照。

---

## 4. scripts 组内交叉引用（同组迁移 → 引用不失效）

| 被引用 | 引用者 | 说明 |
|---|---|---|
| `scripts/oscript-config-verify.ts` | `scripts/oscript-all-verify.sh` | 两者同迁入 `scripts/internal/`，保持同级 |
| `scripts/oscript-plan31-features-verify.ts` | `scripts/oscript-all-verify.sh` | 两者同迁入 `scripts/internal/`，保持同级 |
| `scripts/oscript-skills-stock-analysis.ts` | `scripts/oscript-real-upup-test.ts` | 两者同迁入 `scripts/internal/`，保持同级 |
| `scripts/oscript-storage-verify.ts` | `scripts/oscript-all-verify.sh` | 两者同迁入 `scripts/internal/`，保持同级 |

---

## 5. ✅ 白名单（可归档，共 77 个）

### 5.1 根目录迁移日志 (pi*.md) — 5 个 → 目标目录 `docs/internal/migrations/`

| 现路径 | 目标路径 | 大小 |
|---|---|---|
| `pi10.md` | `docs/internal/migrations/pi10.md` | 37,333 B |
| `pi11.md` | `docs/internal/migrations/pi11.md` | 21,234 B |
| `pi6.md` | `docs/internal/migrations/pi6.md` | 401,565 B |
| `pi7.md` | `docs/internal/migrations/pi7.md` | 505,565 B |
| `pi8.md` | `docs/internal/migrations/pi8.md` | 29,029 B |

### 5.2 docs/analysis/（现状与问题分级报告） — 3 个 → 目标目录 `docs/internal/analysis/`

| 现路径 | 目标路径 | 大小 |
|---|---|---|
| `docs/analysis/2026-09-18-pi-native-invest-status-and-plan.md` | `docs/internal/analysis/2026-09-18-pi-native-invest-status-and-plan.md` | 28,332 B |
| `docs/analysis/2026-09-18-truncation-and-pluggability.md` | `docs/internal/analysis/2026-09-18-truncation-and-pluggability.md` | 17,418 B |
| `docs/analysis/2026-09-19-pi-native-invest-v2-status.md` | `docs/internal/analysis/2026-09-19-pi-native-invest-v2-status.md` | 12,880 B |

### 5.3 docs/superpowers/（历史计划/规格/报告） — 15 个 → 目标目录 `docs/internal/superpowers/plans/`

| 现路径 | 目标路径 | 大小 |
|---|---|---|
| `docs/superpowers/plans/2026-06-04-simplify-cmd-autocomplete-pi-tui.md` | `docs/internal/superpowers/plans/2026-06-04-simplify-cmd-autocomplete-pi-tui.md` | 19,781 B |
| `docs/superpowers/plans/2026-06-04-sprint-1-2-alt-data.md` | `docs/internal/superpowers/plans/2026-06-04-sprint-1-2-alt-data.md` | 24,095 B |
| `docs/superpowers/plans/2026-06-04-sprint-1-3-bridge-mode.md` | `docs/internal/superpowers/plans/2026-06-04-sprint-1-3-bridge-mode.md` | 36,087 B |
| `docs/superpowers/plans/2026-06-04-sprint-1-4-portfolio-attribution.md` | `docs/internal/superpowers/plans/2026-06-04-sprint-1-4-portfolio-attribution.md` | 31,444 B |
| `docs/superpowers/plans/2026-06-04-sprint-1-5-session-sync.md` | `docs/internal/superpowers/plans/2026-06-04-sprint-1-5-session-sync.md` | 30,635 B |
| `docs/superpowers/plans/2026-06-05-close-top-tier-investment-gaps-p0.md` | `docs/internal/superpowers/plans/2026-06-05-close-top-tier-investment-gaps-p0.md` | 2,059 B |
| `docs/superpowers/plans/2026-06-05-close-top-tier-investment-gaps-p1a.md` | `docs/internal/superpowers/plans/2026-06-05-close-top-tier-investment-gaps-p1a.md` | 3,106 B |
| `docs/superpowers/plans/2026-06-06-close-top-tier-investment-gaps-p3.md` | `docs/internal/superpowers/plans/2026-06-06-close-top-tier-investment-gaps-p3.md` | 7,547 B |
| `docs/superpowers/plans/2026-06-06-close-top-tier-investment-gaps-quality.md` | `docs/internal/superpowers/plans/2026-06-06-close-top-tier-investment-gaps-quality.md` | 5,847 B |
| `docs/superpowers/reports/2026-06-06-close-top-tier-investment-gaps-verify.md` | `docs/internal/superpowers/reports/2026-06-06-close-top-tier-investment-gaps-verify.md` | 5,303 B |
| `docs/superpowers/specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md` | `docs/internal/superpowers/specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md` | 29,701 B |
| `docs/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md` | `docs/internal/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md` | 16,268 B |
| `docs/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md` | `docs/internal/superpowers/specs/2026-06-05-close-top-tier-investment-gaps-design.md` | 22,243 B |
| `docs/superpowers/specs/2026-06-06-skills-plugins-round-3-comprehensive.md` | `docs/internal/superpowers/specs/2026-06-06-skills-plugins-round-3-comprehensive.md` | 11,630 B |
| `docs/superpowers/specs/2026-06-06-unify-skills-and-plugins-registries-design.md` | `docs/internal/superpowers/specs/2026-06-06-unify-skills-and-plugins-registries-design.md` | 15,056 B |

### 5.4 docs/comet/（流程归档） — 3 个 → 目标目录 `docs/internal/comet/archive/2026-09-16-pi5-core-agent-migration/`

| 现路径 | 目标路径 | 大小 |
|---|---|---|
| `docs/comet/archive/2026-09-16-pi5-core-agent-migration/brief.md` | `docs/internal/comet/archive/2026-09-16-pi5-core-agent-migration/brief.md` | 18,363 B |
| `docs/comet/archive/2026-09-16-pi5-core-agent-migration/comet-state.yaml` | `docs/internal/comet/archive/2026-09-16-pi5-core-agent-migration/comet-state.yaml` | 62,243 B |
| `docs/comet/archive/2026-09-16-pi5-core-agent-migration/verification.md` | `docs/internal/comet/archive/2026-09-16-pi5-core-agent-migration/verification.md` | 43,581 B |

### 5.5 scripts/ 实验性脚本 — 50 个 → 目标目录 `scripts/internal/`

| 现路径 | 目标路径 | 大小 |
|---|---|---|
| `scripts/appscript-multiagent.sh` | `scripts/internal/appscript-multiagent.sh` | 6,262 B |
| `scripts/appscript-test.sh` | `scripts/internal/appscript-test.sh` | 897 B |
| `scripts/appscript-verify.js` | `scripts/internal/appscript-verify.js` | 3,689 B |
| `scripts/appscript-verify.ts` | `scripts/internal/appscript-verify.ts` | 9,399 B |
| `scripts/comprehensive-verification.applescript` | `scripts/internal/comprehensive-verification.applescript` | 23,505 B |
| `scripts/integration-verification.applescript` | `scripts/internal/integration-verification.applescript` | 26,072 B |
| `scripts/interactive-multi-agent.applescript` | `scripts/internal/interactive-multi-agent.applescript` | 8,259 B |
| `scripts/interactive-upup.applescript` | `scripts/internal/interactive-upup.applescript` | 8,008 B |
| `scripts/oscript-all-skills-test.ts` | `scripts/internal/oscript-all-skills-test.ts` | 8,362 B |
| `scripts/oscript-all-verify.sh` | `scripts/internal/oscript-all-verify.sh` | 5,914 B |
| `scripts/oscript-approval-test.ts` | `scripts/internal/oscript-approval-test.ts` | 10,833 B |
| `scripts/oscript-approval-verify.ts` | `scripts/internal/oscript-approval-verify.ts` | 10,737 B |
| `scripts/oscript-byd-research-test.ts` | `scripts/internal/oscript-byd-research-test.ts` | 10,235 B |
| `scripts/oscript-cjk-diag.ts` | `scripts/internal/oscript-cjk-diag.ts` | 9,288 B |
| `scripts/oscript-config-verify.ts` | `scripts/internal/oscript-config-verify.ts` | 8,729 B |
| `scripts/oscript-cost-verify.ts` | `scripts/internal/oscript-cost-verify.ts` | 8,161 B |
| `scripts/oscript-duckdb-verify.ts` | `scripts/internal/oscript-duckdb-verify.ts` | 11,017 B |
| `scripts/oscript-final-features-verify.ts` | `scripts/internal/oscript-final-features-verify.ts` | 12,648 B |
| `scripts/oscript-full-verification.ts` | `scripts/internal/oscript-full-verification.ts` | 2,751 B |
| `scripts/oscript-interactive-skills.ts` | `scripts/internal/oscript-interactive-skills.ts` | 10,446 B |
| `scripts/oscript-mac-verify.ts` | `scripts/internal/oscript-mac-verify.ts` | 15,801 B |
| `scripts/oscript-new-features-verify.ts` | `scripts/internal/oscript-new-features-verify.ts` | 14,300 B |
| `scripts/oscript-permission-approval-verify.ts` | `scripts/internal/oscript-permission-approval-verify.ts` | 23,139 B |
| `scripts/oscript-pid-verify.ts` | `scripts/internal/oscript-pid-verify.ts` | 8,100 B |
| `scripts/oscript-plan31-features-verify.ts` | `scripts/internal/oscript-plan31-features-verify.ts` | 10,477 B |
| `scripts/oscript-real-upup-test.ts` | `scripts/internal/oscript-real-upup-test.ts` | 11,480 B |
| `scripts/oscript-skills-stock-analysis.ts` | `scripts/internal/oscript-skills-stock-analysis.ts` | 12,163 B |
| `scripts/oscript-storage-analysis.ts` | `scripts/internal/oscript-storage-analysis.ts` | 21,063 B |
| `scripts/oscript-storage-dev.applescript` | `scripts/internal/oscript-storage-dev.applescript` | 19,840 B |
| `scripts/oscript-storage-verify.ts` | `scripts/internal/oscript-storage-verify.ts` | 11,732 B |
| `scripts/oscript-subagent-verify.ts` | `scripts/internal/oscript-subagent-verify.ts` | 8,386 B |
| `scripts/oscript-workspace-verify.ts` | `scripts/internal/oscript-workspace-verify.ts` | 6,474 B |
| `scripts/real-upup-test.applescript` | `scripts/internal/real-upup-test.applescript` | 6,645 B |
| `scripts/runtime-verification.applescript` | `scripts/internal/runtime-verification.applescript` | 21,323 B |
| `scripts/test-global-config.applescript` | `scripts/internal/test-global-config.applescript` | 4,993 B |
| `scripts/upup-interactive-multiagent.sh` | `scripts/internal/upup-interactive-multiagent.sh` | 10,632 B |
| `scripts/upup-multiagent-analysis.sh` | `scripts/internal/upup-multiagent-analysis.sh` | 3,579 B |
| `scripts/upup-multiagent-interactive.sh` | `scripts/internal/upup-multiagent-interactive.sh` | 5,566 B |
| `scripts/upup-real-multiagent.sh` | `scripts/internal/upup-real-multiagent.sh` | 8,824 B |
| `scripts/upup-swarm-analysis.sh` | `scripts/internal/upup-swarm-analysis.sh` | 4,419 B |
| `scripts/verify-memory-system.applescript` | `scripts/internal/verify-memory-system.applescript` | 14,209 B |
| `scripts/verify-multi-agent-trigger.applescript` | `scripts/internal/verify-multi-agent-trigger.applescript` | 3,482 B |
| `scripts/verify-session-isolation.applescript` | `scripts/internal/verify-session-isolation.applescript` | 3,670 B |
| `scripts/verify-upup-commands.applescript` | `scripts/internal/verify-upup-commands.applescript` | 5,995 B |
| `scripts/verify-upup-dev.applescript` | `scripts/internal/verify-upup-dev.applescript` | 7,294 B |
| `scripts/x11-comprehensive-test.ts` | `scripts/internal/x11-comprehensive-test.ts` | 10,230 B |
| `scripts/x11-real-exec.sh` | `scripts/internal/x11-real-exec.sh` | 4,169 B |
| `scripts/x11-real-interactive.applescript` | `scripts/internal/x11-real-interactive.applescript` | 3,605 B |
| `scripts/x11-simple-test.ts` | `scripts/internal/x11-simple-test.ts` | 7,744 B |
| `scripts/x11-skills-test.ts` | `scripts/internal/x11-skills-test.ts` | 13,521 B |

---

## 6. 汇总

- 白名单：**77** 个文件可归档（task-3 执行，77 R / 0 失败）
- 黑名单：**1** 个文件保留原位（`pi5.md`）
- 引用方需同步更新：**12** 处（其中 2 处仅注释文案；另有 2 处因 `pi5.md` 不归档而无需改动）
- 归档后**零死链**为目标：所有 Markdown 链接在同一次变更中修正

---

## 7. task-6 追加归档（docs 冗余合并）

§5 的 4 类范围之外，另有 **9 份** `docs/` 冗余 / 一次性文档，在 task-6（docs 冗余合并 + 单一导航真源）中按同一原则归档：

| 原路径 | 新路径 | 归档理由 | canonical 替代 |
|---|---|---|---|
| `docs/architecture-overview.md` | `docs/internal/architecture/architecture-overview.md` | Pi5 期概览；仍描述已删除的 `src/cli.tsx` + Ink TUI；自称 ARCHITECTURE.md 为「334 行」实为 130 行 | `docs/ARCHITECTURE.md` |
| `docs/AI-AGENT-GAP-ANALYSIS.md` | `docs/internal/audits/AI-AGENT-GAP-ANALYSIS.md` | 与 `docs/GAP-ANALYSIS.md` 维度重叠；自标 Superseded；含 `openspec/` 死链 | `docs/GAP-ANALYSIS.md` |
| `docs/pi-native-invest-assistant-analysis.md` | `docs/internal/audits/…` | 一次性分析 | `docs/pi-native-positioning.md` |
| `docs/pi7-final-summary.md` | `docs/internal/audits/…` | 一次性迁移摘要 | `docs/internal/migrations/pi*.md` |
| `docs/pi-ecosystem-audit-2026-09-15.md` | `docs/internal/audits/…` | 时点审计 | `docs/GAP-ANALYSIS.md` §2 |
| `docs/pi7-pi-llm-config-audit.md` | `docs/internal/audits/…` | 时点审计 | `docs/pi-native-positioning.md` §5 |
| `docs/pi7-pi-llm-provider-migration-plan.md` | `docs/internal/audits/…` | 已完成的一次性计划 | 同上 |
| `docs/comparison.md` | `docs/internal/positioning/comparison.md` | 与 `COMPETITIVE.md` 重复（英文早期版） | `docs/COMPETITIVE.md` |
| `docs/positioning.md` | `docs/internal/positioning/positioning.md` | 与 `pi-native-positioning.md` 重复（自述被其取代） | `docs/pi-native-positioning.md` |

### 7.1 ❌ task-6 硬黑名单（不归档）

| 路径 | 消费者 | 断言类型 |
|---|---|---|
| `docs/architecture/*.md` ×6 | `scripts/verify-pi5.ts#verifyArchitectureDocs()`（挂 `package.json:77 verify:pi5`） | `existsSync` **硬断言存在**，移动即失败 |

### 7.2 task-6 引用修正

| 引用方 | 处理 |
|---|---|
| `docs/index.md` | **整篇重写**为中文「唯一导航真源」（含 canonical 区 + 归档区 + 根文件区） |
| `docs/ARCHITECTURE.md` | 新增 §10「文档关系（canonical 与归档）」+ 优先级声明 |
| `docs/COMPETITIVE.md` / `docs/pi-native-positioning.md` | 头部新增「文档关系」交叉引用 |
| `docs/GAP-ANALYSIS.md` | §5.2 修复结果表 + §5.3 四行状态 + §11 + §12 |
| `docs/roadmap.md` | `./comparison.md` → `./COMPETITIVE.md` |
| `docs/deployment.md` | `docs/positioning.md` → `docs/pi-native-positioning.md` |
| `docs/internal/migrations/pi11.md` | `docs/pi7-final-summary.md` → `docs/internal/audits/pi7-final-summary.md` |
| `docs/internal/comet/archive/2026-09-16-pi5-core-agent-migration/brief.md` | `docs/pi-ecosystem-audit-2026-09-15.md` → `docs/internal/audits/…` |
| `packages/pi-cli-bootstrap/src/doctor.ts:206` | JSDoc 注释路径 → `docs/internal/audits/pi7-pi-llm-config-audit.md` |
| 9 个归档文件内部相对链接 | 按「原目录解析 → 相对新目录重写」，共重写 **27 条** |
| `docs/benchmarks.md` | `src/evals/*` → `packages/pi-evals/src/*`（含 4 条 `../../` → `../` 深度修正）；命令改为 `bun run eval` |
| `docs/faq.md` | `./sync-plan.md` 死链改为纯文本 |
| `CHANGELOG.md` | `openspec/CHANGELOG.md` ×2 → 「见 `git log`」 |
| `.github/CODEOWNERS` | **新增**（关闭 `CONTRIBUTING.md:251` 死链；声明 Pi runtime / scripts / docs owner） |

### 7.3 task-6 验证结果

- `git status -M`：**9 R**（全部 rename 检测通过，history 保留）
- 全仓死链：**28 → 5**，且 5 条均为**已验证误报**（`.github/` issue / PR 模板按仓库根解析）
- `docs/` 导航面（排除 `internal/`）：**0 条死链**；`docs/index.md` 内链 **100% 可达**
- `docs/` 主树跨文件重复段落（>200 字符）：**0**
