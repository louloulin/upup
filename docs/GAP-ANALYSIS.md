---
status: canonical
version: v2 (2026-09-19)
scope: 生产级开源就绪度差距分析（production-readiness gap analysis）
supersedes: v1「UpUp 投研 Claude Code 差距分析与 v5 行动方案」(2026-06-04)，历史内容见 `git log -- docs/GAP-ANALYSIS.md`
---

# UpUp 生产级开源差距分析 v2

> **生成时间**：2026-09-19
> **基线**：`main` @ `db655b41`，`package.json` version `2026.9.18`
> **对照基准**：顶级生产级开源项目通用标准（Bun/Node + TypeScript + CLI 生态）
> **方法**：每条结论附**可复现命令**与**实测输出**或 `file:line`；严格区分「上游/环境问题」与「UpUp 代码问题」
> **诚实约定**：本文不照抄任何既有文档结论。既有 `docs/AI-AGENT-GAP-ANALYSIS.md` 与 v1 均标注 Superseded，且都指向**不存在的** `openspec/` 路径（见 §5.2）。

---

## 0. 基线快照

| 项 | 值 | 采集命令 |
|---|---|---|
| workspace package | 41 | `bun run report:pi7` |
| Pi manifest 声明 | 41 | 同上 |
| Pi-native package | 21 | 同上 |
| Pi 注册工具 | 272（native 269） | 同上 |
| 唯一 Agent 内核 factory | 1 | `bun run check:pi7` |
| 遗留消费者 / global registry | 0 / 0 | 同上 |
| 根 `src` 生产文件 | 2（7 行） | `bun run report:pi7` |
| 测试文件 / 行数 | 208 / 27,143 | `find src packages/*/src -name '*.test.ts' \| wc -l` |
| 全量测试基线 | 2145 pass / 2 skip / **7 fail**（system-load timeout） | `bun test` |
| docs/ tracked 文件 | 59 | `git ls-files docs/ \| wc -l` |
| 根目录 `.md` | 17 | `ls *.md` |
| Markdown 死链 | **30** | 见 §5.2 脚本 |

---

## 1. 维度一：代码（Code）

### 1.1 规模与信号

```bash
find src packages/*/src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
#  109856 total
find packages/*/extensions -name "*.ts" | xargs wc -l | tail -1
#    7694 total

grep -rn ': any\b' --include='*.ts' --include='*.tsx' src packages/*/src packages/*/extensions | wc -l   # 59
grep -rn '@ts-ignore\|@ts-expect-error' --include='*.ts' --include='*.tsx' src packages/*/src | wc -l    # 0
grep -rn 'TODO\|FIXME\|XXX\|HACK' --include='*.ts' --include='*.tsx' src packages/*/src | wc -l         # 10
grep -rn 'console\.log' --include='*.ts' --include='*.tsx' src packages/*/src | wc -l                   # 111
```

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P1** | `any` 用法集中在 extension 层（40 处）与 package src（21 处），违反 AGENTS.md「避免 `any`」 | `grep ': any\b'` 实测：`src/`=0，`packages/*/src`=21，`packages/*/extensions`=40 | UpUp 代码问题 |
| **P2** | `console.log` 111 处，其中 73 处疑似 CLI/工具合法输出，剩余 ~38 处未分类 | 按路径含 `cli\|command\|doctor\|print\|report\|index` 过滤得 73 | UpUp 代码问题（需分类，非一律删除） |
| **P2** | 10 处 TODO/FIXME 无 issue 关联 | `grep 'TODO\|FIXME'` | UpUp 代码问题 |

**亮点（无需改进）**：`@ts-ignore` / `@ts-expect-error` **0 处** —— 顶级项目少见，值得保持。

---

## 2. 维度二：架构（Architecture）

### 2.1 已验证的强项

```bash
bun run check:module-boundaries   # PASS: 41 workspace / root allowlist 2 / 0 cycle
bun run check:pi7                 # PASS: 单 factory / 0 生产 global registry
bun run check:no-self-impl        # PASS: 25 upstream canonical exports / 0 self-impl collision
```

