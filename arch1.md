# UpUp 架构能力分析报告

> 版本: 1.0 | 日期: 2026-05-16 | 状态: 完成

---

## 1. 项目概述

**UpUp** 是一个基于 UpUp 的自主金融研究 Agent，旨在为投资研究提供智能化的任务规划、自执行和自我验证能力。

### 1.1 核心定位

```
UpUp = Claude Code 架构 + 金融垂直领域 + A股特色
```

### 1.2 技术栈

| 层级 | 技术选型 |
|------|---------|
| **运行时** | Bun (Node.js 兼容) |
| **LLM 集成** | LangChain + 多Provider支持 (OpenAI/Anthropic/Google/Groq/DeepSeek) |
| **协议层** | MCP (Model Context Protocol) |
| **数据层** | SQLite (better-sqlite3) |
| **SDK** | TypeScript SDK (`@upup/sdk`) |

---

## 2. 核心功能模块

### 2.1 Agent 模块 (`src/agent/`)

#### 2.1.1 核心能力

| 功能 | 描述 | 实现文件 |
|------|------|---------|
| **Agent Loop** | 主循环：生成 → 工具调用 → 验证 | `agent.ts` |
| **工具执行器** | 并发执行只读工具 | `tool-executor.ts` |
| **循环检测** | 防止死循环 | `loop-recovery.ts` |
| **上下文压缩** | 自动压缩历史上下文 | `compact.ts` |
| **微压缩** | 每轮微压缩 | `microcompact.ts` |
| **Plan Mode** | 计划模式状态管理 | `plan-mode-state.ts` |
| **子 Agent** | 并行子任务执行 | `subagent-runner.ts` |
| **Fallback** | 模型降级 | `fallback.ts` |

#### 2.1.2 Agent 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent                                │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│  │ Tool    │  │ Context  │  │ Memory    │  │ Loop     │  │
│  │ Executor│  │ Compress │  │ Manager   │  │ Detector │  │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘  │
│       │              │               │              │       │
│       └──────────────┴───────────────┴──────────────┘       │
│                            │                                   │
│                     ┌──────▼──────┐                          │
│                     │  Main Loop   │                          │
│                     │  (Generator) │                          │
│                     └──────┬──────┘                          │
│                            │                                   │
└────────────────────────────┼───────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌───────────┐      ┌───────────┐      ┌───────────┐
    │  Finance  │      │  Skills   │      │   MCP     │
    │  Tools    │      │  Executor │      │   Tools   │
    └───────────┘      └───────────┘      └───────────┘
```

### 2.2 记忆系统 (`src/memory/`)

#### 2.2.1 四层记忆架构

| 层级 | 类型 | 用途 | 实现 |
|------|------|------|------|
| **Working** | 观察缓冲 | 当前会话观察 | `observation-buffer.ts` |
| **Episodic** | 日常日志 | 会话历史 | `daily-log.ts` |
| **Semantic** | 语义记忆 | 事实/知识 | `ai-selector.ts` |
| **Procedural** | 程序记忆 | 技能/规则 | `consolidation.ts` |

#### 2.2.2 记忆特性

- **AI Selector**: 基于 LLM 的智能记忆召回
- **MemVid MV2**: 本地向量存储（无 Embedding API 依赖）
- **BM25 + MMR**: 混合搜索策略
- **隐私保护**: 记忆白名单/黑名单
- **嵌套路径**: 项目级/团队级记忆隔离

#### 2.2.3 记忆流程

```
提取阶段 (Per-Turn)
    │
    ▼
┌─────────────┐     ┌─────────────┐
│Observation  │ ──► │  Extraction │
│  Buffer     │     │   (LLM)     │
└─────────────┘     └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Deny      │
                    │  (Privacy)  │
                    └──────┬──────┘
                           │
巩固阶段 (Periodic)         │
    │                      ▼
    │              ┌─────────────┐
    │              │   Memory    │
    └─────────────►│   Store     │
                   └──────┬──────┘
                          │
                   ┌──────▼──────┐
                   │ Consolidation│
                   │   (LLM)     │
                   └─────────────┘
