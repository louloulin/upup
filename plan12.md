# Plan 12 - 配置系统分析与增强

**日期**: 2026/05/14
**版本**: v1.0
**状态**: 规划中
**目标**: 分析配置系统问题，实现启动时自动检测并跳转配置 UI

---

## 📊 当前配置系统分析

### 1. 配置存储架构

#### 配置存储位置
| 类型 | 位置 | 说明 |
|------|------|------|
| **Settings** | `~/.upup/settings.json` | 模型选择、Provider 配置 |
| **API Keys** | `~/.upup/.env` | 全局环境变量 |
| **API Keys (备选)** | `./.env` | 本地环境变量 (legacy) |
| **API Keys (检查)** | `~/.upup/settings.json` | 从配置读取 |

#### 配置文件结构
```json
// ~/.upup/settings.json
{
  "provider": "deepseek",
  "modelId": "deepseek-v4-flash",
  "customTitle": null,
  "tag": null
}
```

```bash
# ~/.upup/.env
DEEPSEEK_API_KEY=sk-xxxx
```

### 2. LLM 配置流程分析

#### ModelSelectionController 初始化
```typescript
constructor(onError, onChange) {
  // 从 settings.json 读取 provider
  this.providerValue = getSetting('provider', DEFAULT_PROVIDER);
  
  // 从 settings.json 读取 modelId (优先) 或 model (兼容旧版)
  const savedModel = getSetting('modelId', null) as string | null;
  this.modelValue = savedModel ?? getDefaultModelForProvider(this.providerValue) ?? DEFAULT_MODEL;
}
```

#### ModelSelectionController 模型切换
```typescript
private completeModelSwitch(newProvider: string, newModelId: string) {
  this.providerValue = newProvider;
  this.modelValue = newModelId;
  
  // 保存到 settings.json
  setSetting('provider', newProvider);
  setSetting('modelId', newModelId);
  
  this.chatHistory.setModel(newModelId);
}
```

### 3. API Key 检查流程

```typescript
checkApiKeyExistsForProvider(providerId: string): boolean {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return true;  // 无需 API key 的 provider
  
  return checkApiKeyExists(apiKeyName);
}

checkApiKeyExists(apiKeyName: string): boolean {
  // 1. 检查 process.env
  if (process.env[apiKeyName] && !value.startsWith('your-')) return true;
  
  // 2. 检查 ~/.upup/settings.json
  if (settings.apiKey && settings.provider === expected) return true;
  
  // 3. 检查 ~/.upup/.env
  // 4. 检查 ./.env (legacy)
}
```

---

## ❌ 问题分析

### 问题 1: Setup 保存地址是全局的吗？

**答案**: 是的，但混合了两种存储位置

| 配置项 | 存储位置 | 说明 |
|--------|----------|------|
| Provider | `~/.upup/settings.json` | 全局 |
| Model | `~/.upup/settings.json` | 全局 |
| API Key | `~/.upup/.env` | 全局 |

**现状**:
- Setup (`upup setup`) 保存到全局目录
- 但 .env 文件可能不存在或为空
- 模型名称保存在 settings.json，但 API Key 可能未正确保存

### 问题 2: Setup 为什么模型名称不生效？

**根本原因分析**:

1. **ModelSelectionController 构造函数读取优先级**:
   ```typescript
   const savedModel = getSetting('modelId', null);
   this.modelValue = savedModel ?? getDefaultModelForProvider(...) ?? DEFAULT_MODEL;
   ```

2. **setup 命令流程**:
   - `runOnboarding()` → 选择 provider/model → 调用 `setDefaultModel()`
   - `setDefaultModel()` 写入 `settings.json`
   - 但可能没有正确写入 `modelId` 字段

3. **可能的 bug**:
   - `getSetting('modelId', null)` 返回 `null`
   - 可能是字段名不匹配或写入失败

### 问题 3: 启动时未检测配置有效性

**现状**:
```
runCli()
  ├── ModelSelectionController 初始化
  │     └── 从 settings.json 读取配置
  ├── runCli() 启动 CLI UI
  └── 如果 API key 缺失 → 运行时错误
```

**问题**:
- 启动时没有验证配置是否有效
- 没有在启动时检查 API key 是否存在
- 没有自动跳转到配置 UI

---

## 🎯 实现计划

### Phase 1: 配置验证系统

#### P1.1: 添加配置有效性检查函数

