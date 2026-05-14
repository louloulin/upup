# Plan 12 - 配置系统深度分析与增强

**日期**: 2026/05/14
**版本**: v4.5
**状态**: P0 ✅ + P1 ✅ + P2 ✅ + P3 ✅ + CLI集成 ✅ (除云同步和P1-9迁移外)
**目标**: 对标 Claude Code 配置体系，完善启动验证，实现智能配置引导

---

## 📋 执行摘要

### 🔴 关键 Bug (需立即修复)

| Bug | 位置 | 影响 | 优先级 | 状态 |
|-----|------|------|--------|------|
| **Setup 模型名不生效** | `onboarding.ts:setDefaultModel()` | Setup 后模型配置丢失 | 🔴 P0 | ✅ 已修复 |
| **启动无验证** | `cli.ts:runCli()` | 无配置时无提示 | 🔴 P0 | ✅ 已修复 |
| **API Key 检查复杂** | `env.ts` | 4层检查难以维护 | 🟡 P1 | 待 P1 |

### ✅ UpUp 已有功能

| 功能 | 状态 | 位置 |
|------|------|------|
| Skills 系统 | ✅ 已实现 | `src/skills/` |
| MCP Client | ✅ 已实现 | `src/mcp/` |
| 配置多层加载 | ✅ 已实现 | `src/utils/config.ts` |
| 加密凭证 | ❌ 未实现 | 待 P1 |
| 启动验证 | ✅ 已实现 | `src/utils/config-validation.ts` |

---

## 📊 Claude Code vs UpUp 配置对比分析

### Claude Code 配置体系 (`~/.claude/`)

```
~/.claude/
├── settings.d/           # 配置片段目录 (模块化配置)
│   └── evolvemind.json   # MCP + Hooks 配置片段
├── .credentials.json    # 敏感凭证 (AES-256-GCM 加密)
├── .env                  # 环境变量
├── hooks/               # 钩子脚本
│   ├── evolvemind-hook.sh
│   └── ralph-ceo-jwt-hook.sh
├── skills/              # Skills 系统 (112个)
│   ├── using-superpowers/
│   ├── frontend-design/
│   └── ...
├── cache/               # 缓存
├── file-history/        # 文件历史
├── daemon/              # 后台守护进程
├── commands/            # 自定义命令
├── agents/              # Agent 配置
└── settings.json        # 主配置
```

### UpUp 当前配置 (`~/.upup/`)

```
~/.upup/
├── .env                 # API Keys (明文 - 需加密)
├── settings.json        # 主配置 (Provider/Model)
├── settings.local.json   # 本地覆盖 (待使用)
├── settings.d/          # 配置片段目录 (已支持但未使用)
├── settings.backups/    # 配置备份
├── sessions/            # Session 存储
├── memory/             # 记忆存储
├── scratchpad/         # Scratchpad 存储
├── mcp-config.json     # MCP 配置
└── .credentials.json   # 待实现 - 加密凭证
```

### 详细功能对比

| 功能 | Claude Code | UpUp 当前 | Gap | 优先级 |
|------|-------------|-----------|-----|--------|
| **基础配置** | | | | |
| 全局配置 | settings.json | ✅ settings.json | - | ✅ |
| 本地覆盖 | settings.local.json | ✅ settings.local.json | - | ✅ |
| 配置片段 | settings.d/*.json | ✅ settings.d/ | - | ✅ |
| 多层合并 | ✅ deep merge | ✅ deep merge | - | ✅ |
| **凭证管理** | | | | |
| 加密存储 | ✅ AES-256-GCM | ❌ .env 明文 | 🔴 | **P1** |
| API Key 检查 | ✅ 简单 | 🟡 4层复杂 | 🟡 | P1 |
| Key 轮换 | ✅ 支持 | ❌ | 🔴 | P3 |
| **验证系统** | | | | |
| 启动验证 | ✅ 强制 | ✅ 强制 | - | ✅ |
| 配置医生 | claude doctor | ❌ /doctor 基础 | 🟡 | P2 |
| 配置来源 | ✅ 清晰 | 🟡 待完善 | 🟡 | P1 |
| **Skills** | | | | |
| Skill 系统 | ✅ 112个 | ✅ 已实现 | - | ✅ |
| Skill 加载 | ✅ 元数据+内容 | ✅ 元数据+内容 | - | ✅ |
| Skill 触发 | ✅ 自动/手动 | ✅ 自动/手动 | - | ✅ |
| Skill 存储 | skills/*.md | src/skills/ | 🟡 | P3 |
| **MCP** | | | | |
| MCP Client | ✅ | ✅ 已实现 | - | ✅ |
| MCP 配置 | mcpServers in settings.d | mcp-config.json | 🟡 | P2 |
| OAuth 支持 | ✅ | ✅ 已实现 | - | ✅ |
| **Hooks** | | | | |
| Hooks 系统 | ✅ | ❌ 待实现 | 🔴 | P3 |
| 事件类型 | 5种 | 0种 | 🔴 | P3 |
| **高级功能** | | | | |
| 自定义命令 | commands/*.md | ❌ | 🔴 | P3 |
| Cloud 同步 | ✅ | ❌ | 🔴 | P4 |

---

## ❌ 问题分析

### 问题 1: Setup 为什么模型名称不生效？

**根因**: `setDefaultModel()` 函数有两个 bug:

```typescript
// 当前实现 - 写入了错误的字段
async function setDefaultModel(providerId: string, modelId: string): Promise<boolean> {
  // ...
  // 问题 1: 写入到 .env 文件的 DEFAULT_MODEL，而非 settings.json 的 modelId
  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('DEFAULT_MODEL=')) {
      found = true;
      return modelLine;  // 写入到 .env
    }
    return line;
  });

  // 问题 2: 没有调用 setSetting('modelId', modelId) 保存到 settings.json
  // 只在 runOnboarding 最后调用了一次
}
```

**ModelSelectionController 读取逻辑**:
```typescript
constructor() {
  // 从 settings.json 读取 modelId
  const savedModel = getSetting('modelId', null);  // null!
  this.modelValue = savedModel ?? getDefaultModelForProvider(...) ?? DEFAULT_MODEL;
  // savedModel 是 null，因为 setup 没有正确保存
}
```

### 问题 2: API Key 存储分散

| 位置 | 优先级 | 状态 |
|------|--------|------|
| `process.env[API_KEY]` | 1 | ✅ 优先 |
| `~/.upup/settings.json.apiKey` | 2 | 存在但逻辑复杂 |
| `~/.upup/.env` | 3 | 实际保存位置 |
| `./.env` | 4 | legacy 备选 |

### 问题 3: 启动时无验证

```typescript
// 当前 runCli() 启动流程
async function runCli() {
  // 创建 ModelSelectionController - 但没有验证
  const modelSelection = new ModelSelectionController(onError);

  // 如果 API key 缺失，会在第一次请求时才报错
  const agent = await Agent.create({ ... });

  // 没有任何预检查
}
```

---

## 🎯 实现计划

### Phase 1: 配置验证系统 (P0)

#### P1.1 添加强配置验证函数

```typescript
// src/utils/config-validation.ts (NEW)

import { getSetting, checkApiKeyExistsForProvider, getProviderDisplayName } from './index.js';

export interface ConfigValidationResult {
  valid: boolean;
  provider: string | null;
  modelId: string | null;
  hasApiKey: boolean;
  missingProvider: boolean;
  missingModel: boolean;
  missingApiKey: boolean;
  errors: string[];
}

/**
 * 验证当前配置是否完整有效
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];

  // 获取当前配置
  const provider = getSetting('provider', null);
  const modelId = getSetting('modelId', null);
  const hasApiKey = provider ? checkApiKeyExistsForProvider(provider) : false;

  // 检查 provider
  if (!provider) {
    errors.push('No AI provider configured');
  }

  // 检查 model
  if (!modelId) {
    errors.push('No model configured');
  }

  // 检查 API key
  if (provider && !hasApiKey) {
    errors.push(`Missing API key for ${getProviderDisplayName(provider)}`);
  }

  return {
    valid: errors.length === 0,
    provider,
    modelId,
    hasApiKey,
    missingProvider: !provider,
    missingModel: !modelId,
    missingApiKey: provider && !hasApiKey,
    errors,
  };
}

/**
 * 检查是否是首次使用
 */
