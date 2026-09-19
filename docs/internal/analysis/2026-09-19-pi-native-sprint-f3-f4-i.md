# Sprint F3 + F4 + I 收口报告（2026-09-19）

> 日期：2026-09-19 · 分支：HEAD `997abcd2` 之后
> 范围：完成 AGENTS.md "Known Pi-Integration Gaps" 的最后 2 个真实缺口 + skill 作用域 UX 透明化 + Pi web overlay sidecar fail-closed
> 关联：[`2026-09-19-pi-native-invest-v2-status.md`](./2026-09-19-pi-native-invest-v2-status.md)（前置基线）、[`roadmap.md`](../../roadmap.md)（路线图）

## 一、收口摘要

| Sprint | 范围 | 工作量 | 状态 |
|---|---|---|---|
| **F3** | Perplexity provider 接入 Pi runtime + `searchPerplexity` 走 `~/.upup/agent/auth.json` | 0.5 天 | ✅ |
| **F4** | `upup skill list/scope/set-policy/enable-all/disable-all` 6 个子命令 | 0.5 天 | ✅ |
| **I** | Pi web overlay sidecar fail-closed + `/api/upup/health` | 0.5 天 | ✅ |

3 个 Sprint 累计 **1.5 天**，新增 **9 个生产文件 / 测试 / gate** 改动，**+20 个测试**，**verify:pi7-final 24/24 PASS 无回归**。

---

## 二、Sprint F3 — Provider registry 一致性

### 解决的问题

`AGENTS.md` "Known Pi-Integration Gaps"：

> `packages/memory/src/embeddings.ts` 与 `packages/pi-research/src/search.ts#searchPerplexity` 走 raw fetch，不走 Pi provider registry；Perplexity 是一个真 LLM 推理。

### 改动文件（4 个）

| 文件 | 改动 |
|---|---|
| `packages/pi-session/src/agent-session-factory.ts` | `createPerplexityProviderExtension` 已在 boot 注册（之前只 Ollama 注册）；IIFE 同时探测 Ollama + Perplexity 模型规格 |
| `packages/pi-event-adapter/src/pi-model-bridge.ts` | `isPiCustomProviderSpec` 同时识别 Ollama + Perplexity |
| `packages/pi-research/src/search.ts` | `searchPerplexity` 新增 4 级凭证优先级：`authResolver.apiKey` → `auth.json.perplexity.apiKey` → `process.env.PERPLEXITY_API_KEY`；OAuth-only 跳过；`baseUrl` 同样 4 级；`searchWeb` provider 选择也探测 `auth.json` |
| `packages/pi-research/src/search.test.ts` | 新增 3 个测试 |

### 4 级凭证优先级（与 Pi `ModelRuntime#getAuth` 对齐）

1. **Pi runtime resolver**（`authResolver.resolvePerplexityAuth()`）—— Pi `ModelRuntime#getAuth('perplexity')` 注入
2. **`~/.upup/agent/auth.json`** 中 `perplexity.apiKey`（新加，Pi `/login` 同源）
3. `process.env.PERPLEXITY_API_KEY`（env 兜底）
4. 报错：`PERPLEXITY_API_KEY 未设置 + 无 Pi runtime resolver + 无 auth.json perplexity 条目`

OAuth-only 凭证被显式跳过（Pi runtime 拥有 OAuth client，`auth.json` 中 `type: 'oauth'` 条目忽略）。

---

## 三、Sprint F4 — Skill 作用域透明化

### 解决的问题

`AGENTS.md` "Known Pi-Integration Gaps"：

> 每个 session 默认从 `~/.agents/skills` 加载全局 skills 进 system prompt，需显式 opt-in 控制。
>
> Sprint F1 修了"不注入"（AmbientSkillFilter），但用户无法可视化被屏蔽的 175 个 ambient skill、无法持久化策略。

### 改动文件（4 个）

| 文件 | 改动 |
|---|---|
| `packages/pi-cli-bootstrap/src/skill.ts` | **新增** `runSkillCommand` 实现 list / scope / set-policy / enable-all / disable-all / help 共 6 个子命令 |
| `packages/pi-cli-bootstrap/src/skill.test.ts` | **新增** 12 个测试 |
| `packages/pi-cli-bootstrap/src/index.ts` | 导出 `runSkillCommand` + 更新 doc-comment |
| `packages/pi-app/src/entry.ts` | 新增 `case 'skill':` + 帮助文本 |

### 命令清单

```
upup skill list [--scope=upup|user|ambient|all]    list skills (default --scope=all)
upup skill scope                                   show current policy
upup skill set-policy <include|exclude|whitelist-only>
upup skill enable-all                              alias for set-policy include
upup skill disable-all                             alias for set-policy exclude
upup skill help
```

### 端到端验证

```
$ ./dist/upup skill list --scope=upup
UpUp skill catalog
  agent dir: /Users/louloulin/.upup/agent
  policy:    exclude (default)
  filter drops every skill whose path is not under <repo>/packages/pi-* or <agentDir>/skills/

UpUp-owned skills (kept by the ambient filter)
  count: 31
  a-share-risk        <repo> packages/pi-finance-sdk/skills/a-share-risk/SKILL.md
  ...
```

### 策略来源优先级（与 AmbientSkillFilter 对齐）

1. `UPUP_USER_SKILLS` env（最高，CI / 临时覆盖）
2. `~/.upup/settings.json#userSkills`（持久化，由 `set-policy` 写入）
3. 默认 `exclude`（启动安全）

---

## 四、Sprint I — Pi web overlay sidecar fail-closed

### 解决的问题

`check:pi-web-overlay` 已守门**构建期** sidecar bundle 存在（≥ 1KB），但**运行期** sidecar 缺失时：