```

### 2.3 技能系统 (`src/skills/`)

#### 2.3.1 技能架构

| 特性 | 描述 |
|------|------|
| **技能定义** | Markdown (SKILL.md) |
| **执行模式** | Inline (当前上下文) / Fork (子进程) |
| **参数替换** | `{{args}}`, `{{argument}}`, `${CLAUDE_SKILL_DIR}` |
| **Shell 执行** | `!`command`` 语法 |
| **技能来源** | Builtin / User / Project / Plugin |

#### 2.3.2 内置金融技能

```
src/skills/bundled/
├── batch.ts          # 批量处理
├── dream.ts          # 梦想规划
├── index.ts
├── portfolio-review.ts  # 投资组合回顾
├── research.ts       # 研究分析
├── risk-assessment.ts  # 风险评估
└── stock-screen.ts   # 选股

src/skills/investment/
├── decision-dashboard/   # 决策仪表盘
├── market-brief/        # 市场简报
├── portfolio-review/    # 组合回顾
├── risk-assessment/     # 风险评估
├── stock-analysis/      # 股票分析
└── stock-screening/     # 选股系统
```

### 2.4 MCP 集成 (`src/mcp/`)

#### 2.4.1 MCP 客户端

| 功能 | 描述 |
|------|------|
| **协议** | 官方 MCP SDK (`@modelcontextprotocol/sdk`) |
| **传输** | Stdio / SSE |
| **OAuth** | 支持 OAuth 认证 |
| **健康检查** | 自动重连机制 |
| **工具发现** | 动态工具注册 |

#### 2.4.2 内置 MCP 工具

| 类别 | 工具 |
|------|------|
| **认证** | `auth-tool.ts` |
| **UI** | `mcp-ui.ts` |
| **OAuth** | `oauth.ts` |
| **资源** | `resource-tools.ts` |

### 2.5 工具系统 (`src/tools/`)

#### 2.5.1 工具分类

| 类别 | 数量 | 示例 |
|------|------|------|
| **金融工具** | 20+ | 财务数据、股票价格、分析师预期 |
| **量化工具** | 15+ | 技术指标、期权定价、风险指标 |
| **估值工具** | 5+ | DCF、相对估值、目标价 |
| **搜索工具** | 7+ | Web搜索、文件搜索、代码搜索 |
| **文件系统** | 15+ | 读取、写入、编辑 |
| **Shell** | 13+ | Bash 执行 |
| **其他** | 20+ | 通知、监控、团队协作 |

#### 2.5.2 金融工具详情 (`tools/finance/`)

```
finance/
├── crypto.ts          # 加密货币
├── earnings.ts        # 财报日历
├── estimates.ts       # 分析师预期
├── filings.ts         # SEC 文件
├── fundamentals.ts    # 基本面
├── get-financials.ts  # 获取财务数据
├── get-market-data.ts # 市场数据
├── insider_trades.ts  # 内部交易
├── key-ratios.ts      # 关键比率
├── news.ts            # 新闻
├── read-filings.ts    # 读取公告
├── screen-stocks.ts   # 筛选股票
├── segments.ts        # 业务分部
├── stock-price.ts     # 股价
└── utils.ts           # 工具函数
```

#### 2.5.3 量化工具详情 (`tools/quant/`)

```
quant/
├── data-reliability.ts       # 数据可靠性
├── investment-analysis.ts    # 投资分析
├── options/                  # 期权相关
│   ├── options-pricing.ts   # 期权定价
│   └── ...
├── portfolio-optimization.ts # 组合优化
├── risk-metrics.ts          # 风险指标
├── tax-calculator.ts        # 税费计算
└── technical-indicators.ts  # 技术指标
```

### 2.6 SDK 包 (`packages/sdk/`)

#### 2.6.1 SDK 架构

| 模块 | 功能 |
|------|------|
| **Client** | 主客户端，支持流式/非流式 |
| **Transport** | Stdio / HTTP 传输层 |
| **Tools** | 工具注册表 |
| **Permissions** | 权限管理 |
| **Hooks** | 后置采样钩子 |
| **Session** | 会话管理 |
| **Pool** | 进程池 |
| **Memory** | 记忆工具 |

#### 2.6.2 SDK 导出

```typescript
// 核心
export { UpClient, createClient } from './client/client.js'