export function isFirstTimeUse(): boolean {
  const configPath = join(getConfigDir(), 'settings.json');
  return !existsSync(configPath);
}
```

#### P1.2 启动时自动验证

```typescript
// src/cli.ts - runCli() 开头添加

async function runCli(options: RunCliOptions = {}) {
  // ... 初始化代码 ...

  // 启动时验证配置
  const validation = validateConfig();

  if (!validation.valid) {
    // 显示配置问题
    chatLog.addChild(new Spacer(1));
    chatLog.addChild(new Text(theme.error('⚠ Configuration incomplete'), 0, 0));

    for (const error of validation.errors) {
      chatLog.addChild(new Text(theme.muted(`  • ${error}`), 0, 0));
    }

    chatLog.addChild(new Spacer(1));

    if (validation.missingProvider || validation.missingModel) {
      chatLog.addChild(new Text(
        theme.muted('Starting setup wizard... Press Enter to continue.'),
        0, 0
      ));
    }

    tui.requestRender();

    // 自动打开模型选择 UI
    modelSelection.startSelection();
  }

  // ...
}
```

### Phase 2: 修复 Setup 保存逻辑 (P0)

#### P2.1 统一配置保存

```typescript
// src/commands/onboarding.ts - 修复 setDefaultModel

export async function setDefaultModel(providerId: string, modelId: string): Promise<boolean> {
  // 保存到 settings.json (主要配置)
  setSetting('provider', providerId);
  setSetting('modelId', modelId);

  // 同时保存到 .env (兼容性)
  const envPath = join(homedir(), '.upup', '.env');
  let lines: string[] = [];

  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf-8').split('\n');
  }

  const modelLine = `DEFAULT_MODEL=${modelId}`;
  const providerLine = `DEFAULT_PROVIDER=${providerId}`;
  let modelFound = false;
  let providerFound = false;

  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('DEFAULT_MODEL=')) {
      modelFound = true;
      return modelLine;
    }
    if (trimmed.startsWith('DEFAULT_PROVIDER=')) {
      providerFound = true;
      return providerLine;
    }
    return line;
  });

  if (!modelFound) lines.push(modelLine);
  if (!providerFound) lines.push(providerLine);

  writeFileSync(envPath, lines.join('\n') + '\n');

  return true;
}
```

#### P2.2 修复 ModelSelectionController 初始化

```typescript
// src/controllers/model-selection.ts

constructor(onError, onChange) {
  // 添加强验证
  const validation = validateConfig();

  if (validation.provider) {
    this.providerValue = validation.provider;
  } else {
    this.providerValue = DEFAULT_PROVIDER;
  }

  if (validation.modelId) {
    this.modelValue = validation.modelId;
  } else {
    this.modelValue = getDefaultModelForProvider(this.providerValue) ?? DEFAULT_MODEL;
  }

  // 如果配置不完整，标记需要引导
  if (validation.missingProvider || validation.missingModel || validation.missingApiKey) {
    this.appStateValue = 'setup_required';
  }
}
```

### Phase 3: 凭证安全存储 (P1)

#### P3.1 凭证加密

```typescript
// src/utils/credentials.ts (NEW)

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION = 'sha256';

export class CredentialsManager {
  private readonly credentialsPath: string;
  private readonly key: Buffer;

  constructor() {
    this.credentialsPath = join(getConfigDir(), '.credentials.json');
    // 从机器唯一标识生成密钥 (实际应使用更安全的方式)
    this.key = this.deriveKey();
  }

  private deriveKey(): Buffer {
    // 使用机器信息生成密钥
    const machineId = this.getMachineId();
    return createHash(KEY_DERIVATION).update(machineId).digest();
  }

  saveApiKey(provider: string, apiKey: string): boolean {
    const credentials = this.loadCredentials();
    credentials[provider] = this.encrypt(apiKey);
    return this.saveCredentials(credentials);
  }