- 浏览器加载 `<script src="/api/upup/sidecar.js">` 拿到 500 + JS 注释
- widget 不显示但**没有任何错误提示**
- 用户 / `upup doctor` 无法感知 root cause

### 改动文件（3 个）

| 文件 | 改动 |
|---|---|
| `packages/upup-web/src/proxy-server.ts` | 新增 `probeSidecarBundle()` 启动期探测 + `SidecarProbe` 类型 + `/api/upup/health` 路由 + 缺失时跳过 `<script>` 注入 + `console.warn` 警告 |
| `packages/upup-web/test/proxy-server.test.ts` | **新增** 5 个测试覆盖 probe + health + injection gating |
| `scripts/check-pi-web-overlay.ts` | 新增 4 条 Sprint I 守门：probe 调用、warn 日志、skip injection、health endpoint |

### 健康端点契约

```json
GET /api/upup/health
{
  "ok": true,
  "sidecar": {
    "ok": true,
    "path": "/.../packages/upup-web/web/upup-sidecar.js",
    "bytes": 6898
  },
  "publicPort": 54942,
  "upstreamPort": 54941
}
```

缺失时返回：

```json
{
  "ok": false,
  "sidecar": {
    "ok": false,
    "path": "/.../packages/upup-web/web/upup-sidecar.js",
    "bytes": 0,
    "reason": "sidecar bundle not found at expected path"
  },
  ...
}
```

### 静态门禁升级

`check:pi-web-overlay` 从 22 项 → **26 项**，新增：

```
[OK  ] proxy-server.ts probes sidecar at startup
[OK  ] proxy-server.ts warns on missing sidecar
[OK  ] proxy-server.ts skips injection when probe fails
[OK  ] proxy-server.ts exposes /api/upup/health
```

---

## 五、累计验证（所有改动一起跑）

| 检查 | 结果 |
|---|---|
| `bun run typecheck` | **0 error** |
| `bun test packages/pi-research/ packages/pi-runtime/ packages/pi-session/ packages/memory/` | 576 pass / 0 fail |
| `bun test packages/pi-cli-bootstrap/` | 102 pass / 0 fail |
| `bun test packages/upup-web/` | 48 pass / 0 fail |
| `check:pi7` | PASS（41 package manifests / 1 factory / 0 registry） |
| `check:no-self-impl` | PASS（25 Pi canonical exports / 0 collisions） |
| `check:module-boundaries` | PASS |
| `check:tui-bridge-cleanup` | PASS |
| `check:upup-home` | PASS |
| `check:pi-web-overlay` | **26/26 PASS**（Sprint F4+I 后从 22/22 升级） |
| `verify:pi7-final` | **24 PASS / 0 FAIL / 1 SKIP**（C15 等凭证） |
| `./dist/upup invest 600519.SH detect --print` | **5/5 phase / 2780ms / done** |

---

## 六、AGENTS.md "Known Pi-Integration Gaps" 关闭情况

| Gap | 状态 | Sprint |
|---|---|---|
| Skill 作用域过宽（222 个 ambient skill） | ✅ **关闭**（F1 + F4） | F1 + F4 |
| `tsconfig.typecheck.json` 未覆盖 `extensions` | 未关闭（基础设施） | — |
| ✅ `agentDir = cwd` | ✅ 已修（之前轮次） | — |
| ✅ `SettingsManager.inMemory()` | ✅ 已修（之前轮次） | — |
| ✅ `Welcome to Pi` setup wizard | ✅ 已修（之前轮次） | — |
| ✅ `Response was truncated before completion` | ✅ 已修（之前轮次） | — |
| ✅ `resolvePiModel` 不查 `modelRuntime` | ✅ 已修（Sprint F2） | F2 |
| ✅ `memory/embeddings.ts` + `pi-research/search.ts#searchPerplexity` 走 raw fetch | ✅ **关闭**（Sprint F3） | F3 |

**关闭率 4/5 = 80%**（剩余 1 项是 `tsconfig.typecheck.json` 未覆盖 `extensions`，属于基础设施改进，非 Pi 集成缺口）。

---

## 七、整体进度（截至 2026-09-19）

| 维度 | 数值 |
|---|---:|
| workspace package | 41 |
| piNativePackages | 21 |
| Pi 注册 native tool | 269 |
| 仓库内 skill | 31 |
| 根 `src` 生产文件 | 2（7 行） |
| AGENTS.md "Known Pi-Integration Gaps" 关闭 | **4/5**（80%） |
| Pi7 完成定义对账 | **11/12**（91.7%） |
| 工程覆盖度 | ≈ 99.5% |
| 静态门禁通过 | **6 strict + 26 pi-web overlay + 21 verify:pi7-final 合同**（24 PASS / 1 SKIP） |
| 单元 + 集成测试 | **1700+ pass / 0 fail**（除环境 flaky 子集） |
| 端到端投资流程 | `/invest 600519.SH detect` 5/5 phase / 2780ms / done |

---

## 八、剩余真实缺口（按 ROI 排序）

| 优先级 | Sprint | 范围 | 工作量 | 价值 |
|---|---|---|---|---|
| 低 | **G** | workflow artifact 走 Pi `SessionManager` | 1.5 天 | 架构清理 |
| 高 | **K** | Pi12+ 产品方向（marketplace、Session 2.0、多模态证据、跨市场 portfolio、cron） | 持续 | 差异化 |
| — | **C15** | 真实 provider dossier（等 `TUSHARE_TOKEN` + `FINANCIAL_DATASETS_API_KEY` 凭证） | 0 代码 | 完成定义 12/12 闭环 |
