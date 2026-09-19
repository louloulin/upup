# UpUp 文档导航

<p align="center">
  <img src="./images/upup-welcome.png" alt="UpUp (涨涨)" width="640">
</p>

> **本文件是 UpUp 文档的「唯一导航真源」。** 任何其他文档入口（README、子目录 README）只做摘要并指回本页；
> 新增文档请在此登记，避免出现第二份彼此漂移的索引。

**UpUp（涨涨）** 是 Pi-native 的中文投研 AI 助手：Pi 提供 agent runtime / TUI / session / 扩展宿主，
UpUp 贡献金融域数据栈、`/invest` 五阶段投研工作流、投资记忆与推送渠道。

---

## 1. 我想……

| 我是…… | 从这里开始 |
|---|---|
| **第一次使用** | [`quickstart.md`](./quickstart.md) — 10 分钟跑通第一个 `/invest` |
| **A 股 / 港股投资者** | [`a-share.md`](./a-share.md) — Tushare Pro / AKShare / 东方财富与 A 股约定 |
| **想知道有哪些命令** | [`commands.md`](./commands.md) — 全部 slash 命令参考（投研命令族 + Pi 内建） |
| **想理解投研流程** | [`investment-workflow.md`](./investment-workflow.md) — `/invest` 五阶段深潜 |
| **想写 Pi Package 插件** | [`pi-plugin-authoring.md`](./pi-plugin-authoring.md)、[`plugins.md`](./plugins.md) |
| **想写 skill** | [`skills.md`](./skills.md) — skill resource 结构与调用 |
| **想扩展 Agent / SOP** | [`upup-developer-guide.md`](./upup-developer-guide.md) — 自定义 SOP 与 Agent |
| **要部署 / 运维** | [`deployment.md`](./deployment.md) — 本地 / Docker / 私有化 |
| **想贡献代码** | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) + [`../AGENTS.md`](../AGENTS.md) |
| **遇到问题** | [`faq.md`](./faq.md) |
| **只看真实输出长什么样** | [`showcase.md`](./showcase.md) — 匿名化的真实报告样例 |

---

## 2. 架构与内部

| 文档 | 内容 |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **架构 canonical**：核心原则、分层与依赖方向、Pi Runtime 边界、跨包 Port、金融安全与证据 |
| [`CODE-MAP.md`](./CODE-MAP.md) | 代码地图：目录 → 职责 → 入口文件 |
| [`session-and-permissions.md`](./session-and-permissions.md) | Session 生命周期与权限模型（含 fail-closed 默认 deny） |
| [`i18n.md`](./i18n.md) | 中英双语与 brand extension（`before_agent_start` 改写身份） |

**Pi5 期专题记录**（保留原位：`scripts/verify-pi5.ts` 以 `existsSync` 硬断言其存在，见 `bun run verify:pi5`）：

- [`architecture/pi5-runtime.md`](./architecture/pi5-runtime.md)
- [`architecture/plugin-ecosystem.md`](./architecture/plugin-ecosystem.md)
- [`architecture/finance-dataflow.md`](./architecture/finance-dataflow.md)
- [`architecture/session-lifecycle.md`](./architecture/session-lifecycle.md)
- [`architecture/multi-agent-dataflow.md`](./architecture/multi-agent-dataflow.md)
- [`architecture/invest-workflow.md`](./architecture/invest-workflow.md)

> 与 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 冲突时，以 `ARCHITECTURE.md` 为准（它记录 Pi7 期现状）。

---

## 3. 质量与验证

| 文档 / 命令 | 用途 |
|---|---|
| [`benchmarks.md`](./benchmarks.md) | Eval 框架（`packages/pi-evals/`）与结果 |
| [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) | **差距分析 canonical（v2）**：代码 / 架构 / 测试 / CI / 文档 / 元数据 / 社区健康 7 维度，逐项含可复现证据 |
| [`upup-developer-guide.md`](./upup-developer-guide.md) | 开发者指南：SOP / Agent 定义、运行与校验 |
| [`../CHANGELOG.md`](../CHANGELOG.md) | 发布变更记录 |

验证入口：

```bash
bun run typecheck               # 0 error
bun run lint:scc                # 循环依赖 / 反向层依赖
bun run check:pi7               # 单 factory、零生产 global registry
bun test                        # 全量测试
bun run verify:pi7-final        # 24 套产品验收合同（一键 orchestrator）
```

> 12 项静态门禁的完整清单见 [`AGENTS.md`](../AGENTS.md)。

---

## 4. 定位与竞品

| 文档 | 内容 |
|---|---|
| [`pi-native-positioning.md`](./pi-native-positioning.md) | **定位 canonical**：Pi 是 runtime、UpUp 是产品；非目标与合规姿态 |
| [`COMPETITIVE.md`](./COMPETITIVE.md) | **竞品 canonical**：13 竞品 × 7 维度矩阵 + 4 项量化差异化（数据源 `src/competitive-positioning/`） |
| [`roadmap.md`](./roadmap.md) | 路线图（含中文后续规划章节） |

---

## 5. 历史归档

以下内容为**中间过程产物**，已用 `git mv` 迁入 [`internal/`](./internal/)（保留 git history，主树零残留引用）。
**它们仅作历史记录，不代表当前状态**；当前状态以本页 §2–§4 的 canonical 文档为准。

| 归档位置 | 内容 | 清单 |
|---|---|---|
| [`internal/migrations/`](./internal/migrations/) | Pi6–Pi11 迁移日志（约 1.1 MB） | [`ARCHIVE-MANIFEST.md`](./internal/ARCHIVE-MANIFEST.md) |
| [`internal/analysis/`](./internal/analysis/) | Pi Native 迁移期的状态 / 计划 / 截断与可插拔分析 | 同上 |
| [`internal/audits/`](./internal/audits/) | 一次性审计文档（AI agent gap、生态审计、LLM config、最终摘要等） | 同上 |
| [`internal/architecture/`](./internal/architecture/) | Pi5 期架构概览（`architecture-overview.md`，描述已删除的 Ink TUI） | 同上 |
| [`internal/positioning/`](./internal/positioning/) | 早期定位与英文竞品对照（`positioning.md`、`comparison.md`） | 同上 |
| [`internal/superpowers/`](./internal/superpowers/) | 历史 plan / report / spec | 同上 |
| [`internal/comet/`](./internal/comet/) | comet 工作流的归档 brief / state / verification | 同上 |

- 归档判定规则、消费者扫描覆盖与黑名单：[`internal/ARCHIVE-MANIFEST.md`](./internal/ARCHIVE-MANIFEST.md)
- Pi5 验收基线（**保留在仓库根**，被 `scripts/verify-pi5.ts` 真实读取）：[`../pi5.md`](../pi5.md)

---

## 6. 仓库根文件

| 文件 | 说明 |
|---|---|
| [`../README.md`](../README.md) | 中文 README（GitHub 默认入口） |
| [`../README_EN.md`](../README_EN.md) | English README |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | 贡献指南 |
| [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | 社区行为准则 |
| [`../SECURITY.md`](../SECURITY.md) | 漏洞披露流程 |
| [`../AGENTS.md`](../AGENTS.md) | 仓库工程约束（贡献者 / agent 必读） |
| [`../LICENSE`](../LICENSE) | MIT |

---

<p align="center"><strong>UpUp (涨涨) — 涨，涨，一直涨。 📈</strong></p>