  getApiKey(provider: string): string | null {
    const credentials = this.loadCredentials();
    const encrypted = credentials[provider];
    if (!encrypted) return null;
    return this.decrypt(encrypted);
  }

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encrypted: string): string {
    const [ivHex, authTagHex, content] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Phase 4: 配置 UI 增强 (P1)

#### P4.1 配置状态指示器

```typescript
// src/components/intro.tsx - 添加配置状态显示

function renderConfigStatus(): string {
  const validation = validateConfig();

  if (validation.missingProvider || validation.missingModel) {
    return theme.error('⚠ Not configured');
  }

  if (validation.missingApiKey) {
    return theme.warning(`⚠ ${validation.provider}/${validation.modelId} (no API key)`);
  }

  return theme.muted(`${validation.provider}/${validation.modelId}`);
}
```

#### P4.2 首次启动引导

```typescript
// src/cli.ts

async function runCli() {
  // 检查首次使用
  const isFirstTime = isFirstTimeUse();

  if (isFirstTime) {
    // 显示欢迎信息
    chatLog.addChild(new Spacer(1));
    chatLog.addChild(new Text(theme.bold(theme.primary('Welcome to UpUp!')), 0, 0));
    chatLog.addChild(new Text(theme.muted("Let's set up your AI provider..."), 0, 0));
    chatLog.addChild(new Spacer(1));
    tui.requestRender();

    // 自动开始配置流程
    modelSelection.startSelection();
  }

  // ...
}
```

---

## 📋 完整 Todo List

### P0 - 核心修复 ✅ 已完成

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 1 | 添加 `validateConfig()` 验证函数 | ✅ | `src/utils/config-validation.ts` | P0 |
| 2 | 添加 `isFirstTimeUse()` 检测首次使用 | ✅ | `src/utils/config-validation.ts` | P0 |
| 3 | 修复 `setDefaultModel()` 保存到 settings.json | ✅ | `src/commands/onboarding.ts` | P0 |
| 4 | 修复 `ModelSelectionController` 初始化验证 | ✅ | `src/controllers/model-selection.ts` | P0 |
| 5 | 在 `runCli()` 启动时调用 `validateConfig()` | ✅ | `src/cli.ts` | P0 |
| 6 | 配置不完整时自动打开 `modelSelection.startSelection()` | ✅ | `src/cli.ts` | P0 |
| 7 | 添加首次使用引导 UI | ✅ | `src/cli.ts` | P0 |
| 7b | 修复 temporal dead zone 初始化问题 | ✅ | `src/cli.ts` | P0 |
| 8 | 添加 config-validation 单元测试 | ✅ | `src/utils/config-validation.test.ts` | P0 |
| 9 | 交互式验证测试 | ✅ | `bun run dev` | P0 |

### P1 - 增强功能 ✅ 部分完成

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 8 | 实现 `CredentialsManager` 加密存储 | ✅ | `src/utils/credentials.ts` | P1 |
| 9 | 迁移现有 API Key 到加密存储 | 🔲 | `src/utils/credentials.ts` | P1 |
| 10 | 在 `IntroComponent` 显示配置状态 | ✅ | `src/components/intro.ts` | P1 |
| 11 | 添加配置来源显示 (`getConfigSources()`) | ✅ | `src/utils/config.ts` | P1 |

### P2 - Claude Code 对标 ✅ 完成

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 12 | 实现 `settings.d/` 配置片段支持 | ✅ | `src/utils/config.ts` | P2 |
| 13 | 添加 `config set/get` 命令行工具 | ✅ | `src/commands/config.ts` | P2 |
| 14 | 添加配置验证 `config doctor` 子命令 | ✅ | `src/commands/doctor.ts` | P2 |
| 15 | 添加配置导出/导入功能 | ✅ | `src/commands/config.ts` | P2 |
| 16 | 实现配置热重载 | ✅ | `src/utils/config.ts` | P2 |

### P3 - 高级功能 ✅ 完成 (除云同步外)

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 17 | MCP Server 配置管理 | ✅ | `src/commands/mcp.ts` | P3 |
| 18 | Hooks 配置系统 | ✅ | `src/hooks/`, `settings.d/hooks.json` | P3 |
| 19 | 自定义命令配置 | ✅ | `src/commands/config.ts` | P3 |
| 20 | 配置云同步 (可选) | 🔲 | `src/sync/` | P3 |

---

## 📁 实现文件结构

```
src/
├── utils/
│   ├── config-validation.ts   # 新增 - 配置验证 (P0)
│   ├── credentials.ts         # 新增 - 加密凭证 (P1)
│   ├── config.ts             # 更新 - 热重载 (P2)
│   └── storage-paths.ts      # 更新 - CREDENTIALS_FILE (P1)
├── commands/
│   ├── onboarding.ts         # 更新 - 修复保存逻辑 (P0)
│   ├── config.ts            # 新增 - 配置命令 (P2)
│   └── doctor.ts            # 更新 - 增强诊断 (P2)
├── controllers/
│   └── model-selection.ts    # 更新 - 初始化验证 (P0)
├── components/
│   └── intro.ts              # 更新 - 配置状态 (P1)
└── cli.ts                    # 更新 - 启动验证 (P0)
└── index.tsx                 # 更新 - config 命令集成 (P2)
```

---

## ✅ 验收标准

| 功能 | 验收条件 |
|------|----------|
| **启动验证** | 无配置时显示错误并打开配置 UI |
| **Setup 保存** | `upup setup` 后 modelId 正确保存到 settings.json |
| **首次引导** | 首次使用自动显示欢迎和配置引导 |
| **凭证安全** | API Key 加密存储到 .credentials.json |

---

## 🔄 实现顺序

```
Phase 1: P0-1 → P0-2 → P0-3 → P0-4 → P0-5 → P0-6 → P0-7 (核心修复)
Phase 2: P1-8 → P1-9 → P1-10 → P1-11 (增强功能)
Phase 3: P2-12 → P2-13 → P2-14 → P2-15 → P2-16 (对标 Claude Code)
Phase 4: P3-17 → P3-18 → P3-19 → P3-20 (高级功能)
```

**预计工作量**:
- P0: 2-3 小时
- P1: 2-3 小时
- P2: 3-4 小时
- P3: 4-5 小时

---

## 📊 与 Claude Code 差距总结

| 功能 | Claude Code | UpUp 目标 | 差距 |
|------|-------------|-----------|------|
| 模块化配置 | `settings.d/*.json` | 支持 | 🟡 2026 Q2 |
| 加密凭证 | `.credentials.json` | 支持 | 🟡 2026 Q2 |
| 配置热重载 | 支持 | 支持 | ✅ |
| 启动验证 | 强验证 | 待实现 | 🔴 2026 Q1 |
| 配置医生 | `claude doctor` | 待增强 | 🟡 2026 Q2 |
| Hooks | `~/.claude/hooks/` | 待实现 | 🔴 2026 Q3 |
| MCP Server | 内置管理 | 基础 | 🟡 2026 Q3 |

---

## 🔧 Skills 与 MCP 配置加载机制

### Claude Code Skills 加载机制

```
~/.claude/skills/
├── SKILL.md                    # 元数据定义
│   ├── name: <skill-name>       # Skill 名称
│   ├── description: ...        # Skill 描述
│   ├── triggers: [...]         # 触发条件
│   ├── priority: <level>       # 执行优先级
│   └── base_directory: ...     # 基准目录
│
├── references/                 # 参考文件
│   ├── codex-tools.md          # 工具映射
│   └── ...
│
└── ...                        # Skill 特定文件

Skill 加载流程:
1. 启动时扫描 ~/.claude/skills/
2. 解析每个 SKILL.md 元数据
3. 构建 Skill 索引 (名称 → 路径)
4. 监听用户输入，匹配触发条件
5. 加载匹配的 Skill 内容
6. 注入到当前会话
```

### UpUp Skills 配置方案

```
~/.upup/skills/                         # UpUp Skills 目录 (待实现)
├── SKILL.md                          # 全局 Skill 定义
├── research/                         # 研究类 Skill
│   ├── SKILL.md                     # Skill 元数据
│   ├── prompts/                    # 提示词模板
│   └── references/                  # 参考文档
├── financial/                       # 金融分析 Skill
│   └── ...
└── custom/                          # 用户自定义 Skills

Skill 定义格式 (SKILL.md):
---
name: research
description: 深度研究助手，用于市场分析和竞品研究
triggers:
  - /research
  - 研究
  - analysis
priority: high
category: research
---
# Skill 内容开始...

Skill 配置项:
- name: Skill 名称 (必需)
- description: Skill 描述
- triggers: 触发条件列表 (数组)
- priority: 优先级 (low/medium/high/critical)
- category: 分类 (research/code/design/...)
- base_directory: 基准目录
- dependencies: 依赖的其他 Skills
- environment: 环境变量要求
```

### MCP Server 配置加载

#### Claude Code MCP 配置

```json
// settings.d/evolvemind.json
{
  "mcpServers": {
    "evolvemind": {
      "command": "evolvemind",
      "args": ["mcp", "run"],
      "env": {
        "EVOLVEMIND_TENANT": "claude-code",
        "EVOLVEMIND_DATA_DIR": "~/.evolvemind"
      }
    }
  },
  "hooks": {
    "on_start": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_resume": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_user_message": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_branch_change": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_kill": ["~/.claude/hooks/evolvemind-hook.sh"]
  }
}
```

#### UpUp MCP 配置

```typescript
// src/mcp/client.ts - MCPClientManager

interface MCPServerConfig {
  name: string;
  command?: string;           // Stdio 传输
  args?: string[];
  env?: Record<string, string>;
  url?: string;              // SSE 传输
  headers?: Record<string, string>;
  autoConnect?: boolean;
  oauth?: MCPOAuthConfig;
}

// 配置加载
export function loadMCPConfig(configPath?: string): MCPClientConfig {
  const path = configPath || join(process.cwd(), '.upup', 'mcp-config.json');
  // 解析 mcp-config.json
  // 支持两种格式:
  // 1. { servers: { serverName: config } }
  // 2. { servers: [...] }
}
```

### Hooks 系统配置

#### Claude Code Hooks

```
~/.claude/hooks/
├── evolvemind-hook.sh          # Evolvemind 钩子
├── ralph-ceo-jwt-hook.sh      # Ralph CEO JWT 钩子
└── ...

Hook 配置 (settings.d/evolvemind.json):
{
  "hooks": {
    "on_start": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_resume": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_user_message": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_branch_change": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_kill": ["~/.claude/hooks/evolvemind-hook.sh"]
  }
}
```

#### UpUp Hooks 配置方案

```
~/.upup/hooks/                      # Hooks 目录 (待实现)
├── pre-start.sh                   # 启动前钩子
├── post-request.sh               # 请求后钩子
├── pretool-*.sh                  # 工具执行前钩子
└── posttool-*.sh                 # 工具执行后钩子

Hook 配置格式:
{
  "hooks": {
    "on_start": ["path/to/script.sh"],
    "on_request": ["path/to/script.sh"],
    "on_response": ["path/to/script.sh"],
    "pretool": {
      "read_file": ["hooks/pretool-read-file.sh"],
      "write_file": ["hooks/pretool-write-file.sh"]
    },
    "posttool": {
      "read_file": ["hooks/posttool-read-file.sh"],
      "write_file": ["hooks/posttool-write-file.sh"]
    }
  }
}
```

### 完整配置加载流程

```
UpUp 启动
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         配置加载顺序 (优先级从高到低)                           │
└─────────────────────────────────────────────────────────────────────────────┘

1️⃣ 项目级配置 (P0 - 最高)
   └── <cwd>/.upup/
       ├── settings.local.json    # 项目本地覆盖
       ├── mcp-config.json         # 项目 MCP 配置
       ├── .env                    # 项目 API Keys
       └── hooks/                  # 项目 Hooks

2️⃣ 环境变量 (P1)
   └── process.env
       ├── UPUP_PROVIDER
       ├── UPUP_MODEL_ID
       ├── UPUP_API_KEY
       └── API_KEY_* (Provider-specific)

3️⃣ 全局本地覆盖 (P2)
   └── ~/.upup/settings.local.json
       └── 用户自定义覆盖

4️⃣ 全局主配置 (P3)
   └── ~/.upup/settings.json
       └── provider, modelId, theme, ...

5️⃣ 配置片段 (P4)
   └── ~/.upup/settings.d/
       ├── defaults.json          # 默认设置
       ├── mcp.json              # MCP 配置片段
       └── custom/*.json         # 自定义片段

6️⃣ Skills 配置 (P5)
   └── ~/.upup/skills/
       └── SKILL.md 元数据 + Skill 内容

7️⃣ 代码默认值 (P6 - 最低)
   └── src/utils/config.ts
       └── DEFAULT_PROVIDER, DEFAULT_MODEL, ...
```

### 配置合并策略

```typescript
// src/utils/config.ts - loadMergedConfig()

interface ConfigLayer {
  file: string;           // 配置文件路径
  priority: number;        // 优先级 (数字越大越高)
  data: Record<string, unknown>;  // 配置数据
}

// 多层配置合并
function mergeConfigLayers(layers: ConfigLayer[], strategy: 'shallow' | 'deep'): Config {
  // 1. 按优先级排序 (小到大)
  // 2. 低优先级配置先应用
  // 3. 高优先级覆盖低优先级
  // 4. deep 模式支持嵌套对象合并

  const result: Record<string, unknown> = {};
  layers.sort((a, b) => a.priority - b.priority);

  for (const layer of layers) {
    if (strategy === 'deep') {
      deepMerge(result, layer.data);  // 递归合并
    } else {
      Object.assign(result, layer.data);  // 浅合并
    }
  }

  return result as Config;
}
```

### MCP 与 Skills 联动

```
用户输入 → Skill 匹配 → Skill 加载 → 执行钩子 → MCP 调用

示例流程:
1. 用户输入 "/research AI trends"
2. Skill 系统检测 "/research" 触发 research Skill
3. research Skill 加载提示词模板
4. 执行 pre_request 钩子 (可选)
5. 调用 MCP server 获取数据
6. 处理结果并生成响应
7. 执行 post_response 钩子 (可选)
```

---

## 📋 完整 Todo List (最终版)

### 🔴 P0 - 核心修复 (紧急 - 立即实施)

| # | 任务 | 状态 | 文件 | 代码变更 |
|---|------|------|------|----------|
| 1 | **修复 setDefaultModel() 保存到 settings.json** | 🔲 | `src/commands/onboarding.ts` | 添加 `setSetting('modelId', modelId)` |
| 2 | **添加 validateConfig() 验证函数** | 🔲 | `src/utils/config-validation.ts` | 新建文件 |
| 3 | **添加 isFirstTimeUse() 检测** | 🔲 | `src/utils/config-validation.ts` | 新建文件 |
| 4 | **启动时调用 validateConfig()** | 🔲 | `src/cli.ts` | 添加验证逻辑 |
| 5 | **配置缺失时打开 modelSelection.startSelection()** | 🔲 | `src/cli.ts` | 添加重定向 |
| 6 | **添加首次使用欢迎 UI** | 🔲 | `src/cli.ts` | 添加欢迎消息 |
| 7 | **简化 API Key 检查逻辑** | 🔲 | `src/utils/env.ts` | 统一检查入口 |

### 🟡 P1 - 凭证安全 (重要)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 8 | 实现 CredentialsManager 加密存储 | 🔲 | `src/utils/credentials.ts` | AES-256-GCM |
| 9 | 迁移现有 API Key 到加密存储 | 🔲 | `src/utils/credentials.ts` | 一次性迁移 |
| 10 | 更新 checkApiKeyExists 使用加密存储 | 🔲 | `src/utils/env.ts` | 优先读加密 |
| 11 | 在 IntroComponent 显示配置状态 | 🔲 | `src/components/intro.tsx` | Provider/Model |
| 12 | 完善 getConfigSources() 实现 | 🔲 | `src/utils/config.ts` | 配置来源追踪 |

### 🟢 P2 - Claude Code 对标 (完善)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 13 | 激活 settings.d/ 配置片段 | 🔲 | `src/utils/config.ts` | 已有支持 |
| 14 | 添加 config 命令行工具 | 🔲 | `src/commands/config.ts` | set/get/list |
| 15 | 增强 config doctor 诊断 | 🔲 | `src/commands/doctor.ts` | 完整检查 |
| 16 | 添加配置导出/导入 | 🔲 | `src/commands/config.ts` | JSON 格式 |
| 17 | 实现配置热重载 | 🔲 | `src/utils/config.ts` | 文件监控 |
| 18 | 实现项目级配置加载 | 🔲 | `src/utils/config.ts` | <cwd>/.upup/ |
| 19 | MCP 配置迁移到 settings.d/ | 🔲 | `src/mcp/` | 统一配置 |

### 🔵 P3 - 高级功能 (扩展)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 20 | 实现 Hooks 系统 | 🔲 | `src/hooks/` | 事件钩子 |
| 21 | Skill 持久化存储 | 🔲 | `src/skills/` | ~/.upup/skills/ |
| 22 | 自定义命令系统 | 🔲 | `src/commands/` | commands/*.md |
| 23 | Skill 注册表 UI | 🔲 | `src/skills/skills-menu.ts` | 已有基础 |

### ⚪ P4 - 未来规划 (可选)

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 24 | 配置云同步 | 🔲 | Cloud API |
| 25 | 配置版本管理 | 🔲 | Git-like |
| 26 | 配置模板市场 | 🔲 | 分享配置 |

---

## 🚀 实施路线图

```
Week 1: P0 核心修复
  Day 1-2: 修复 setDefaultModel() bug
  Day 3-4: 实现 validateConfig() 和启动验证
  Day 5: 测试 + 验证

Week 2: P1 凭证安全
  Day 1-2: 实现 CredentialsManager
  Day 3-4: API Key 迁移和简化检查逻辑
  Day 5: 测试

Week 3: P2 Claude Code 对标
  Day 1-2: settings.d/ 和 config 命令
  Day 3-4: 项目级配置
  Day 5: 测试

Week 4: P3/P4 高级功能
  Day 1-3: Hooks 系统
  Day 4-5: Skill 持久化
```

---

## ✅ 验收标准

| 阶段 | 验收条件 |
|------|----------|
| **P0** | `bun run dev` 无配置时显示欢迎 UI 并打开模型选择 |
| **P0** | `upup setup` 后模型配置正确保存 |
| **P1** | API Key 加密存储到 `.credentials.json` |
| **P2** | `settings.d/*.json` 正确加载和合并 |
| **P2** | 项目 `.upup/` 配置正确覆盖全局 |
| **P3** | Hook 脚本在正确时机执行 |

---

## 📁 相关文件清单

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/utils/config.ts` | 核心配置模块 | ✅ 已有 |
| `src/utils/config-validation.ts` | 配置验证 | 🆕 待创建 |
| `src/utils/credentials.ts` | 凭证加密 | 🆕 待创建 |
| `src/commands/onboarding.ts` | Setup 命令 | ✅ 待修复 |
| `src/commands/config.ts` | Config 命令 | 🆕 待创建 |
| `src/cli.ts` | CLI 入口 | ✅ 待增强 |
| `src/mcp/client.ts` | MCP Client | ✅ 已有 |
| `src/skills/` | Skills 系统 | ✅ 已有 |

---

**创建时间**: 2026/05/14
**更新时间**: 2026/05/14 (v4.0 - 最终版)
**参考**: Claude Code `~/.claude/` + `~/.claude/skills/` + `~/.claude/hooks/`
**对标**: UpUp vs Claude Code 配置功能完整性对比
**状态**: 完成全面分析，等待实施

---

## 🏗️ 配置系统架构图

### 1. UpUp 配置读取层级架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UpUp 配置读取层级 (优先级从高到低)                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │                      配置请求 (getSetting)                            │
  └─────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Layer 1: settings.local.json (项目级本地覆盖)                           │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ ~/.upup/settings.local.json (或项目目录)                          │ │
  │ │ 优先级: ★★★★★ (最高)                                              │ │
  │ │ 用途: 项目特定配置覆盖                                             │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
                                │ (未找到或 null)
                                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Layer 2: settings.json (全局主配置)                                    │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ ~/.upup/settings.json                                            │ │
  │ │ 优先级: ★★★★☆                                                     │ │
  │ │ 字段: provider, modelId, apiKey, theme, ...                       │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
                                │ (未找到或 null)
                                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Layer 3: settings.d/ (配置片段目录) [待实现]                           │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ ~/.upup/settings.d/*.json                                        │ │
  │ │ 优先级: ★★★☆☆                                                     │ │
  │ │ 用途: 模块化配置片段 (MCP, Hooks, Commands)                       │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
                                │ (未找到或 null)
                                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Layer 4: .env 文件 (环境变量)                                         │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ ~/.upup/.env, ./.env                                             │ │
  │ │ 优先级: ★★☆☆☆                                                     │ │
  │ │ 字段: DEFAULT_MODEL, DEFAULT_PROVIDER, API_KEY_*, ...           │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
                                │ (未找到)
                                ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Layer 5: 代码默认值 (硬编码)                                          │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ src/utils/config.ts DEFAULT_*                                     │ │
  │ │ 优先级: ★☆☆☆☆ (最低)                                              │ │
  │ │ 值: DEFAULT_PROVIDER='anthropic', DEFAULT_MODEL='claude-sonnet-4' │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
```

### 2. API Key 读取优先级

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API Key 读取优先级 (P0 → P4)                         │
└─────────────────────────────────────────────────────────────────────────────┘

  Provider: anthropic

  P0: process.env.ANTHROPIC_API_KEY
      ┌─────────────────────────────────────────────┐
      │ 环境变量 (最高优先级)                          │
      │ 进程启动时设置，通过 process.env 访问            │
      └─────────────────────────────────────────────┘
                          │
                          ▼
  P1: ~/.upup/settings.json.apiKey
      ┌─────────────────────────────────────────────┐
      │ 主配置文件 (已废弃但仍支持)                    │
      │ 存储在 settings.json 的 apiKey 字段           │
      └─────────────────────────────────────────────┘
                          │
                          ▼
  P2: ~/.upup/.env → ANTHROPIC_API_KEY
      ┌─────────────────────────────────────────────┐
      │ .env 文件 (实际存储位置)                       │
      │ 实际调用: getSetting('apiKey', null)         │
      └─────────────────────────────────────────────┘
                          │
                          ▼
  P3: ./.env (项目目录)
      ┌─────────────────────────────────────────────┐
      │ 项目级 .env 文件                             │
      │ 用于项目特定 API Key                         │
      └─────────────────────────────────────────────┘
                          │
                          ▼
  P4: (报错 - 缺少 API Key)
      ┌─────────────────────────────────────────────┐
      │ ⚠️ 提示用户配置 API Key                       │
      │ 打开配置 UI 或提示命令                        │
      └─────────────────────────────────────────────┘
```

### 3. Claude Code 配置结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Claude Code ~/.claude/ 结构                          │
└─────────────────────────────────────────────────────────────────────────────┘

~/.claude/
│
├── settings.json                    # 主配置 (已弃用)
│
├── settings.d/                      # ✅ 模块化配置片段 (推荐方式)
│   ├── defaults.json                # 默认设置
│   ├── mcp-servers.json             # MCP Server 配置
│   ├── project-*.json              # 项目特定配置 (可选)
│   └── custom-*.json               # 用户自定义片段
│
├── .credentials.json                # ✅ 加密凭证 (AES-256-GCM)
│   ├── anthropic_api_key            # 加密存储
│   ├── openai_api_key              # 加密存储
│   └── ...                          # 其他 Provider
│
├── .env                            # 环境变量 (兼容性)
│
├── hooks/                          # ✅ Hooks 系统
│   ├── pre-commit.sh               # 提交前钩子
│   ├── post-response.sh            # 响应后钩子
│   └── pretool-*.sh               # 工具执行前钩子
│
├── commands/                       # ✅ 自定义命令
│   └── *.md                        # 命令定义文件
│
├── agents/                        # Agent 配置
│   └── *.md                        # Agent 定义
│
├── cache/                         # 缓存目录
├── file-history/                  # 文件历史
├── daemon/                        # 后台守护进程
└── logs/                         # 日志目录
```

### 4. 启动验证流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            启动验证流程图                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  用户执行: bun run dev
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │        runCli() 启动入口              │
  └─────────────────┬───────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │   validateConfig() 配置验证           │
  │   ┌─────────────────────────────┐   │
  │   │ 1. getSetting('provider')   │   │
  │   │ 2. getSetting('modelId')    │   │
  │   │ 3. checkApiKeyExists()      │   │
  │   └─────────────────────────────┘   │
  └─────────────────┬───────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
  ┌───────────┐          ┌───────────┐
  │ 配置完整   │          │ 配置缺失   │
  │ valid=true│          │ valid=false│
  └─────┬─────┘          └─────┬─────┘
        │                      │
        │                      ▼
        │             ┌─────────────────────┐
        │             │  显示配置错误列表     │
        │             │  • Missing provider │
        │             │  • Missing modelId  │
        │             │  • Missing API key │
        │             └──────────┬──────────┘
        │                        │
        │                        ▼
        │             ┌─────────────────────┐
        │             │  首次使用检测        │
        │             │  isFirstTimeUse()  │
        │             └──────────┬──────────┘
        │                        │
        │         ┌──────────────┴──────────────┐
        │         ▼                              ▼
        │  ┌──────────────┐              ┌──────────────┐
        │  │ 首次使用     │              │ 非首次使用   │
        │  │ 显示欢迎 UI  │              │ 显示错误提示 │
        │  └──────┬───────┘              └──────────────┘
        │         │                             │
        │         └──────────┬──────────────────┘
        │                    │
        │                    ▼
        │         ┌─────────────────────┐
        │         │ 打开模型选择 UI      │
        │         │ modelSelection      │
        │         │ .startSelection()   │
        │         └──────────┬──────────┘
        │                    │
        └────────────────────┤
                             │
                             ▼
        ┌─────────────────────────────────────┐
        │       进入正常对话流程                │
        │   Agent.create() → runLoop()        │
        └─────────────────────────────────────┘
```

### 5. Setup 保存流程修复

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Setup 保存流程 (修复后)                                │
└─────────────────────────────────────────────────────────────────────────────┘

  用户完成模型选择
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │     setDefaultModel(provider, model) │
  └─────────────────┬───────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │     1. setSetting('provider', id)   │
  │        ↓                            │
  │        保存到 settings.json         │
  │     ┌──────────────────────────┐   │
  │     │ {                        │   │
  │     │   "provider": "anthropic"│   │
  │     │ }                        │   │
  │     └──────────────────────────┘   │
  └─────────────────┬───────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │     2. setSetting('modelId', id)    │
  │        ↓                            │
  │        保存到 settings.json         │
  │     ┌──────────────────────────┐   │
  │     │ {                        │   │
  │     │   "provider": "anthropic",│   │
  │     │   "modelId": "claude-..." │   │
  │     │ }                        │   │
  │     └──────────────────────────┘   │
  └─────────────────┬───────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────┐
  │  3. .env 兼容性保存 (可选)           │
  │     ~/.upup/.env                   │
  │     ┌──────────────────────────┐   │
  │     │ DEFAULT_PROVIDER=anthropic│   │
  │     │ DEFAULT_MODEL=claude-...  │   │
  │     └──────────────────────────┘   │
  └─────────────────┬───────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   保存成功，返回 true   │
        └───────────────────────┘
```

### 6. 凭证加密存储架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CredentialsManager 加密架构                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │                      CredentialsManager                               │
  └────────────────────────────────┬─────────────────────────────────────┘
                                   │
  ┌────────────────────────────────┴─────────────────────────────────────┐
  │                          实例化                                        │
  │  ┌────────────────────────────────────────────────────────────────┐ │
  │  │ 1. credentialsPath = ~/.upup/.credentials.json                  │ │
  │  │ 2. key = deriveKey() // 从机器信息生成                          │ │
  │  │    └── MachineID → SHA256 → AES-256 key                        │ │
  │  └────────────────────────────────────────────────────────────────┘ │
  └────────────────────────────────┬─────────────────────────────────────┘
                                   │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
  │ saveApiKey() │         │ getApiKey()   │         │ deleteApiKey()│
  └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
          │                         │                         │
          ▼                         ▼                         ▼
  ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
  │ 1. load()    │         │ 1. load()    │         │ 1. load()    │
  │ 2. encrypt() │         │ 2. decrypt() │         │ 2. delete    │
  │ 3. save()    │         │ 3. return    │         │ 3. save()    │
  └───────────────┘         └───────────────┘         └───────────────┘

  加密格式: iv:authTag:encryptedData
  ┌─────────────────────────────────────────────────────────────────────┐
  │  iv (16 bytes)  :  authTag (16 bytes)  :  encryptedData (variable)   │
  │  随机初始向量    :  认证标签 (GCM模式)   :  AES-256-GCM 加密数据      │
  └─────────────────────────────────────────────────────────────────────┘

  .credentials.json 存储结构:
  ┌─────────────────────────────────────────────────────────────────────┐
  │ {                                                                 │
  │   "anthropic": "a1b2c3d4...:e5f6g7h8...:i9j0k1l2...",            │
  │   "openai": "m3n4o5p6...:q7r8s9t0...:u1v2w3x4...",              │
  │   "google": "y5z6a7b8...:c9d0e1f2...:g3h4i5j6..."              │
  │ }                                                                 │
  └─────────────────────────────────────────────────────────────────────┘
```

### 7. 完整配置状态流转

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         配置状态流转图                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │            UPUP 启动                        │
                    └─────────────────────┬───────────────────────┘
                                          │
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │  检查: ~/.upup/settings.json 是否存在        │
                    └─────────────────────┬───────────────────────┘
                                          │
                         ┌────────────────┴────────────────┐
                         ▼                                 ▼
                  ┌─────────────┐                  ┌─────────────┐
                  │  不存在     │                  │  存在       │
                  │  首次使用   │                  │  非首次使用 │
                  └──────┬──────┘                  └──────┬──────┘
                         │                                 │
                         ▼                                 ▼
              ┌─────────────────────┐        ┌─────────────────────────────┐
              │  显示欢迎 UI         │        │  validateConfig() 验证        │
              │  Welcome to UpUp!  │        └─────────────┬───────────────┘
              └──────────┬──────────┘                      │
                         │                                ▼
                         │              ┌───────────────────────────────────┐
                         │              │  ┌─────────┐ ┌─────────┐ ┌──────┐│
                         │              │  │Provider │ │ ModelId │ │APIKey││
                         │              │  └────┬────┘ └────┬────┘ └───┬──┘│
                         │              │       │          │          │   │
                         │              │       ▼          ▼          ▼   │
                         │              │   ✅/❌      ✅/❌      ✅/❌    │
                         │              └─────────────┬───────────────┘    │
                         │                          │                    │
                         │          ┌────────────────┴────────────────┐   │
                         │          ▼                                 ▼   │
                         │   ┌─────────────┐                   ┌─────────┐│
                         │   │ 全部有效    │                   │ 缺失    ││
                         │   │ valid=true │                   │ 任意项  ││
                         │   └──────┬──────┘                   └────┬────┘│
                         │          │                               │     │
                         │          │                               ▼     │
                         │          │                    ┌─────────────────┐│
                         │          │                    │  显示配置错误   ││
                         │          │                    │  modelSelection ││
                         │          │                    │  .startSelection││
                         │          │                    └────────┬────────┘│
                         │          │                             │        │
                         └──────────┼─────────────────────────────┼────────┘
                                    │                             │
                                    ▼                             │
                         ┌─────────────────────┐                   │
                         │  启动对话循环        │◄──────────────────┘
                         │  runLoop()          │
                         └─────────────────────┘
```

### 8. 配置模块依赖关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         配置模块依赖关系图                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  src/
  │
  ├── cli.ts                          # 入口 - 使用配置验证
  │   └── uses: validateConfig()
  │          uses: isFirstTimeUse()
  │          uses: modelSelection.startSelection()
  │
  ├── utils/
  │   ├── config.ts                   # 核心配置模块
  │   │   ├── getSetting()           # 读取配置
  │   │   ├── setSetting()           # 写入配置
  │   │   ├── getConfigDir()         # 获取配置目录
  │   │   ├── getConfigSources()     # [待实现] 获取配置来源
  │   │   └── loadSettingsD()         # [待实现] 加载配置片段
  │   │
  │   ├── config-validation.ts       # [NEW P0] 配置验证
  │   │   ├── validateConfig()       # 验证配置完整性
  │   │   ├── isFirstTimeUse()      # 检测首次使用
  │   │   └── ConfigValidationResult  # 验证结果接口
  │   │
  │   └── credentials.ts              # [NEW P1] 凭证加密
  │       ├── CredentialsManager     # 加密管理器
  │       ├── saveApiKey()          # 保存加密凭证
  │       ├── getApiKey()           # 获取解密凭证
  │       └── encrypt()/decrypt()    # 加解密实现
  │
  ├── commands/
  │   ├── onboarding.ts              # Setup 命令
  │   │   └── setDefaultModel()      # [BUG待修复] 保存模型配置
  │   │
  │   ├── config.ts                  # [待实现 P2] 配置命令
  │   │   ├── config set <key> <val>│
  │   │   ├── config get <key>       │
  │   │   ├── config list            │
  │   │   └── config export/import  │
  │   │
  │   └── doctor.ts                  # [待实现 P2] 诊断命令
  │       └── config doctor           # 配置诊断
  │
  └── controllers/
      └── model-selection.ts         # 模型选择控制器
          ├── constructor()          # 读取 settings.json
          ├── providerValue          # 当前 Provider
          ├── modelValue             # 当前 Model
          └── appStateValue          # setup_required 状态

  ~/.upup/                          # 配置存储
  ├── settings.json                 # 主配置 (Provider/ModelId)
  ├── settings.local.json           # 本地覆盖 [待使用]
  ├── settings.d/                   # 配置片段 [待实现]
  │   └── *.json
  ├── .env                          # API Keys (明文)
  └── .credentials.json             # 加密凭证 [P1实现]
```

---

## 📊 配置功能对比表

### 功能完整性对比

| 功能 | Claude Code | UpUp 当前 | Gap | 实现计划 |
|------|-------------|-----------|-----|----------|
| **配置读取** | | | | |
| 多层配置 | settings.d/ | settings.json | 🟡 | P2 |
| 本地覆盖 | settings.local.json | ❌ | 🔴 | P2 |
| 配置验证 | 启动时检查 | ❌ | 🔴 | **P0** |
| **凭证管理** | | | | |
| 加密存储 | .credentials.json | ❌ | 🔴 | P1 |
| API Key 存储 | 加密 | .env 明文 | 🟡 | P1 |
| Key 轮换 | 支持 | ❌ | 🔴 | P3 |
| **交互体验** | | | | |
| 首次引导 | ✅ | ❌ | 🔴 | **P0** |
| 配置状态显示 | ✅ | ❌ | 🟡 | P1 |
| 配置医生 | claude doctor | ❌ | 🔴 | P2 |
| **高级功能** | | | | |
| Hooks | ✅ | ❌ | 🔴 | P3 |
| MCP Server | 内置 | ❌ | 🔴 | P3 |
| 自定义命令 | ✅ | ❌ | 🔴 | P3 |

---

## 🔧 Skills 与 MCP 配置加载机制

### Claude Code Skills 加载机制

```
~/.claude/skills/
├── SKILL.md                    # 元数据定义
│   ├── name: <skill-name>       # Skill 名称
│   ├── description: ...        # Skill 描述
│   ├── triggers: [...]         # 触发条件
│   ├── priority: <level>       # 执行优先级
│   └── base_directory: ...     # 基准目录
│
├── references/                 # 参考文件
│   ├── codex-tools.md          # 工具映射
│   └── ...
│
└── ...                        # Skill 特定文件

Skill 加载流程:
1. 启动时扫描 ~/.claude/skills/
2. 解析每个 SKILL.md 元数据
3. 构建 Skill 索引 (名称 → 路径)
4. 监听用户输入，匹配触发条件
5. 加载匹配的 Skill 内容
6. 注入到当前会话
```

### UpUp Skills 配置方案

```
~/.upup/skills/                         # UpUp Skills 目录 (待实现)
├── SKILL.md                          # 全局 Skill 定义
├── research/                         # 研究类 Skill
│   ├── SKILL.md                     # Skill 元数据
│   ├── prompts/                    # 提示词模板
│   └── references/                  # 参考文档
├── financial/                       # 金融分析 Skill
│   └── ...
└── custom/                          # 用户自定义 Skills

Skill 定义格式 (SKILL.md):
---
name: research
description: 深度研究助手，用于市场分析和竞品研究
triggers:
  - /research
  - 研究
  - analysis
priority: high
category: research
---
# Skill 内容开始...

Skill 配置项:
- name: Skill 名称 (必需)
- description: Skill 描述
- triggers: 触发条件列表 (数组)
- priority: 优先级 (low/medium/high/critical)
- category: 分类 (research/code/design/...)
- base_directory: 基准目录
- dependencies: 依赖的其他 Skills
- environment: 环境变量要求
```

### MCP Server 配置加载

#### Claude Code MCP 配置

```json
// settings.d/evolvemind.json
{
  "mcpServers": {
    "evolvemind": {
      "command": "evolvemind",
      "args": ["mcp", "run"],
      "env": {
        "EVOLVEMIND_TENANT": "claude-code",
        "EVOLVEMIND_DATA_DIR": "~/.evolvemind"
      }
    }
  },
  "hooks": {
    "on_start": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_resume": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_user_message": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_branch_change": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_kill": ["~/.claude/hooks/evolvemind-hook.sh"]
  }
}
```

#### UpUp MCP 配置

```typescript
// src/mcp/client.ts - MCPClientManager

interface MCPServerConfig {
  name: string;
  command?: string;           // Stdio 传输
  args?: string[];
  env?: Record<string, string>;
  url?: string;              // SSE 传输
  headers?: Record<string, string>;
  autoConnect?: boolean;
  oauth?: MCPOAuthConfig;
}

// 配置加载
export function loadMCPConfig(configPath?: string): MCPClientConfig {
  const path = configPath || join(process.cwd(), '.upup', 'mcp-config.json');
  // 解析 mcp-config.json
  // 支持两种格式:
  // 1. { servers: { serverName: config } }
  // 2. { servers: [...] }
}
```

### Hooks 系统配置

#### Claude Code Hooks

```
~/.claude/hooks/
├── evolvemind-hook.sh          # Evolvemind 钩子
├── ralph-ceo-jwt-hook.sh      # Ralph CEO JWT 钩子
└── ...

Hook 配置 (settings.d/evolvemind.json):
{
  "hooks": {
    "on_start": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_resume": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_user_message": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_branch_change": ["~/.claude/hooks/evolvemind-hook.sh"],
    "on_kill": ["~/.claude/hooks/evolvemind-hook.sh"]
  }
}
```

#### UpUp Hooks 配置方案

```
~/.upup/hooks/                      # Hooks 目录 (待实现)
├── pre-start.sh                   # 启动前钩子
├── post-request.sh               # 请求后钩子
├── pretool-*.sh                  # 工具执行前钩子
└── posttool-*.sh                 # 工具执行后钩子

Hook 配置格式:
{
  "hooks": {
    "on_start": ["path/to/script.sh"],
    "on_request": ["path/to/script.sh"],
    "on_response": ["path/to/script.sh"],
    "pretool": {
      "read_file": ["hooks/pretool-read-file.sh"],
      "write_file": ["hooks/pretool-write-file.sh"]
    },
    "posttool": {
      "read_file": ["hooks/posttool-read-file.sh"],
      "write_file": ["hooks/posttool-write-file.sh"]
    }
  }
}
```

### 完整配置加载流程

```
UpUp 启动
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         配置加载顺序 (优先级从高到低)                           │
└─────────────────────────────────────────────────────────────────────────────┘

1️⃣ 项目级配置 (P0 - 最高)
   └── <cwd>/.upup/
       ├── settings.local.json    # 项目本地覆盖
       ├── mcp-config.json         # 项目 MCP 配置
       ├── .env                    # 项目 API Keys
       └── hooks/                  # 项目 Hooks

2️⃣ 环境变量 (P1)
   └── process.env
       ├── UPUP_PROVIDER
       ├── UPUP_MODEL_ID
       ├── UPUP_API_KEY
       └── API_KEY_* (Provider-specific)

3️⃣ 全局本地覆盖 (P2)
   └── ~/.upup/settings.local.json
       └── 用户自定义覆盖

4️⃣ 全局主配置 (P3)
   └── ~/.upup/settings.json
       └── provider, modelId, theme, ...

5️⃣ 配置片段 (P4)
   └── ~/.upup/settings.d/
       ├── defaults.json          # 默认设置
       ├── mcp.json              # MCP 配置片段
       └── custom/*.json         # 自定义片段

6️⃣ Skills 配置 (P5)
   └── ~/.upup/skills/
       └── SKILL.md 元数据 + Skill 内容

7️⃣ 代码默认值 (P6 - 最低)
   └── src/utils/config.ts
       └── DEFAULT_PROVIDER, DEFAULT_MODEL, ...
```

### 配置合并策略

```typescript
// src/utils/config.ts - loadMergedConfig()

interface ConfigLayer {
  file: string;           // 配置文件路径
  priority: number;        // 优先级 (数字越大越高)
  data: Record<string, unknown>;  // 配置数据
}

// 多层配置合并
function mergeConfigLayers(layers: ConfigLayer[], strategy: 'shallow' | 'deep'): Config {
  // 1. 按优先级排序 (小到大)
  // 2. 低优先级配置先应用
  // 3. 高优先级覆盖低优先级
  // 4. deep 模式支持嵌套对象合并

  const result: Record<string, unknown> = {};
  layers.sort((a, b) => a.priority - b.priority);

  for (const layer of layers) {
    if (strategy === 'deep') {
      deepMerge(result, layer.data);  // 递归合并
    } else {
      Object.assign(result, layer.data);  // 浅合并
    }
  }

  return result as Config;
}
```

### MCP 与 Skills 联动

```
用户输入 → Skill 匹配 → Skill 加载 → 执行钩子 → MCP 调用

示例流程:
1. 用户输入 "/research AI trends"
2. Skill 系统检测 "/research" 触发 research Skill
3. research Skill 加载提示词模板
4. 执行 pre_request 钩子 (可选)
5. 调用 MCP server 获取数据
6. 处理结果并生成响应
7. 执行 post_response 钩子 (可选)
```

---

## 📋 完整 Todo List (最终版)

### 🔴 P0 - 核心修复 (紧急 - 立即实施)

| # | 任务 | 状态 | 文件 | 代码变更 |
|---|------|------|------|----------|
| 1 | **修复 setDefaultModel() 保存到 settings.json** | 🔲 | `src/commands/onboarding.ts` | 添加 `setSetting('modelId', modelId)` |
| 2 | **添加 validateConfig() 验证函数** | 🔲 | `src/utils/config-validation.ts` | 新建文件 |
| 3 | **添加 isFirstTimeUse() 检测** | 🔲 | `src/utils/config-validation.ts` | 新建文件 |
| 4 | **启动时调用 validateConfig()** | 🔲 | `src/cli.ts` | 添加验证逻辑 |
| 5 | **配置缺失时打开 modelSelection.startSelection()** | 🔲 | `src/cli.ts` | 添加重定向 |
| 6 | **添加首次使用欢迎 UI** | 🔲 | `src/cli.ts` | 添加欢迎消息 |
| 7 | **简化 API Key 检查逻辑** | 🔲 | `src/utils/env.ts` | 统一检查入口 |

### 🟡 P1 - 凭证安全 (重要)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 8 | 实现 CredentialsManager 加密存储 | 🔲 | `src/utils/credentials.ts` | AES-256-GCM |
| 9 | 迁移现有 API Key 到加密存储 | 🔲 | `src/utils/credentials.ts` | 一次性迁移 |
| 10 | 更新 checkApiKeyExists 使用加密存储 | 🔲 | `src/utils/env.ts` | 优先读加密 |
| 11 | 在 IntroComponent 显示配置状态 | 🔲 | `src/components/intro.tsx` | Provider/Model |
| 12 | 完善 getConfigSources() 实现 | 🔲 | `src/utils/config.ts` | 配置来源追踪 |

### 🟢 P2 - Claude Code 对标 (完善)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 13 | 激活 settings.d/ 配置片段 | 🔲 | `src/utils/config.ts` | 已有支持 |
| 14 | 添加 config 命令行工具 | 🔲 | `src/commands/config.ts` | set/get/list |
| 15 | 增强 config doctor 诊断 | 🔲 | `src/commands/doctor.ts` | 完整检查 |
| 16 | 添加配置导出/导入 | 🔲 | `src/commands/config.ts` | JSON 格式 |
| 17 | 实现配置热重载 | 🔲 | `src/utils/config.ts` | 文件监控 |
| 18 | 实现项目级配置加载 | 🔲 | `src/utils/config.ts` | <cwd>/.upup/ |
| 19 | MCP 配置迁移到 settings.d/ | 🔲 | `src/mcp/` | 统一配置 |

### 🔵 P3 - 高级功能 (扩展)

| # | 任务 | 状态 | 文件 | 说明 |
|---|------|------|------|------|
| 20 | 实现 Hooks 系统 | 🔲 | `src/hooks/` | 事件钩子 |
| 21 | Skill 持久化存储 | 🔲 | `src/skills/` | ~/.upup/skills/ |
| 22 | 自定义命令系统 | 🔲 | `src/commands/` | commands/*.md |
| 23 | Skill 注册表 UI | 🔲 | `src/skills/skills-menu.ts` | 已有基础 |

### ⚪ P4 - 未来规划 (可选)

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 24 | 配置云同步 | 🔲 | Cloud API |
| 25 | 配置版本管理 | 🔲 | Git-like |
| 26 | 配置模板市场 | 🔲 | 分享配置 |

---

## 🚀 实施路线图

```
Week 1: P0 核心修复
  Day 1-2: 修复 setDefaultModel() bug
  Day 3-4: 实现 validateConfig() 和启动验证
  Day 5: 测试 + 验证

Week 2: P1 凭证安全
  Day 1-2: 实现 CredentialsManager
  Day 3-4: API Key 迁移和简化检查逻辑
  Day 5: 测试

Week 3: P2 Claude Code 对标
  Day 1-2: settings.d/ 和 config 命令
  Day 3-4: 项目级配置
  Day 5: 测试

Week 4: P3/P4 高级功能
  Day 1-3: Hooks 系统
  Day 4-5: Skill 持久化
```

---

## ✅ 验收标准

| 阶段 | 验收条件 |
|------|----------|
| **P0** | `bun run dev` 无配置时显示欢迎 UI 并打开模型选择 |
| **P0** | `upup setup` 后模型配置正确保存 |
| **P1** | API Key 加密存储到 `.credentials.json` |
| **P2** | `settings.d/*.json` 正确加载和合并 |
| **P2** | 项目 `.upup/` 配置正确覆盖全局 |
| **P3** | Hook 脚本在正确时机执行 |

---

## 📁 相关文件清单

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/utils/config.ts` | 核心配置模块 | ✅ 已有 |
| `src/utils/config-validation.ts` | 配置验证 | 🆕 待创建 |
| `src/utils/credentials.ts` | 凭证加密 | 🆕 待创建 |
| `src/commands/onboarding.ts` | Setup 命令 | ✅ 待修复 |
| `src/commands/config.ts` | Config 命令 | 🆕 待创建 |
| `src/cli.ts` | CLI 入口 | ✅ 待增强 |
| `src/mcp/client.ts` | MCP Client | ✅ 已有 |
| `src/skills/` | Skills 系统 | ✅ 已有 |

---

**创建时间**: 2026/05/14
**更新时间**: 2026/05/14 (v4.0 - 最终版)
**参考**: Claude Code `~/.claude/` + `~/.claude/skills/` + `~/.claude/hooks/`
**对标**: UpUp vs Claude Code 配置功能完整性对比
**状态**: 完成全面分析，等待实施