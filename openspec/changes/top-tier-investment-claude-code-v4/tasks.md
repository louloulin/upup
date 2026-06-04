# Tasks: 顶级投资助手的 Claude Code v4 (top-tier-investment-claude-code-v4)

> **范围**:5-8 sprint,1-2 turn 落地。v4 = v3 续 + 2 个新 spec(competitive-positioning / claude-code-code-analysis) + 4 唯一差异化量化。
>
> **方法**:增量更新本 tasks.md,逐 sprint 推进,每个 task 完成需 typecheck + 测试全绿。

---

## v4-Sprint 1 — code-archaeology(0.3 turn)

### 1.1 src/code-archaeology/ 骨架

- [ ] 1.1.1 创建 `src/code-archaeology/index.ts` 主入口 + 类型定义
- [ ] 1.1.2 实现 `src/code-archaeology/scanner.ts` — 文件扫描 + exports/imports 解析
- [ ] 1.1.3 实现 `src/code-archaeology/layer-detector.ts` — 5 layer 推断(路径前缀 + import 模式)
- [ ] 1.1.4 实现 `src/code-archaeology/manifest-checker.ts` — capability-manifest 命中度
- [ ] 1.1.5 实现 `src/code-archaeology/orphan-finder.ts` — 死文件检测
- [ ] 1.1.6 实现 `src/code-archaeology/hot-spot-finder.ts` — hot spot top 20
- [ ] 1.1.7 实现 `src/code-archaeology/markdown-renderer.ts` — 渲染 CODE-MAP.md

### 1.2 CLI 入口 + 集成

- [ ] 1.2.1 创建 `scripts/code-archaeology.ts` CLI 入口(`bun run code-archaeology`)
- [ ] 1.2.2 在 `src/agent/feature-gates.ts` 注册 `CODE_ARCHAEOLOGY` flag
- [ ] 1.2.3 在 `package.json` 加 `"code-archaeology": "bun run scripts/code-archaeology.ts"` 脚本

### 1.3 测试 + 验证

- [ ] 1.3.1 写 `src/code-archaeology/scanner.test.ts`(3+ tests)
- [ ] 1.3.2 写 `src/code-archaeology/layer-detector.test.ts`(3+ tests)
- [ ] 1.3.3 写 `src/code-archaeology/orphan-finder.test.ts`(2+ tests)
- [ ] 1.3.4 写 `src/code-archaeology/hot-spot-finder.test.ts`(2+ tests)
- [ ] 1.3.5 `bun run code-archaeology` 生成 `docs/CODE-MAP.md`(≥ 3K 字)
- [ ] 1.3.6 `bun test src/code-archaeology/` 全绿
- [ ] 1.3.7 `bun run typecheck` 全绿

**Sprint 1 完成标志**:`docs/CODE-MAP.md` 自动生成 + 6 源文件 + 10+ tests pass

---

## v4-Sprint 2 — competitive-positioning(0.3 turn)

### 2.1 src/competitive-positioning/ 骨架

- [ ] 2.1.1 创建 `src/competitive-positioning/index.ts` 主入口
- [ ] 2.1.2 实现 `src/competitive-positioning/matrix.ts` — 13 竞品 7 维度评分(类型 + 数据)
- [ ] 2.1.3 实现 `src/competitive-positioning/four-uniques.ts` — 4 唯一量化证据(grep 数 / 文件数 / 渠道数)
- [ ] 2.1.4 实现 `src/competitive-positioning/decision-path.ts` — 4 类用户决策路径
- [ ] 2.1.5 实现 `src/competitive-positioning/sologan.ts` — 30 字 sologan + 3 反驳(为什么不用 Bloomberg / 不用 ChatGPT / 不用 Python)

### 2.2 文档

- [ ] 2.2.1 创建 `docs/COMPETITIVE.md` — 13 竞品矩阵 + 4 唯一 + 4 路径 + sologan + 反驳(5K-15K 字)
- [ ] 2.2.2 更新 `src/agent/capability-manifest.ts` 加 `competitorRefs: string[]` 字段(`?? []` 兜底)
- [ ] 2.2.3 给每个 CapabilityGroup 填 `competitorRefs`(从 13 竞品中引用)

### 2.3 集成 + 编译开关