- **单一 Agent 内核**：`PiAgentSessionFactory.create()` 是唯一生产入口，`check:pi7` 守门。
- **单一事件适配点**：`@upup/pi-event-adapter`。
- **fail-closed 高风险工具**：5 个（`config_set`/`write_file`/`mcp_auth_get`/`notify`/`place_trade_order`）默认 deny。
- **根 `src` 仅 2 个生产文件 / 7 行** —— 微内核边界干净。

### 2.2 问题清单

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P1** | `resolvePiModel` 只查 `getBuiltinModel` + ollama，**不查 `modelRuntime`**，自定义 `models.json` provider 可能静默 fallback 到 Pi 默认 | `packages/pi-event-adapter/src/pi-model-bridge.ts:148`（`export function resolvePiModel`）；`packages/pi-runtime/src/default-model-runtime.ts:31` 注释显式承认此缺口 | UpUp 代码问题 |
| **P1** | 20/37 package 的 `pi` block 未声明 `tools`/`resources`/`capabilities` | `bun run report:pi7` → `hostCapabilities 7/41`、`sideEffects 6/41 packages` | UpUp 代码问题 |
| **P2** | skill 作用域过宽：一次 session 加载 222 个 skill（仓库 47 + 用户全局 `~/.agents/skills` 175），除白名单外全部进 system prompt | `src/runtime/pi/skill-reachability.contract.test.ts` 守门 | UpUp 代码问题（Pi 集成口径） |
| **P2** | 2 处走 raw `fetch` 绕过 Pi provider registry | `packages/memory/src/embeddings.ts`、`packages/pi-research/src/search.ts#searchPerplexity`（后者是真 LLM 推理） | UpUp 代码问题 |
| **P2** | `tsconfig.typecheck.json` 未覆盖 `packages/*/extensions`（extension 目录依赖各自 tsconfig） | `tsconfig.typecheck.json` 只 include `packages/*/src/**/*` | UpUp 代码问题 |

---

## 3. 维度三：测试（Testing）

### 3.1 规模

```bash
find src packages/*/src -name '*.test.ts' | wc -l      # 208
find src packages/*/src -name '*.test.ts' | xargs wc -l | tail -1   # 27143
grep -rn 'test\.skip\|it\.skip\|describe\.skip' --include='*.test.ts' src packages/*/src | wc -l  # 4
bun test   # 2145 pass / 2 skip / 7 fail
```

### 3.2 问题清单

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P1** | 7 个测试在**全量跑**时 5000ms timeout 失败，**单跑全部 PASS**（0.07–2.24s） | `packages/gateway/src/agent-runner.pi.test.ts:16`、`src/runtime/pi/investment-workflow-package.test.ts:7`、`src/runtime/pi/ollama-provider.contract.test.ts:66`、`src/runtime/pi/finance-context.test.ts:9`、`src/runtime/pi/performance.test.ts:34`、`src/runtime/pi/investment-workflow-evidence.test.ts`、`src/runtime/pi/agent-session-factory.test.ts` | UpUp 代码问题（测试隔离/并发预算），非上游 |
| **P1** | CI **无覆盖率上报**，无覆盖率门槛 | `.github/workflows/ci.yml` 20 个 matrix task 中无 coverage | UpUp 代码问题 |
| **P2** | 4 处 `test.skip` 无跟踪 issue | `grep 'test\.skip'` → 4 | UpUp 代码问题（本 goal 范围内不改测试逻辑，见 §11） |
| **P2** | 无 mutation testing / property-based testing | 仓库无相关依赖 | 增强项，非阻断 |

> **诚实说明**：7 个 timeout 是**预存**问题（`git blame` 早于 2026-09-18/19 两轮 goal 的改动），且**单跑必过** —— 属于测试并发预算不足，不是功能缺陷。本 goal 明确将其列为 out of scope（见 §11）。

---

## 4. 维度四：CI

### 4.1 现状

`.github/workflows/ci.yml` 含 **20 个 matrix task**：
`lint-scc`、`pi-runtime`、`pi7-architecture`、`module-boundaries`、`workspace-exports`、`pi-packages`、`js-suffix`、`pi-deletion-audit`、`pi-package-audit`、`upup-home`、`pi-extension-coverage`、`pi-ecosystem-deps`、`sop-coverage`、`cross-platform-exposure`、`no-self-impl`、`tui-bridge-cleanup`、`upup-clean-loading`、`pi-event-coverage`、`typecheck`、`test`
外加独立 `pi7-acceptance` job（`verify:pi7-final` + `verify:pi-cbor`）与 `rebase-on-label.yml`。