// 传输
export { StdioTransport, HttpTransport } from './transport/index.js'

// 工具
export { ToolRegistry } from './tools/index.js'

// 权限
export { PermissionManager } from './permissions/index.js'

// 钩子
export { HookExecutor, HookRegistry, PostSamplingHooks } from './hooks/index.js'

// 会话
export { SessionManager } from './session/index.js'

// 错误
export { SDKError, SessionError, ToolError } from './errors.js'
```

### 2.7 网关系统 (`src/gateway/`)

| 功能 | 描述 |
|------|------|
| **多渠道** | WhatsApp、桌面导入、OAuth |
| **会话路由** | 智能路由分发 |
| **心跳** | 保活机制 |
| **群组** | 群组聊天支持 |

---

## 3. 核心能力对标分析

### 3.1 与 Claude Code 对比

| 能力维度 | Claude Code | UpUp | 差异说明 |
|----------|-------------|--------|----------|
| **Agent 架构** | 单 Agent | 单 Agent + 子 Agent | 相似架构 |
| **上下文压缩** | 自动压缩 | 双重压缩 (微+全) | UpUp 更细粒度 |
| **工具执行** | 并发/串行 | 并发/串行 | 相似 |
| **循环检测** | 内置 | Loop Detector | 相似 |
| **记忆系统** | 4 层记忆 | 4 层记忆 | 几乎一致 |
| **技能系统** | Skills | Skills | 几乎一致 |
| **MCP 支持** | 原生 | MCP Client | Claude Code 更完整 |
| **SDK** | `@anthropic-ai/sdk` | `@upup/sdk` | 功能对标 |

### 3.2 与竞品对比总表

| 能力 | UpUp | Claude Code | Cursor | Devin | Copilot | Aider | Goose |
|------|--------|-------------|--------|-------|---------|-------|-------|
| **金融垂直** | ✅✅✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **A股数据** | ✅✅✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **多 Provider** | ✅✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **MCP 协议** | ✅✅ | ✅✅ | ❌ | ❌ | ✅ | ❌ | 基础 |
| **4 层记忆** | ✅✅✅ | ✅✅✅ | ✅ | ✅ | ✅ | ❌ | 基础 |
| **技能系统** | ✅✅ | ✅✅ | ✅ | 有限 | ✅ | ❌ | 基础 |
| **SDK** | ✅✅ | ✅✅ | ❌ | ✅ | 有限 | ❌ | 基础 |
| **本地部署** | ✅ | ✅ | ❌ | ❌ | 有限 | ✅ | ✅ |
| **开源** | ✅ | 部分 | ❌ | ❌ | 部分 | ✅ | ✅ |

### 3.3 差异化优势

#### 3.3.1 金融垂直能力 (独家)

| 能力 | 描述 | 竞品对比 |
|------|------|---------|
| **财务数据工具** | 财报、指标、预期 | 所有竞品无 |
| **估值工具** | DCF、相对估值、目标价 | 所有竞品无 |
| **量化工具** | 技术指标、风险指标 | 所有竞品无 |
| **选股系统** | 多维度筛选 | 所有竞品无 |
| **投资组合分析** | 组合回顾、风险评估 | 所有竞品无 |

#### 3.3.2 A股特色 (独家)

| 能力 | 描述 |
|------|------|
| **Tushare/AKShare** | A股数据接口 |
| **东方财富** | 市场数据 |
| **公告解读** | A股特有 |
| **涨跌幅分析** | A股特色 |

#### 3.3.3 架构优势

| 优势 | 说明 |
|------|------|
| **记忆系统** | MemVid MV2 无需外部 Embedding API |
| **双重压缩** | 微压缩 + 全压缩，更省 Token |
| **多 Provider** | 支持 5+ LLM 提供商 |
| **插件架构** | 支持插件扩展 |

---

## 4. 架构模式分析

### 4.1 设计模式

| 模式 | 应用 |
|------|------|
| **Generator** | Agent 主循环 (`async generator`) |
| **Observer** | 事件驱动 (`EventEmitter`) |
| **Registry** | 工具/技能注册表 |
| **Factory** | SDK 客户端工厂 |
| **Strategy** | 多 Provider 策略 |

### 4.2 架构分层

```
┌─────────────────────────────────────────┐
│           CLI / SDK 入口               │
├─────────────────────────────────────────┤
│            Session 层                   │
│    (会话管理、消息队列、历史)            │
├─────────────────────────────────────────┤
│            Agent 层                     │
│  (主循环、工具执行、压缩、循环检测)      │
├─────────────────────────────────────────┤
│            Tools 层                     │
│  (金融、量化、文件、搜索、Shell)         │
├─────────────────────────────────────────┤
│            MCP 层                       │
│    (协议、传输、OAuth、健康检查)         │
├─────────────────────────────────────────┤
│           Memory 层                    │
│   (提取、存储、召回、巩固、隐私)          │
├─────────────────────────────────────────┤
│            Skills 层                    │
│    (执行器、加载器、注册表)              │
└─────────────────────────────────────────┘
```

### 4.3 接口设计 (Seams)

| 接口 | 实现 | 用途 |
|------|------|------|
| `AgentConfig` | `agent.ts` | Agent 配置 |
| `StructuredToolInterface` | LangChain | 工具接口 |
| `MCPServerConnection` | `mcp/client.ts` | MCP 连接 |
| `SkillCommand` | `skills/types.ts` | 技能命令 |
| `MemoryStore` | `memory/store.ts` | 记忆存储 |

---

## 5. 技术债务与改进建议

### 5.1 待改进项

| 优先级 | 问题 | 建议 |
|--------|------|------|
| **P1** | MCP 服务端缺失 | 实现 MCP Server |
| **P1** | SDK 文档不完整 | 补充 API 文档 |
| **P2** | 测试覆盖率不足 | 增加单元测试 |
| **P2** | 错误处理不一致 | 统一错误类型 |
| **P3** | 日志系统分散 | 统一日志框架 |

### 5.2 架构优化建议

| 建议 | 理由 |
|------|------|
| **引入 DI 容器** | 解耦模块依赖 |
| **抽象存储层** | 支持多数据库后端 |
| **完善 Webhook** | 增强外部集成 |

---

## 6. 总结

### 6.1 核心定位

```
UpUp = Claude Code 架构 + 金融垂直领域 + A股特色
```

### 6.2 能力矩阵

| 维度 | 评分 | 说明 |
|------|------|------|
| **Agent 能力** | 8/10 | 完整的 Agent 架构 |
| **工具生态** | 9/10 | 丰富的金融工具 |
| **记忆系统** | 8/10 | 4 层记忆 + MemVid |
| **技能系统** | 7/10 | 功能完整但生态待建设 |
| **SDK 能力** | 7/10 | 核心功能具备 |
| **MCP 集成** | 6/10 | 仅客户端，无服务端 |
| **差异化** | 10/10 | 金融垂直 + A股独家 |

### 6.3 竞品定位

| 竞品 | UpUp 优势 | UpUp 劣势 |
|------|-------------|-------------|
| Claude Code | 金融垂直、A股数据 | SDK 生态 |
| Devin | 本地部署、成本可控 | 云端协作 |
| Copilot | 本地部署、自主权 | Microsoft 生态 |

---

## 附录

### A. 关键文件索引

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/agent/agent.ts` | 43791 | 核心 Agent |
| `src/memory/index.ts` | 400+ | 记忆系统入口 |
| `src/skills/executor.ts` | 600+ | 技能执行器 |
| `packages/sdk/src/index.ts` | 300+ | SDK 导出 |

### B. 参考资料

- Claude Code Agent SDK 文档
- LangChain 工具定义
- MCP 协议规范

---

*报告生成时间: 2026-05-16*