- [ ] 2.3.1 在 `src/agent/feature-gates.ts` 注册 `COMPETITIVE_POSITIONING` flag(defaultEnabled: true)
- [ ] 2.3.2 在 `src/agent/role-system.ts` 加 4 唯一 sologan(在 v3 投研 Claude 人设之上)

### 2.4 测试

- [ ] 2.4.1 写 `src/competitive-positioning/matrix.test.ts`(5+ tests,矩阵完整性)
- [ ] 2.4.2 写 `src/competitive-positioning/four-uniques.test.ts`(4+ tests,4 唯一证据)
- [ ] 2.4.3 写 `src/competitive-positioning/decision-path.test.ts`(4+ tests,4 路径)
- [ ] 2.4.4 写 `src/competitive-positioning/manifest-integration.test.ts`(2+ tests)
- [ ] 2.4.5 `bun test src/competitive-positioning/` 全绿(16+ tests)
- [ ] 2.4.6 `bun run typecheck` 全绿

**Sprint 2 完成标志**:`docs/COMPETITIVE.md` 落地 + 5 源文件 + 16+ tests pass

---

## v4-Sprint 3 — code-review(0.4 turn)

### 3.1 src/code-review/ 骨架

- [ ] 3.1.1 创建 `src/code-review/index.ts` 主入口 + `Finding` 类型
- [ ] 3.1.2 实现 `src/code-review/diff-parser.ts` — 解析 git diff(unidiff format)
- [ ] 3.1.3 实现 `src/code-review/report-renderer.ts` — Markdown 报告

### 3.2 5 检测器

- [ ] 3.2.1 实现 `src/code-review/detectors/dead-code.ts` — 未引用 export 检测
- [ ] 3.2.2 实现 `src/code-review/detectors/duplication.ts` — Jaccard ≥ 0.8 代码块
- [ ] 3.2.3 实现 `src/code-review/detectors/security.ts` — 硬编码 key / SQL 注入 / XSS(5+ 规则)
- [ ] 3.2.4 实现 `src/code-review/detectors/performance.ts` — O(n²) / 同步 IO / 未释放资源(3+ 规则)
- [ ] 3.2.5 实现 `src/code-review/detectors/style.ts` — 命名 / 注释 / 长度(3+ 规则)

### 3.3 CLI + 集成

- [ ] 3.3.1 创建 `src/code-review/cli.ts` — `bun run code-review` + `--diff` 模式
- [ ] 3.3.2 在 `src/agent/feature-gates.ts` 注册 `CODE_REVIEW` flag

### 3.4 测试

- [ ] 3.4.1 写 `src/code-review/detectors/dead-code.test.ts`(3+ tests)
- [ ] 3.4.2 写 `src/code-review/detectors/duplication.test.ts`(3+ tests)
- [ ] 3.4.3 写 `src/code-review/detectors/security.test.ts`(3+ tests)
- [ ] 3.4.4 写 `src/code-review/detectors/performance.test.ts`(3+ tests)
- [ ] 3.4.5 写 `src/code-review/detectors/style.test.ts`(3+ tests)
- [ ] 3.4.6 写 `src/code-review/diff-parser.test.ts`(2+ tests)
- [ ] 3.4.7 `bun test src/code-review/` 全绿(15+ tests)
- [ ] 3.4.8 `bun run typecheck` 全绿

**Sprint 3 完成标志**:`bun run code-review` CLI 可用 + 9 源文件 + 15+ tests pass

---

## v4-Sprint 4 — refactor + test-coverage(0.4 turn)

### 4.1 src/code-refactor/ 骨架

- [ ] 4.1.1 创建 `src/code-refactor/index.ts` 主入口
- [ ] 4.1.2 实现 `src/code-refactor/layer-boundary-checker.ts` — 5 layer 边界(3 规则)
- [ ] 4.1.3 实现 `src/code-refactor/manifest-completeness-checker.ts` — manifest 字段完整性
- [ ] 4.1.4 实现 `src/code-refactor/investment-rules-checker.ts` — 投研域规则(裸 BUY/SELL 关键词)
- [ ] 4.1.5 实现 `src/code-refactor/cli.ts` — `bun run refactor-suggest` + disabledRules 配置

### 4.2 src/code-test-gen/ 骨架

