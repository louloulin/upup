# UpUp (涨涨) 🤖

> 深度金融研究 AI Agent —— 基于 Dexter 核心改造，融合 Claude Code 设计理念

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 项目起源

**UpUp (涨涨)** 是对 [Dexter](https://github.com/virattt/dexter) 的深度改造版本，继承了其金融研究能力，并融合了 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的核心设计理念：

- **从 Dexter 继承**: 完整的金融数据分析框架、工具系统、多数据源集成
- **从 Claude Code 学习**: 权限管理模式、Session 状态管理、TUI 交互设计、插件架构

---

## 核心特性

### 🎯 金融研究能力

| 能力 | 说明 |
|------|------|
| **A股深度分析** | 财报数据、技术指标、资金流向、估值模型 |
| **多数据源集成** | Tushare Pro, AKShare, Financial Datasets API |
| **回测引擎** | 策略历史表现验证 |
| **舆情分析** | 新闻情感、机构持仓、分析师评级 |
| **风险管理** | 波动率计算、头寸限制、止损策略 |

### 🏗️ 技术架构 (来自 Claude Code 灵感)

| 组件 | 描述 |
|------|------|
| **Session 2.0** | 完整对话历史、状态持久化、会话恢复 |
| **权限系统** | 多层权限控制、`--dangerously` 模式、规则持久化 |
| **插件架构** | UpUp Plugin API，支持 Bun/Jiti/WASM/MCP 多运行时 |
| **Skill 系统** | 动态 Skill 加载、组合执行 |
| **TUI 组件** | 富文本交互、Approval 提示、Debug 面板 |

### 🔧 开发体验

```bash
bun start          # 交互式 TUI 模式
bun dev            # 开发模式（热重载）
bun test           # 测试套件
```

---

## 快速开始

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/virattt/upup.git
cd upup

# 安装依赖
bun install
```

### 配置环境变量

```bash
# 复制环境变量模板
cp env.example .env

# 编辑 .env 添加必要的 API Keys
```

**推荐配置:**

```env
# LLM Provider (至少配置一个)
ANTHROPIC_API_KEY=sk-ant-...        # Claude 模型
OPENAI_API_KEY=sk-...               # GPT 模型
DEEPSEEK_API_KEY=sk-...             # DeepSeek 模型

# 金融数据 (A股必需)
TUSHARE_TOKEN=your_tushare_token    # https://tushare.pro

# 搜索能力 (可选)
EXASEARCH_API_KEY=your_exa_key      # Web 搜索

# UpUp 权限模式 (可选)
UPUP_DANGEROUSLY_MODE=true          # 启用无授权模式
```

### 运行

```bash
# 交互式 TUI
bun start

# 单次查询
bun run src/run.ts "分析贵州茅台的财务状况"

# 无授权模式 (无需每个操作确认)
bun --dangerously "批量分析A股科技股"
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UpUp Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │    CLI      │     │    TUI      │     │  Bundled    │           │
│  │  (dexter)   │     │  (Claude)   │     │   Runner    │           │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         └────────────────────┴────────────────────┘                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Agent Core                                │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │  Capability │  │   Session   │  │   Skill    │           │  │
│  │  │  Registry   │  │   State     │  │  Executor  │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐               │
│         ▼                    ▼                    ▼               │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐       │
│  │   Tools     │      │   Skills     │      │ Components   │       │
│  │   (64+)     │      │   (25+)      │      │   (16)       │       │
│  │             │      │              │      │              │       │
│  │ • Bash      │      │ • medfish    │      │ • ChatLog    │       │
│  │ • Read/Edit │      │ • technical  │      │ • Approval   │       │
│  │ • A股数据   │      │ • backtest   │      │ • Debug      │       │
│  │ • 回测     │      │ • risk-mgmt  │      │ • StatusBar  │       │
│  └─────────────┘      └─────────────┘      └─────────────┘       │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Packages (17+)                         │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │  │
│  │  │   llm   │  │ memory  │  │  sdk    │  │ plugins │        │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 核心模块来源

| 模块 | 来源 | 描述 |
|------|------|------|
| `agent/` | Dexter | Agent 运行逻辑、工具注册 |
| `tools/` | 混合 | Bash、文件系统、金融工具 |
| `session/` | Claude Code | Session 状态、权限模式 |
| `components/` | Claude Code | TUI 组件库 |
| `packages/sdk/` | 新设计 | UpUp Plugin SDK |

---

## 权限系统

UpUp 采用多层权限架构，参考 Claude Code 的设计：

### 权限模式

```typescript
// Session 级别
type PermissionMode =
  | 'default'           // 标准权限检查
  | '.accept-all'       // 接受所有提示
  | 'bypassPermissions' // 绕过所有检查
  | 'dangerously';      // 允许危险操作

// Bash 工具级别
type BashMode = 'bypass' | 'allow' | 'ask' | 'deny';
```

### CLI 标志

```bash
# 危险模式 - 允许所有操作
bun --dangerously "执行批量分析"

# 无授权模式 - 绕过权限检查
bun --bypass "快速查询"

# 安全模式
bun --safe "首次运行"
```

### 内置 bypass 规则

以下命令自动放行，无需授权：

| 类别 | 命令 |
|------|------|
| 基础 | `pwd`, `echo`, `cd`, `ls` |
| 读取 | `cat`, `grep`, `find`, `wc` |
| Git | `git status`, `git log`, `git diff`, `git show` |

---

## 插件系统

UpUp 支持多运行时插件架构 (来自 Claude Code 灵感):

### 插件类型

| 运行时 | 说明 | 沙箱级别 |
|--------|------|----------|
| `bun` | Native ESM，高性能 | `process` |
| `jiti` | TypeScript 原生执行 | `process` |
| `wasm` | WebAssembly 安全隔离 | `wasm` |
| `mcp` | Model Context Protocol | `mcp` |

### 插件结构

```
my-plugin/
├── upup.plugin.json    # 插件清单
├── src/
│   ├── index.ts        # 入口
│   └── tools/          # 工具定义
└── package.json
```

### 插件示例

```json
{
  "schemaVersion": "1.0",
  "id": "my-stock-analyzer",
  "name": "Stock Analyzer",
  "runtime": "bun",
  "capabilities": ["tools"],
  "security": {
    "sandbox": "process"
  }
}
```

---

## Skill 系统

UpUp 内置丰富的金融研究 Skill：

### 核心 Skill

| Skill | 功能 |
|-------|------|
| `medfish` | 医疗器械/医药行业分析 |
| `technical-analysis` | 技术指标计算 (RSI, MACD, 布林带) |
| `backtesting` | 策略回测引擎 |
| `risk-management` | 风险管理工具 |
| `sentiment-analysis` | 舆情情感分析 |
| `financial-data` | 金融数据获取 |
| `fundamental-analysis` | 基本面分析 |

### 使用示例

```
> 分析医药行业
[Skill: medfish] 已加载
[Skill: financial-data] 已加载
```

---

## 目录结构

```
dexter/                          # 项目根目录
├── src/
│   ├── agent/                   # Agent 核心
│   │   ├── agent.ts
│   │   ├── capability-registry.ts
│   │   └── fallback-handler.ts
│   ├── tools/                   # 工具系统 (64+)
│   │   ├── bash/               # Bash 工具 (来自 Claude Code)
│   │   ├── filesystem/          # 文件系统工具
│   │   ├── financial/          # 金融数据工具
│   │   └── types.ts
│   ├── session/                # Session 管理 (来自 Claude Code)
│   │   ├── session-state.ts
│   │   └── render/
│   ├── components/             # TUI 组件 (来自 Claude Code)
│   ├── commands/               # Slash 命令
│   ├── hooks/                  # Hook 系统
│   ├── skills/                 # Skill 加载器
│   ├── cli.ts                  # CLI 入口
│   └── run.ts                  # Bundled Runner
├── packages/
│   ├── sdk/                    # UpUp Plugin SDK
│   ├── llm/                    # LLM 适配器
│   ├── memory/                 # 记忆系统
│   └── plugins/               # 插件基础设施
├── docs/                       # 文档
├── tests/                      # 测试
└── package.json
```

---

## 配置参考

### settings.local.json

```json
{
  "permissions": {
    "dangerouslyAllow": false,
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(npm run:*)",
      "Read(CLAUDE.md)",
      "Read(README.md)"
    ],
    "deny": [
      "Bash(sudo *)",
      "Bash(chmod 777 *)"
    ]
  },
  "env": {
    "DEFAULT_MODEL": "claude-sonnet-4-20250514",
    "UPUP_DANGEROUSLY_MODE": "false"
  }
}
```

---

## 开发指南

### 本地开发

```bash
# 安装依赖
bun install

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun run build
```

### 调试

```bash
# 查看 Scratchpad 日志
cat .upup/scratchpad/*.jsonl | jq

# 调试模式
DEBUG=* bun start

# 权限调试
DEBUG=permissions bun run src/run.ts "test"
```

---

## 致谢

**UpUp (涨涨)** 的诞生离不开以下项目的启发：

| 项目 | 贡献 |
|------|------|
| [Dexter](https://github.com/virattt/dexter) | 金融研究框架、多数据源集成、核心工具系统 |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | 权限架构、Session 管理、TUI 设计、插件系统 |

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>