### 4.2 问题清单

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P1** | **无 Dependabot**（依赖漂移无自动 PR） | 无 `.github/dependabot.yml`；`bun outdated` 实测 6 个包落后：`@arhen/pi-core-subagent` 1.3.54→1.3.55、`@duckdb/duckdb-wasm` 1.33.1-dev45→dev64、`@modelcontextprotocol/sdk` 1.29.0→1.30.0、`@plannotator/pi-extension` 0.27.15→0.27.16、`@whiskeysockets/baileys` 7.0.0-rc.9→rc14 | UpUp 工程配置问题 |
| **P1** | 无覆盖率门禁 | 同 §3.2 | UpUp 工程配置问题 |
| **P2** | 仅 `ubuntu-latest` + `bun-version: latest`；`engines.node: >=22.19.0` 声明但 CI 从不测 Node | `.github/workflows/ci.yml` `runs-on` / `setup-bun` 配置 | UpUp 工程配置问题 |
| **P2** | 无 release 自动化 → GitHub releases = 0 | `gh api repos/louloulin/upup/releases --jq 'length'` → `0` | UpUp 工程配置问题 |
| **P2** | `bun-version: latest` 非固定 → 上游 Bun 行为变化会静默影响 CI 结果（历史上已发生：`Bun.build` 的 `target: 'node22'` 在 Bun 1.4.1 失效） | `scripts/build-node.ts:78` 曾用 `target: 'node22'`，Bun 1.4.1 抛 `ERR_INVALID_ARG_TYPE` | 上游行为变化 + UpUp 配置问题 |
| **P1** | **8 个 `package.json` script 引用 Pi 迁移时已删除的路径**（陈旧死代码，非本 goal 引入） | `build:hooks`→`packages/hooks`(已删)；`build:memory`/`build:types`→包内 `src/index.ts`（被 `cd` 后相对路径解析）；`migrate:sessions`→`packages/pi-session/src/migrate.ts`(缺)；`session:migrate-to-pi`→`packages/pi-session/src/migrate-to-pi.ts`(缺)；`test:pi-contracts`→`packages/pi-bridge`(已删)+`src/controllers/agent-runner.pi.test.ts`(缺)；`smoke:cli`/`verify:upup-cli`→`scripts/verify-upup-cli-smoke.sh`(缺)。核实：均 `git cat-file -e HEAD:<path>` = NO（`db655b41` 时点已缺失），且**均不在 CI 的 21 个调用名内**（CI 调用名全部已定义✅），故不影响 CI | UpUp 元数据陈旧（建议在 S1 清理，本文档记录不代改） |

---

## 5. 维度五：文档（Docs）

### 5.1 体量

```bash
git ls-files docs/ | wc -l     # 59
ls *.md | wc -l                # 17
git ls-files 'packages/**/*.md' | wc -l   # 85
```

### 5.2 死链（P0）

复现脚本（对全部 tracked `.md` 做本地相对链接存在性检查）：

```bash
python3 - <<'PY'
import os, re, subprocess
files = subprocess.run(['git','ls-files','*.md'],capture_output=True,text=True).stdout.split()
bad = []
for f in files:
    try: txt = open(f, encoding='utf-8').read()
    except: continue
    for m in re.finditer(r'\]\((\.[^)#]*?)(#[^)]*)?\)', txt):
        target = os.path.normpath(os.path.join(os.path.dirname(f), m.group(1)))
        if not os.path.exists(target): bad.append((f, m.group(1)))
print(len(bad)); [print(f"  {f} -> {r}") for f,r in dict.fromkeys(bad)]
PY
```

实测输出：**死链总数 30**，其中：