- [ ] 4.2.1 创建 `src/code-test-gen/index.ts` 主入口
- [ ] 4.2.2 实现 `src/code-test-gen/coverage-analyzer.ts` — 找无 .test.ts 兄弟
- [ ] 4.2.3 实现 `src/code-test-gen/stub-generator.ts` — 生成 `*.missing.test.ts` 模板
- [ ] 4.2.4 实现 `src/code-test-gen/ci-integration.ts` — 集成到 `bun test`(< 80% fail)
- [ ] 4.2.5 实现 `src/code-test-gen/cli.ts` — `bun run test-coverage` CLI

### 4.3 集成 + 编译开关

- [ ] 4.3.1 在 `src/agent/feature-gates.ts` 注册 `REFACTOR_SUGGEST` + `TEST_COVERAGE` flag
- [ ] 4.3.2 在 `package.json` 加 `refactor-suggest` + `test-coverage` 脚本

### 4.4 测试

- [ ] 4.4.1 写 `src/code-refactor/layer-boundary-checker.test.ts`(2+ tests)
- [ ] 4.4.2 写 `src/code-refactor/manifest-completeness-checker.test.ts`(2+ tests)
- [ ] 4.4.3 写 `src/code-refactor/investment-rules-checker.test.ts`(2+ tests)
- [ ] 4.4.4 写 `src/code-test-gen/coverage-analyzer.test.ts`(2+ tests)
- [ ] 4.4.5 写 `src/code-test-gen/stub-generator.test.ts`(1+ test)
- [ ] 4.4.6 写 `src/code-test-gen/ci-integration.test.ts`(1+ test)
- [ ] 4.4.7 `bun test src/code-refactor/ src/code-test-gen/` 全绿(10+ tests)
- [ ] 4.4.8 `bun run typecheck` 全绿

**Sprint 4 完成标志**:2 CLI + 10 源文件 + 10+ tests pass

---

## v4-Sprint 5 — kairos-code-dream(0.2 turn)

### 5.1 src/kairos/code-dream.ts

- [ ] 5.1.1 实现 `src/kairos/code-dream.ts` — KAIROS dream 阶段集成
- [ ] 5.1.2 锁机制:`.upup/kairos/.code-dream-lock` + PID 存活检查
- [ ] 5.1.3 跑 3 步:code-archaeology(incremental)→ code-review(full)→ refactor-suggest(full)
- [ ] 5.1.4 写 `.upup/kairos/logs/YYYY/MM/YYYY-MM-DD-code-dream.md`
- [ ] 5.1.5 推送:可选 `UPUP_CODE_DREAM_PUSH=true` 推 5 渠道

### 5.2 集成

- [ ] 5.2.1 在 `src/agent/feature-gates.ts` 注册 `KAIROS_CODE_DREAM` flag
- [ ] 5.2.2 在 `src/coach/memory.ts` 集成"代码晨报"记忆(用户看过的 code-dream 可索引)

### 5.3 测试

- [ ] 5.3.1 写 `src/kairos/code-dream.test.ts`(3+ tests: lock / push / log)
- [ ] 5.3.2 `bun test src/kairos/code-dream.test.ts` 全绿
- [ ] 5.3.3 `bun run typecheck` 全绿

**Sprint 5 完成标志**:KAIROS 自动每日 code-dream + 1 源文件 + 3+ tests pass

---

## v4-Sprint 6 — cli-extension v4(0.3 turn)

### 6.1 5 新命令

- [ ] 6.1.1 创建 `src/commands/competitive-scan.tsx` — 13 竞品矩阵实时扫描
- [ ] 6.1.2 创建 `src/commands/code-review.tsx` — 当前 branch 5 类问题评审
- [ ] 6.1.3 创建 `src/commands/archaeology.tsx` — 触发 code-archaeology,生成 CODE-MAP.md
- [ ] 6.1.4 创建 `src/commands/refactor-suggest.tsx` — 5 layer 合规 + manifest 完整性
- [ ] 6.1.5 创建 `src/commands/test-coverage.tsx` — 覆盖率 gap + stub 生成

### 6.2 中央注册表

- [ ] 6.2.1 每个命令 export `command: Command` + `feature` 字符串
- [ ] 6.2.2 集成到 `src/commands/index.ts` 中央注册表
- [ ] 6.2.3 在 `src/agent/feature-gates.ts` 注册 5 新 flag:`COMMAND_COMPETITIVE_SCAN` / `COMMAND_CODE_REVIEW` / `COMMAND_ARCHAEOLOGY` / `COMMAND_REFACTOR_SUGGEST` / `COMMAND_TEST_COVERAGE`

