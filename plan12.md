# Plan 12 - 配置系统深度分析与增强

**日期**: 2026/05/14
**版本**: v2.0
**状态**: 规划中
**目标**: 对标 Claude Code 配置体系，完善启动验证，实现智能配置引导

---

## 📊 Claude Code vs UpUp 配置对比分析

### Claude Code 配置体系 (`~/.claude/`)

```
~/.claude/
├── settings.d/           # 配置片段目录 (模块化配置)
│   └── evolvemind.json   # MCP 配置片段
├── .credentials.json    # 敏感凭证 (加密)
├── .env                  # 环境变量
├── hooks/               # 钩子脚本
│   └── *.sh
├── cache/               # 缓存
├── file-history/        # 文件历史
├── daemon/              # 后台守护进程
├── commands/            # 自定义命令
└── agents/              # Agent 配置
```

### UpUp 当前配置 (`~/.upup/`)

```
~/.upup/
├── .env                 # API Keys (全局)
├── settings.json        # 主配置 (Provider/Model)
├── settings.local.json   # 本地覆盖 (可选)
├── settings.d/          # 配置片段目录 (待实现)
├── settings.backups/    # 配置备份
├── sessions/            # Session 存储
├── memory/             # 记忆存储
├── scratchpad/         # Scratchpad 存储
├── file-history/       # 文件历史
├── data/               # 数据目录
├── exports/            # 导出目录
├── logs/               # 日志
├── cache/              # 缓存
└── watchlist.json      # 监控列表
```

### 配置存储对比

| 功能 | Claude Code | UpUp 当前 | Gap |
|------|-------------|-----------|-----|
| 全局配置 | `settings.d/*.json` | `settings.json` | 🟡 Claude 更模块化 |
| 本地覆盖 | 支持 | 支持 (`settings.local.json`) | ✅ |
| 配置片段 | `settings.d/` | `settings.d/` (空) | 🟡 待实现 |
| API Keys | `.credentials.json` | `.env` | 🟡 UpUp 需加密存储 |
| 凭证加密 | 支持 | ❌ 明文存储 | 🔴 需改进 |
| 备份系统 | `backups/` | `settings.backups/` | ✅ |
| 配置验证 | 启动时检查 | ❌ 无 | 🔴 需实现 |

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

### P0 - 核心修复

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 1 | 添加 `validateConfig()` 验证函数 | 🔲 | `src/utils/config-validation.ts` | P0 |
| 2 | 添加 `isFirstTimeUse()` 检测首次使用 | 🔲 | `src/utils/config-validation.ts` | P0 |
| 3 | 修复 `setDefaultModel()` 保存到 settings.json | 🔲 | `src/commands/onboarding.ts` | P0 |
| 4 | 修复 `ModelSelectionController` 初始化验证 | 🔲 | `src/controllers/model-selection.ts` | P0 |
| 5 | 在 `runCli()` 启动时调用 `validateConfig()` | 🔲 | `src/cli.ts` | P0 |
| 6 | 配置不完整时自动打开 `modelSelection.startSelection()` | 🔲 | `src/cli.ts` | P0 |
| 7 | 添加首次使用引导 UI | 🔲 | `src/cli.ts` | P0 |

### P1 - 增强功能

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 8 | 实现 `CredentialsManager` 加密存储 | 🔲 | `src/utils/credentials.ts` | P1 |
| 9 | 迁移现有 API Key 到加密存储 | 🔲 | `src/utils/credentials.ts` | P1 |
| 10 | 在 `IntroComponent` 显示配置状态 | 🔲 | `src/components/intro.tsx` | P1 |
| 11 | 添加配置来源显示 (`getConfigSources()`) | 🔲 | `src/utils/config.ts` | P1 |

### P2 - Claude Code 对标

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 12 | 实现 `settings.d/` 配置片段支持 | 🔲 | `src/utils/config.ts` | P2 |
| 13 | 添加 `config set/get` 命令行工具 | 🔲 | `src/commands/config.ts` | P2 |
| 14 | 添加配置验证 `config doctor` 子命令 | 🔲 | `src/commands/doctor.ts` | P2 |
| 15 | 添加配置导出/导入功能 | 🔲 | `src/commands/config.ts` | P2 |
| 16 | 实现配置热重载 | 🔲 | `src/utils/config.ts` | P2 |

### P3 - 高级功能

| # | 任务 | 状态 | 文件 | 优先级 |
|---|------|------|------|--------|
| 17 | 添加 MCP Server 配置管理 | 🔲 | `src/commands/mcp.ts` | P3 |
| 18 | 添加 Hooks 配置系统 | 🔲 | `src/hooks/` | P3 |
| 19 | 添加自定义命令配置 | 🔲 | `src/commands/` | P3 |
| 20 | 实现配置云同步 (可选) | 🔲 | `src/sync/` | P3 |

---

## 📁 实现文件结构

```
src/
├── utils/
│   ├── config-validation.ts   # 新增 - 配置验证 (P0)
│   ├── credentials.ts           # 新增 - 加密凭证 (P1)
│   └── config.ts               # 更新 - 配置片段支持 (P2)
├── commands/
│   └── onboarding.ts           # 更新 - 修复保存逻辑 (P0)
├── controllers/
│   └── model-selection.ts      # 更新 - 初始化验证 (P0)
├── components/
│   └── intro.tsx              # 更新 - 配置状态 (P1)
└── cli.ts                      # 更新 - 启动验证 (P0)
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

**创建时间**: 2026/05/14
**更新时间**: 2026/05/14 (v2.0 - 对标 Claude Code)
**参考**: Claude Code `~/.claude/` 配置分析
**对标**: UpUp vs Claude Code 配置功能完整性对比