| 死链类别 | 示例 | 根因 |
|---|---|---|
| **幽灵 `openspec/` 引用**（5 处） | `docs/GAP-ANALYSIS.md -> ./openspec/changes/upup-vs-dexter-comprehensive-audit-and-doc-refresh/docs/upup-vs-dexter-audit.md`；`CHANGELOG.md -> ./openspec/CHANGELOG.md`；`docs/comparison.md`、`docs/positioning.md`、`docs/AI-AGENT-GAP-ANALYSIS.md` 同 | `openspec/` 目录**不存在**（`ls -d openspec` → No such file or directory），`git ls-files \| grep -c '^openspec/'` → `0` |
| **`docs/index.md` 7 条越级路径** | `docs/index.md -> ../CODE-MAP.md`、`../ARCHITECTURE.md`、`../COMPETITIVE.md`、`../GAP-ANALYSIS.md`、`../AI-AGENT-GAP-ANALYSIS.md`、`../deployment.md`、`../positioning.md` | 这些文件都在 `docs/` 内，应为 `./CODE-MAP.md`，写成 `../` 解析到仓库根 |
| **`.github/` 内相对路径错误** | `.github/ISSUE_TEMPLATE/question.md -> ./docs/`、`./README.md`；`.github/PULL_REQUEST_TEMPLATE.md -> ./AGENTS.md`、`./docs/skills.md` 等 5 条 | 从 `.github/` 出发应为 `../`，用 `./` 解析到 `.github/` 自身 |
| **引用了不存在的文件** | `CONTRIBUTING.md -> ./.github/CODEOWNERS`（文件不存在）；`docs/faq.md -> ./sync-plan.md`（不存在）；`docs/benchmarks.md -> ../../src/evals/dataset/`、`../../src/evals/run.ts`、`../../src/evals/citation-density.ts`（`src/evals` 不存在）；`docs/roadmap.md -> ./pi11.md`（pi11.md 在仓库根，应为 `../pi11.md`） | 重构后未同步链接 |

### 5.3 冗余与结构问题

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P0** | ✅ **已修复（task-4）**：`README.md` 与 `README_CN.md` **都是中文**且**循环互指**、仓库**无英文 README** | 修复前：`diff README.md README_CN.md \| wc -l` → 59（近乎重复）；`README.md:12` 写 `[中文](./README_CN.md)`，`README_CN.md:12` 写 `[English](./README.md)`。修复后：`README.md`（中文，GitHub 默认入口）+ `README_EN.md`（英文，对等重写）+ `README_CN.md` 已 `git rm`；双向互链可达、零死链；`README_CN.md` 独有的 gitcode 镜像 clone 命令已并入 README.md | UpUp 文档问题 |
| **P1** | ARCHITECTURE 三处重叠 | `docs/ARCHITECTURE.md`(130 行) vs `docs/architecture-overview.md`(213 行) vs `docs/architecture/*.md`（6 篇合计 609 行） | UpUp 文档问题 |
| **P1** | GAP-ANALYSIS 双份，且**双双标注 Superseded 并指向不存在的 `openspec/`** | `docs/GAP-ANALYSIS.md`(309 行) vs `docs/AI-AGENT-GAP-ANALYSIS.md`(310 行)，两者首段均含 `> ⚠️ **Superseded** (2026-06-12)` | UpUp 文档问题 |
| **P1** | 竞品分析双份 | `docs/comparison.md`(182 行) vs `docs/COMPETITIVE.md`(273 行) | UpUp 文档问题 |
| **P1** | 定位文档三份 | `docs/positioning.md`(133 行) vs `docs/pi-native-positioning.md`(119 行) vs `docs/pi-native-invest-assistant-analysis.md`(173 行) | UpUp 文档问题 |
| **P1** | 迁移阶段日志占用主树 **~1.1MB** | ✅ **已修复（task-3）**：`pi6/pi7/pi8/pi10/pi11.md` 已 `git mv` 至 `docs/internal/migrations/`；`pi5.md` 因被 `scripts/verify-pi5.ts:52` 真实读取而按 objective 硬约束保留原位 | UpUp 文档问题 |
| **P1** | 一次性审计文档残留 4 篇（972 行） | `docs/pi7-final-summary.md`(109) + `docs/pi-ecosystem-audit-2026-09-15.md`(444) + `docs/pi7-pi-llm-config-audit.md`(333) + `docs/pi7-pi-llm-provider-migration-plan.md`(86) —— **不在 objective 的 4 类归档范围内**，由 task-6 冗余合并处理 | UpUp 文档问题 |
| **P2** | `docs/index.md`（唯一导航入口）为**英文**，与中文优先定位不一致 | `docs/index.md` 82 行，标题 `# UpUp Documentation` | UpUp 文档问题 |
| **P2** | `docs/faq.md` 引用 `./sync-plan.md` 但文件不存在 | 死链扫描 | UpUp 文档问题 |