### 6.3 测试

- [ ] 6.3.1 写 `src/commands/cli-extension-v4.test.ts`(5+ tests per command × 5 commands = 25+ tests)
- [ ] 6.3.2 `bun test src/commands/cli-extension-v4.test.ts` 全绿
- [ ] 6.3.3 `bun run typecheck` 全绿

**Sprint 6 完成标志**:5 新 CLI 命令可用 + 25+ tests pass

---

## v4-Sprint 7 — manifest `competitorRefs`(0.2 turn)

### 7.1 manifest 字段扩展

- [ ] 7.1.1 `src/agent/capability-manifest.ts` 加 `competitorRefs?: string[]` 字段
- [ ] 7.1.2 给每个 CapabilityGroup 填 `competitorRefs`(从 13 竞品中引用)
- [ ] 7.1.3 下游消费方用 `?? []` 兜底(向后兼容)

### 7.2 role-system 升级

- [ ] 7.2.1 `src/agent/role-system.ts` 加 4 唯一 sologan
- [ ] 7.2.2 加"三件套"提示(多 Agent + KAIROS + Bridge)
- [ ] 7.2.3 `UPUP_COACH_MODE=0` 时软降级,移除 sologan 注入

### 7.3 测试

- [ ] 7.3.1 写 `src/agent/manifest-competitor-refs.test.ts`(5+ tests:扩展/兼容/填充)
- [ ] 7.3.2 写 `src/agent/role-system-v4.test.ts`(3+ tests:sologan 注入 / 三件套提示 / 软降级)
- [ ] 7.3.3 `bun test src/agent/` 全绿(8+ 新 tests + 原有 14 tests)
- [ ] 7.3.4 `bun run typecheck` 全绿

**Sprint 7 完成标志**:manifest v4 字段扩展 + role-system v4 + 8+ 新 tests pass

---

## v4-Sprint 8 — archive v3 + v4 release(0.1 turn)

### 8.1 v3 收尾

- [ ] 8.1.1 v3 7 sprint 全部落地后,`openspec archive top-tier-investment-claude-code`
- [ ] 8.1.2 v3 specs sync 到 `openspec/specs/`
- [ ] 8.1.3 v3 tasks 标记完成(143/143)

### 8.2 v4 release

- [ ] 8.2.1 v4 8 sprint 全部落地后,`openspec archive top-tier-investment-claude-code-v4`
- [ ] 8.2.2 v4 specs sync 到 `openspec/specs/`
- [ ] 8.2.3 版本号 bump:`package.json` 2026.6.4 → 2026.6.X(CalVer)
- [ ] 8.2.4 `git tag v2026.6.X` + push upstream + GitHub release(可选)

**Sprint 8 完成标志**:v3 + v4 全部 archived + release 标签

---

## v4 完成标志(总)

- [ ] `docs/CODE-MAP.md` 自动生成(5-10K 字)
- [ ] `docs/COMPETITIVE.md` 落地(5-15K 字)
- [ ] 13 竞品矩阵 + 4 唯一量化 + 4 路径(sologan + 3 反驳)
- [ ] loucode 代码分析 AI 5 增强全部落地(scanner + 5 检测器 + 3 规则集 + coverage + dream)
- [ ] 5 新 CLI 命令(`/competitive-scan` `/code-review` `/archaeology` `/refactor-suggest` `/test-coverage`)
- [ ] 5 新 KAIROS / 工具 / 编译开关 全部 feature-gates.ts 注册
- [ ] `capability-manifest.ts` `competitorRefs` 字段扩展,向后兼容
- [ ] `role-system.ts` 加 4 唯一 sologan + 三件套提示
- [ ] v3 7/7 sprint 落地(包含 1.4-7)
- [ ] v2 101/191 维持(不破坏)
- [ ] `bun test src/` 全绿(原 75 + v4 新增 ≥ 100 = ≥ 175 tests)
- [ ] `bun run typecheck` 全绿
- [ ] v3 + v4 archive 到 `openspec/changes/archive/`
- [ ] 投资者故事 + 4 唯一文档可对外宣称

**v4 = 顶级投资助手的 Claude Code 终极版**
