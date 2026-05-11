# Onboarding System - Implementation Plan

> 创建日期: 2026-05-11 | 版本: 1.0 | 状态: **✅ 核心功能已完成**

---

## 1. 概述

Onboarding 系统为新用户提供完整的引导式设置流程，包括：

- API Key 配置
- Provider/Model 选择
- 预检清单验证
- 示例提示词

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Onboarding System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Wizard    │  │  Validator  │  │  Checklist  │        │
│  │  交互向导    │  │   验证器    │  │   预检清单   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          │                                  │
│                   ┌──────▼──────┐                           │
│                   │  Templates  │                           │
│                   │  示例模板   │                           │
│                   └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块

### 3.1 OnboardingWizard (交互向导)

```typescript
import { OnboardingWizard } from './onboarding';

const wizard = new OnboardingWizard({
  skipWelcome: false,
  skipApiKey: false,
  skipExamples: false,
});

// 逐步引导用户
while (!wizard.isComplete()) {
  const ctx = wizard.getContext();
  const input = await getUserInput(ctx.step);
  await wizard.handleInput(input);
}
```

**步骤流程**:
1. `welcome` - 欢迎页面
2. `api_key` - API Key 配置
3. `provider` - Provider 选择
4. `model` - Model 选择
5. `validation` - 验证检查
6. `examples` - 示例展示
7. `complete` - 完成

### 3.2 OnboardingValidator (验证器)

```typescript
import { OnboardingValidator } from './onboarding';

const validator = new OnboardingValidator();

// 验证 API Key
const result = await validator.testApiKey('anthropic', 'sk-xxx');
console.log(result.valid, result.error);

// 验证连接
const connection = await validator.validateConnection('anthropic', 'sk-xxx');
console.log(connection.valid, connection.latency);

// 运行所有检查
const checks = await validator.runAllChecks('anthropic');
```

### 3.3 OnboardingChecklist (预检清单)

```typescript
import { OnboardingChecklist } from './onboarding';

const checklist = new OnboardingChecklist('anthropic');
await checklist.runChecks();

// 渲染检查结果
console.log(checklist.render());

// 检查状态
if (checklist.isReady()) {
  console.log('Ready to go!');
}
```

### 3.4 TemplateManager (模板管理)

```typescript
import { TemplateManager, DEFAULT_EXAMPLES } from './onboarding';

const manager = new TemplateManager();

// 获取示例
const templates = manager.getTemplates('research');

// 渲染菜单
console.log(manager.renderMenu());
```

---

## 4. 快速 API

```typescript
import { needsOnboarding, quickValidation, printOnboardingStatus } from './onboarding';

// 检查是否需要 onboarding
if (await needsOnboarding()) {
  // 启动 onboarding wizard
}

// 快速验证
const status = await quickValidation('anthropic');
console.log(status.ready, status.checks);

// 打印状态
console.log(printOnboardingStatus());
```

---

## 5. 使用示例

### 5.1 首次运行引导

```typescript
import { OnboardingWizard } from './src/onboarding';

async function firstRun() {
  const wizard = new OnboardingWizard();

  console.log('Welcome to UpUp! Let\'s get you set up.\n');

  while (!wizard.isComplete()) {
    const ctx = wizard.getContext();

    switch (ctx.step) {
      case 'welcome':
        console.log('Press Enter to continue or "skip" to skip...');
        break;
      case 'api_key':
        console.log('Enter your API key:');
        break;
      // ...
    }

    const input = await readLine();
    await wizard.handleInput(input);
  }

  console.log('Setup complete! Let\'s go.');
}
```

### 5.2 检查清单组件

```typescript
import { OnboardingChecklist } from './src/onboarding';

const checklist = new OnboardingChecklist('anthropic');
const results = await checklist.runChecks();

console.log(checklist.render());

// Sample output:
//  ┌─────────────────────────────────────────────────────────┐
//  │              Pre-Flight Checklist                       │
//  ├─────────────────────────────────────────────────────────┤
//  │  ✓ Environment Setup   │
//  │  ✓ API Key Configur... │
//  │  ✓ Provider Availab... │
//  │  ⚠ Model Available     │
//  │  ✓ Tools Ready         │
//  └─────────────────────────────────────────────────────────┘
```

---

## 6. 测试结果

```bash
$ bun test src/onboarding/onboarding.test.ts

  29 pass
  0 fail
  73 expect() calls

Coverage:
- OnboardingValidator: 5 tests
- OnboardingWizard: 9 tests
- OnboardingChecklist: 5 tests
- TemplateManager: 8 tests
- Default Exports: 3 tests
```

---

## 7. 下一步

### 已完成
- ✅ 核心模块实现
- ✅ 交互式向导
- ✅ API Key 验证
- ✅ 预检清单
- ✅ 示例模板
- ✅ 测试用例 (29 tests)

### 待完善
- [ ] 集成到 CLI 入口
- [ ] TUI 组件支持
- [ ] 持久化配置
- [ ] 高级验证（真实 API 调用）
- [ ] 多语言支持

---

## 8. 参考资料

- Claude Code SDK Setup Flow
- OpenClaw Onboarding Patterns
- Anthropic API Key Management

---

**文档版本**: 1.0
**最后更新**: 2026-05-11