---

## 6. 维度六：元数据（Metadata）

### 6.1 已具备（顶级项目要素盘点）

```bash
for f in LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md CHANGELOG.md \
         .github/workflows .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md .gitignore; do
  [ -e "$f" ] && echo "✅ $f" || echo "❌ $f"
done
```

| 具备 | 缺失 |
|---|---|
| ✅ `LICENSE`（MIT） | ❌ `.github/dependabot.yml` |
| ✅ `CONTRIBUTING.md` | ❌ `.editorconfig` |
| ✅ `CODE_OF_CONDUCT.md` | ❌ `.nvmrc` |
| ✅ `SECURITY.md` | ❌ `.github/CODEOWNERS`（**被 `CONTRIBUTING.md` 引用 → 死链**） |
| ✅ `CHANGELOG.md` | ❌ `.github/FUNDING.yml`（可选） |
| ✅ `.github/ISSUE_TEMPLATE/`（bug/feature/question 三模板） | |
| ✅ `.github/PULL_REQUEST_TEMPLATE.md` | |
| ✅ `.gitignore` | |
| ✅ CI workflows（2 个） | |

### 6.2 package.json 元数据

```bash
python3 -c "import json;d=json.load(open('package.json'));[print(k,'=',json.dumps(d.get(k),ensure_ascii=False)) for k in ['name','version','license','author','repository','homepage','bugs','keywords','funding']]"
```

| 字段 | 值 | 判定 |
|---|---|---|
| `name` | `upup` | ⚠️ npm 上**已被占用**（见 §7.3） |
| `version` | `2026.9.18` | ✅ CalVer |
| `license` | `MIT` | ✅ |
| `author` | `"UpUp Team"` | ⚠️ 无邮箱/URL（npm 页面显示不完整） |
| `repository` / `homepage` / `bugs` | 已填 GitHub URL | ✅ |
| `keywords` | 15 个 | ✅ |
| `funding` | `null` | P2（可选） |

| 等级 | 问题 | 判定 |
|---|---|---|
| **P1** | 缺 `dependabot.yml` / `.editorconfig` / `.nvmrc` | UpUp 工程配置问题 |
| **P2** | 缺 `.github/CODEOWNERS`（且被 CONTRIBUTING.md 引用为死链） | UpUp 工程配置问题 |
| **P2** | `author` 无联系方式 | UpUp 元数据问题 |

---

## 7. 维度七：社区健康（Community）

### 7.1 GitHub 指标

```bash
gh api repos/louloulin/upup --jq '{stars:.stargazers_count,forks:.forks_count,watchers:.subscribers_count,open_issues:.open_issues_count,license:.license.spdx_id,description:.description}'
# {"forks":1,"open_issues":0,"license":"MIT","stars":2,"watchers":0,"description":null}
gh api repos/louloulin/upup/contributors --jq 'length'   # 21
gh api repos/louloulin/upup/releases --jq 'length'       # 0
```

| 指标 | 值 | 判定 |
|---|---|---|
| stars | 2 | 推广问题（非代码） |
| forks | 1 | 同上 |
| watchers | 0 | 同上 |
| contributors | 21 | ✅ 有外部贡献者 |
| open issues | 0 | 中性 |
| license | MIT | ✅ |
| **description** | **`null`** | **P1 —— GitHub 仓库无描述，直接影响搜索引擎与目录发现** |
| **releases** | **0** | **P1 —— 无任何版本发布记录** |
| **topics** | **无**（API 调用 EOF，仓库页无 topics 标签） | **P1 —— 无 topic 标签，影响 GitHub 搜索发现** |
| wiki | 禁用 | P2（可接受） |

### 7.2 分发渠道

| 等级 | 问题 | 证据 | 判定 |
|---|---|---|---|
| **P1** | 无 npm 发布记录 | `npm view upup` 返回的是**别人的包**（见 7.3） | UpUp 分发问题 |
| **P2** | 无 GitHub Release / 无 CHANGELOG 自动生成 | `gh api .../releases --jq length` → 0 | UpUp 分发问题 |

