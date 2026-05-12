# OBD1.md — UpUp CLI 子命令与 Onboarding 统一计划

> 创建日期: 2026-05-11 | 更新: 2026-05-12 | 版本: 5.0 | 状态: ✅ 已完成

---

## 执行摘要

CLI 子命令架构已完成重构，所有功能通过统一入口访问。

### 完成状态

| 项目 | 状态 | 日期 |
|------|------|------|
| CLI 入口统一 | ✅ | 2026-05-11 |
| `upup setup` 子命令 | ✅ | 2026-05-11 |
| `upup doctor` 子命令 | ✅ | 2026-05-11 |
| 删除 `src/onboarding/` 死代码 | ✅ | 2026-05-12 |
| 移除 `isOnboardingNeeded()` 未使用函数 | ✅ | 2026-05-12 |
| 移除底部未使用代码 | ✅ | 2026-05-12 |
| CLI 命令验证脚本 | ✅ | 2026-05-12 |

---

## 1. CLI 子命令架构

### 1.1 命令列表

| 命令 | 描述 | 文件 |
|------|------|------|
| `upup` | 启动交互式 CLI | cli.ts |
| `upup setup` | 交互式设置向导 | commands/onboarding.ts |
| `upup doctor` | 健康检查 | commands/doctor.ts |
| `upup help` | 显示帮助 | index.tsx |
| `upup version` | 显示版本 | index.tsx |

### 1.2 入口点代码

```typescript
// src/index.tsx
#!/usr/bin/env bun
import { runCli } from './cli.js';
import { runOnboarding } from './commands/onboarding.js';
import { runDoctor } from './commands/doctor.js';

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

async function main() {
  switch (command) {
    case 'setup':  await runOnboarding(); break;
    case 'doctor': await runDoctor(); break;
    case 'help':
    case '-h':     printHelp(); break;
    case 'version':
    case '-v':     console.log('UpUp v2026.05.11'); break;
    default:       await runCli(); // 无参数启动 CLI
  }
}
```

---

## 2. 已清理的死代码

### 2.1 已删除文件

```bash
# 删除整个 src/onboarding/ 目录
rm -rf src/onboarding/

# 包含文件:
# - src/onboarding/index.ts
# - src/onboarding/types.ts
# - src/onboarding/validator.ts
# - src/onboarding/wizard.ts
# - src/onboarding/checklist.ts
# - src/onboarding/templates.ts
# - src/onboarding/onboarding.test.ts (26 个测试)
```

### 2.2 已移除代码

**commands/onboarding.ts**:
```typescript
// 删除: isOnboardingNeeded() 函数 (从未被使用)
// 删除: 底部 isMainModule 检测代码
// 删除: 未使用导入 (getProviderById, type Model, magenta)
```

---

## 3. 命令模块 API

### 3.1 onboarding.ts (setup 子命令)

```typescript
// 导出函数
export async function runOnboarding(): Promise<boolean>

// 内部函数
async function selectProvider(): Promise<ProviderDef>
async function selectModel(providerId: string): Promise<string | null>
async function enterApiKey(provider: ProviderDef): Promise<string | null>
async function setDefaultModel(providerId: string, modelId: string): Promise<void>
```

### 3.2 doctor.ts (doctor 子命令)

```typescript
// 导出函数
export async function runDoctor(): Promise<void>

// 内部函数
function checkEnvFile(): CheckResult
function checkApiKeys(): CheckResult[]
function checkPackages(): CheckResult[]
function checkConfig(): CheckResult[]
```

---

## 4. 当前文件结构

```
src/
├── index.tsx                    # CLI 入口 ✅
├── cli.ts                      # 交互式 CLI (46KB)
│
├── commands/                   # 命令模块 ✅
│   ├── index.ts              # 导出 (来自 @upup/commands)
│   ├── onboarding.ts          # setup 子命令 ✅
│   └── doctor.ts             # doctor 子命令 ✅
│
├── components/                 # TUI 组件
├── controllers/                # 控制器
├── agent/                      # Agent 核心
├── tools/                      # 工具注册
├── memory/                     # 记忆系统
├── mcp/                        # MCP 集成
│
└── onboarding/               # ✅ 已删除 (死代码)
```

---

## 5. 验证结果

### 5.1 验证脚本

```bash
$ bash verify-cli.sh
==========================================
UpUp CLI 命令验证
==========================================

1. 测试 upup help
✅ help 命令成功

2. 测试 upup version
✅ version 命令成功

3. 测试 upup doctor
✅ doctor 命令成功 (预期有未配置项)

4. 测试 upup setup
✅ setup 命令成功

==========================================
所有命令验证通过 ✅
==========================================
```

### 5.2 命令测试

```bash
$ bun run src/index.tsx help
UpUp - AI Agent for Deep Financial Research

Usage:
  upup              Start interactive CLI
  upup setup        Run interactive setup wizard
  upup doctor       Run health check
  upup help         Show this help message
  upup version      Show version

$ bun run src/index.tsx version
UpUp v2026.05.11

$ bun run src/index.tsx doctor
╔══════════════════════════════════════════════════════════╗
║ UpUp Health Check                                        ║
╠══════════════════════════════════════════════════════════╣
  ✓ Environment         Config file found
  ✓ DeepSeek API        configured
  ✓ @langchain/core     installed
  ⚠ Default Model       not set - will use provider default
╚══════════════════════════════════════════════════════════╝
  Summary: 6 passed, 1 warnings, 6 failed
```

### 5.3 测试通过

```bash
$ bun test
bun test v1.3.7 (ba426210)

  2012 pass
  0 fail
  3870 expect() calls
Ran 2012 tests across 109 files.
```

---

## 6. 验收清单

- [x] `upup` 启动交互式 CLI
- [x] `upup setup` 运行设置向导
- [x] `upup doctor` 显示健康检查
- [x] `upup help` 显示帮助
- [x] `upup version` 显示版本
- [x] 清理 `src/onboarding/` 死代码
- [x] 移除 `isOnboardingNeeded()` 未使用函数
- [x] 所有测试通过
- [x] CLI 命令验证脚本通过

---

## 7. 相关文档

- [20260511.md](20260511.md) — Agent SDK 全面改造计划
- [src/index.tsx](src/index.tsx) — CLI 入口
- [src/commands/onboarding.ts](src/commands/onboarding.ts) — 设置向导
- [src/commands/doctor.ts](src/commands/doctor.ts) — 健康检查
- [src/cli.ts](src/cli.ts) — 交互式 CLI
- [verify-cli.sh](verify-cli.sh) — CLI 验证脚本

---

*最后更新: 2026-05-12 | v5.0 | 状态: ✅ 已完成*