```typescript
// src/utils/config-validation.ts

export interface ConfigValidationResult {
  valid: boolean;
  missingProvider: boolean;
  missingModel: boolean;
  missingApiKey: boolean;
  errors: string[];
}

/**
 * 验证当前配置是否有效
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  
  // 检查 provider
  const provider = getSetting('provider', null);
  if (!provider) {
    errors.push('No provider configured');
  }
  
  // 检查 model
  const model = getSetting('modelId', null);
  if (!model) {
    errors.push('No model configured');
  }
  
  // 检查 API key
  if (provider && !checkApiKeyExistsForProvider(provider)) {
    errors.push(`Missing API key for ${provider}`);
  }
  
  return {
    valid: errors.length === 0,
    missingProvider: !provider,
    missingModel: !model,
    missingApiKey: errors.some(e => e.includes('API key')),
    errors,
  };
}
```

#### P1.2: 启动时自动检测

```typescript
// src/cli.ts - runCli() 开头添加

export async function runCli(options: RunCliOptions = {}) {
  // ...
  
  // 在 UI 启动前验证配置
  const validation = validateConfig();
  
  if (!validation.valid) {
    // 显示配置错误并引导用户配置
    chatLog.addChild(new Text(theme.error('⚠ Configuration incomplete'), 0, 0));
    
    for (const error of validation.errors) {
      chatLog.addChild(new Text(theme.muted(`  • ${error}`), 0, 0));
    }
    
    chatLog.addChild(new Spacer(1));
    chatLog.addChild(new Text(theme.muted('Press Enter or type /model to configure...'), 0, 0));
    tui.requestRender();
    
    // 自动打开模型选择 UI
    modelSelection.startSelection();
  }
  
  // ...
}
```

### Phase 2: 增强 Setup 保存逻辑

#### P2.1: 修复 setup 保存问题

```typescript
// src/commands/onboarding.ts

async function setDefaultModel(providerId: string, modelId: string): Promise<boolean> {
  // 确保保存到正确的字段
  const config = getConfig();
  
  // 迁移旧字段
  if (config.model && !config.modelId) {
    config.modelId = config.model;
    delete config.model;
  }
  
  // 设置新值
  config.provider = providerId;
  config.modelId = modelId;
  
  return saveConfig(config);
}
```

#### P2.2: 添加配置保存确认

```typescript
async function verifySetupSaved(): Promise<boolean> {
  // 验证 settings.json
  const settings = getSetting('modelId', null);
  if (!settings) {
    return false;
  }
  
  // 验证 API key
  const provider = getSetting('provider', null);
  if (provider && !checkApiKeyExistsForProvider(provider)) {
    return false;
  }
  
  return true;
}
```

### Phase 3: UI 增强

#### P3.1: 配置状态指示器

```typescript
// 在 IntroComponent 中显示配置状态

function renderConfigStatus(): string {
  const validation = validateConfig();
  
  if (!validation.valid) {
    return theme.error('⚠ Not configured');
  }
  
  const provider = getSetting('provider', '');
  const model = getSetting('modelId', '');
  return theme.muted(`${provider}/${model}`);
}
```

#### P3.2: 首次启动自动引导

```typescript
// src/cli.ts

// 检查是否首次使用
const isFirstTime = !existsSync(join(GLOBAL_CONFIG_DIR, 'settings.json'));

if (isFirstTime) {
  chatLog.addChild(new Text(theme.primary('Welcome to UpUp!'), 0, 0));
  chatLog.addChild(new Spacer(1));
  chatLog.addChild(new Text(theme.muted("Let's set up your AI provider..."), 0, 0));
  chatLog.addChild(new Spacer(1));
  tui.requestRender();
  
  // 自动开始配置流程
  modelSelection.startSelection();
}
```

---

## 📁 实现文件结构

```
src/
├── utils/
│   ├── config-validation.ts   # 新增 - 配置验证
│   └── config.ts              # 更新 - 修复 getSetting 逻辑
├── commands/
│   └── onboarding.ts          # 更新 - 修复保存逻辑
├── controllers/
│   └── model-selection.ts      # 更新 - 添加验证回调
├── components/
│   └── intro.tsx              # 更新 - 显示配置状态
└── cli.ts                      # 更新 - 启动时检测
```

---

## ✅ 验收标准

| 功能 | 验收 |
|------|------|
| 启动时检测配置 | 无配置时自动显示配置错误并打开配置 UI |
| Setup 模型保存 | `upup setup` 后 `modelId` 正确保存到 settings.json |
| API Key 验证 | 检测到缺失的 API Key 时提示用户 |
| 首次启动引导 | 首次使用时自动显示配置引导 |

---

## 🔄 实现顺序

1. **P1.1** - 添加 `validateConfig()` 函数
2. **P1.2** - 在 `runCli()` 启动时调用验证
3. **P2.1** - 修复 `setDefaultModel()` 保存逻辑
4. **P3.1** - 在 IntroComponent 显示配置状态
5. **P3.2** - 添加首次启动引导
6. **测试验证** - 运行完整测试流程

---

**创建时间**: 2026/05/14
**参考**: session2.0.md, plan11.0.md