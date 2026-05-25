# UpUp (涨涨) 🤖

> 深度金融研究 AI 智能体 —— 基于 Dexter 构建，融合 Claude Code 设计理念

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 项目概述

**UpUp (涨涨)** 是一个深度金融研究 AI 智能体，融合了两个优秀项目的核心优势：

- **继承自 Dexter**: 完整的金融数据分析框架、工具系统、多数据源集成
- **学习自 Claude Code**: 权限管理模式、Session 状态管理、TUI 交互设计、插件架构

### 核心特性

| 类别 | 功能 |
|------|------|
| **金融研究** | A股分析、技术指标、资金流向、估值模型 |
| **数据源** | Tushare Pro、AKShare、Financial Datasets API |
| **分析工具** | 回测引擎、舆情分析、风险管理 |
| **架构** | Session 2.0、权限系统、多运行时插件 |

---

## 快速开始

### 环境要求

- [Bun](https://bun.sh) 1.0+
- Node.js 18+ (用于部分构建目标)

### 安装

```bash
# 克隆仓库
git clone https://github.com/virattt/upup.git
cd upup

# 安装依赖
bun install
```

### 配置

```bash
# 复制环境变量模板
cp env.example .env

# 编辑 .env 添加 API Keys
```

**推荐配置:**

```env
# LLM 提供商 (至少配置一个)
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

# 无授权模式
bun --dangerously "批量分析A股科技股"
```

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UpUp 架构设计                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │    CLI      │     │    TUI      │     │  Bundled    │           │
│  │  (Dexter)   │     │ (Claude)    │     │   Runner    │           │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         └────────────────────┴────────────────────┘                   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Agent 核心                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │ Capability │  │  Session   │  │   Skill    │           │  │
│  │  │  Registry  │  │   State     │  │  Executor  │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐               │
│         ▼                    ▼                    ▼               │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐       │
│  │   工具      │      │   技能      │      │   组件      │       │
│  │   (64+)     │      │   (25+)     │      │   (16)      │       │
│  │             │      │              │      │              │       │
│  │ • Bash      │      │ • medfish   │      │ • ChatLog   │       │
│  │ • 读写文件  │      │ • 技术分析   │      │ • 授权      │       │
│  │ • A股数据   │      │ • 回测      │      │ • 调试      │       │
│  │ • 回测     │      │ • 风险管理  │      │ • 状态栏    │       │
│  └─────────────┘      └─────────────┘      └─────────────┘       │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      包模块 (17+)                            │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │  │
│  │  │   llm   │  │ memory  │  │   sdk   │  │ plugins │      │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 来源 | 描述 |
|------|------|------|
| `agent/` | Dexter | Agent 运行逻辑、工具注册 |
| `tools/` | 混合 | Bash、文件系统、金融工具 |
| `session/` | Claude Code | Session 状态、权限模式 |
| `components/` | Claude Code | TUI 组件库 |
| `packages/sdk/` | 新设计 | UpUp 插件 SDK |

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

## 技能系统

UpUp 内置丰富的金融研究技能：

### 核心技能

| 技能 | 功能 |
|------|------|
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
[技能: medfish] 已加载
[技能: financial-data] 已加载
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
│   │   ├── financial/          # 金融工具
│   │   └── types.ts
│   ├── session/                # Session 管理 (来自 Claude Code)
│   │   ├── session-state.ts
│   │   └── render/
│   ├── components/              # TUI 组件 (来自 Claude Code)
│   ├── commands/               # Slash 命令
│   ├── hooks/                  # Hook 系统
│   ├── skills/                 # 技能加载器
│   ├── cli.ts                 # CLI 入口
│   └── run.ts                  # Bundled Runner
├── packages/
│   ├── sdk/                   # UpUp 插件 SDK
│   ├── llm/                   # LLM 适配器
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

## 许可证

MIT License - 详见 [LICENSE](LICENSE)。

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — 让金融研究更智能
</p>