### 7.3 ⚠️ npm 包名冲突（关键阻塞）

```bash
npm view upup name version description repository maintainers
# name = 'upup'
# version = '1.1.0'
# description = "Control the content users see, even when they're offline"
# repository = { type: 'git', url: 'git+https://github.com/TalAter/UpUp.git' }
# maintainers = 'talater <tal@talater.com>'
```

**`upup` 在 npm 上已被 `TalAter/UpUp`（PWA 离线内容控制库）占用**，`latest=1.1.0`。直接 `npm publish` 会被服务端拒绝（`E403 Package name already exists`）。

**可行路径**（择一）：

| 方案 | 可行性 | 代价 |
|---|---|---|
| 改 unscoped 名（`upup-cli` / `upup-finance` / `upup-zhangzhang` / `upup-invest` —— 均已验证 404 可用） | 高 | 失去 `upup` 标识符 |
| scoped 名 `@louloulin/upup`（已验证 404 可用） | 高 | 需要 npm `louloulin` org 成员资格 |
| scoped 名 `@upup/cli` | 低 | 需要 npm `upup` org 成员资格（现由 TalAter 持有） |
| 向 TalAter 申请转让 | 极低 | 对方无义务 |

**判定**：UpUp 侧（工程/文档/元数据）可推进；**发布阻塞点在上游 name 归属，非 UpUp 代码问题**。

---

## 8. 汇总优先级矩阵

| 等级 | 数量 | 项目 | 归属维度 |
|---|---|---|---|
| **P0** | 2 | 30 条 Markdown 死链（含幽灵 `openspec/`） | 文档 |
| **P0** | — | README 双语混乱（两文件皆中文且循环互指、无英文版） | 文档 |
| **P1** | 12 | `resolvePiModel` 不查 modelRuntime | 架构 |
| | | 20/37 package 未声明 tools/resources/capabilities | 架构 |
| | | 7 个全量跑 timeout 测试 | 测试 |
| | | CI 无覆盖率上报与门禁 | 测试/CI |
| | | 无 Dependabot（6 包落后） | CI |
| | | ARCHITECTURE / GAP-ANALYSIS / comparison / positioning 四组冗余 | 文档 |
| | | ✅ 1.1MB 迁移日志已归档至 `docs/internal/migrations/`（task-3） | 文档 |
| | | 4 篇一次性审计文档残留（task-6） | 文档 |
| | | 缺 dependabot.yml / .editorconfig / .nvmrc | 元数据 |
| | | GitHub description = null | 社区健康 |
| | | GitHub releases = 0 | 社区健康 |
| | | GitHub topics 缺失 | 社区健康 |
| **P2** | 12 | `any` 40 处（extensions）+ 21 处（src） | 代码 |
| | | `console.log` ~38 处未分类 | 代码 |
| | | 10 处 TODO/FIXME 无 issue | 代码 |
| | | skill 作用域 222 个 | 架构 |
| | | 2 处 raw fetch 绕过 provider registry | 架构 |
| | | tsconfig 未覆盖 extensions | 架构 |
| | | 4 处 test.skip 无跟踪 | 测试 |
| | | CI 无 Node 版本矩阵 | CI |
| | | CI 用 `bun-version: latest` 非固定 | CI |
| | | `docs/index.md` 为英文 | 文档 |
| | | 缺 `.github/CODEOWNERS`；`author` 无邮箱；`funding: null` | 元数据 |
| | | npm 包名冲突 | 社区健康 / 分发 |

---

## 9. 「上游/环境问题」vs「UpUp 代码问题」

| 现象 | 归属 | 依据 |
|---|---|---|
| 7 个全量跑 timeout | **UpUp 代码问题**（测试并发预算） | 单跑 0.07–2.24s 必过；`git blame` 早于本仓库近期改动 |
| `Bun.build({target:'node22'})` 抛 `ERR_INVALID_ARG_TYPE` | **上游行为变化**（Bun 1.4.1 收紧 target 取值） | Bun 只接受 `browser\|node\|bun\|macro\|bun-<target>` |
| `miniMax` 端点 429「Token Plan 用量上限」/ 401 | **上游/凭证环境问题** | 非 UpUp 代码缺陷 |
| npm `upup` name 冲突 | **上游 name 归属问题** | TalAter/UpUp 先注册，无技术解法 |
| GitHub stars / watchers 偏低 | **推广问题** | 非工程质量缺陷 |
| skill 作用域 222 个 | **UpUp + Pi 集成口径** | Pi 从三处解析 skill，UpUp 未收窄白名单 |

---

## 10. 本轮未覆盖项（处置建议）

objective 明确的 out-of-scope 文件：`yh.md` / `native1.md` / `SOUL.md` / `CLAUDE.md`。现状与建议：

| 文件 | 体量 | 性质（读自文件头） | 建议 |
|---|---|---|---|
| `yh.md` | 818 行 / 45KB | 「UpUp 性能问题分析与优化方案」，分析日期 2026-09-18，含实测数字，结论引用 `scripts/perf/` | **中间过程产物**。建议移入 `docs/internal/`，把可复用的性能基线结论提炼到 `docs/benchmarks.md` |
| `native1.md` | 517 行 / 29KB | 「LumosAI invest 代码复用与 Rust 加速开发计划」，状态**待实施** | **未来计划**。建议移入 `docs/internal/`，在 `docs/roadmap.md` 保留一条引用 |
| `SOUL.md` | 83 行 / 7KB | Agent 人格设定（「I'm UpUp. A financial research agent who lives in a terminal.」） | **产品资产**，建议保留；可作为 system prompt 品牌化的可读说明，或并入 `README.md` 段落 |
| `CLAUDE.md` | 137 行 / 6.2KB | Claude Code 项目指南，内容与 `AGENTS.md` 高度重叠（同为 agent 指南） | **重复**。建议保留 `AGENTS.md` 为唯一真源，`CLAUDE.md` 改为指向 `AGENTS.md` 的短指针（Claude Code 自动读取该文件名，删除会损失兼容性） |

---

## 11. 与既有文档的关系

| 文档 | 状态 | 说明 |
|---|---|---|
| `docs/GAP-ANALYSIS.md`（本文） | ✅ **canonical** | 生产级就绪度差距分析 v2 |
| `docs/GAP-ANALYSIS.md` v1（2026-06-04） | 已取代 | 「投研 Claude Code 差距分析」，内容见 `git log -- docs/GAP-ANALYSIS.md` |
| `docs/AI-AGENT-GAP-ANALYSIS.md` | 已取代 | 与本文 §1–§2 维度重叠；其 `openspec/` 引用为死链 |
| `docs/roadmap.md` | ✅ canonical | 后续路线图（S1/S2/S3/S4 优先级矩阵） |
| `docs/ARCHITECTURE.md` + `docs/architecture-overview.md` + `docs/architecture/*` | 待合并 | 见 §5.3，由文档治理任务处理 |

---

## 12. 本 goal 的执行边界（对照本文）

| 本文条目 | 是否在本 goal 修复 |
|---|---|
| §5.2 死链（P0） | ✅ 修复（task-6 导航真源 + task-4 README 互链） |
| §5.3 冗余合并（P1） | ✅ 合并（task-6） |
| §5.3 1.1MB 迁移日志（P1） | ✅ 归档（task-3 完成：`docs/internal/migrations/` ×5，`pi5.md` 因硬约束保留） |
| §5.3 一次性审计文档（P1） | ⏳ task-6 处理（4 篇审计文档不在 4 类归档范围，改为并入 `docs/internal/audits/` 或降为交叉引用） |
| §6.1 缺 3 项元数据（P1） | ✅ 补齐（task-5） |
| §3.2 7 个 timeout（P1） | ❌ out of scope（用户明确选择「文档+元数据+缺失 3 项」，不含测试逻辑改动） |
| §4.2 CI 覆盖率 / Node 矩阵（P1/P2） | ❌ out of scope（不做 CI 硬化） |
| §1 `any` / `console.log`（P1/P2） | ❌ out of scope（不碰代码逻辑） |
| §7.3 npm name 冲突 | ❌ out of scope（上游归属问题） |
| §10 四个根 md 文件 | ❌ out of scope（已在本文给出建议） |
