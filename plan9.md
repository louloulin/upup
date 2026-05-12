# UpUp 多平台模块化改造计划 v9.0

> 版本: 9.0 | 更新日期: 2026-05-12
> 目标: 提升代码模块化，支持 macOS/Windows/Linux 多平台

---

## 目录

1. [现状分析](#1-现状分析)
2. [模块化评估](#2-模块化评估)
3. [多平台支持评估](#3-多平台支持评估)
4. [代码质量问题](#4-代码质量问题)
5. [改造计划](#5-改造计划)
6. [实施路线图](#6-实施路线图)
7. [验收标准](#7-验收标准)

---

## 1. 现状分析

### 1.1 包结构概览

```
dexter/
├── package.json              # 主包配置
├── tsconfig.json            # TypeScript 配置
├── packages/               # 20 个子包
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   ├── llm/                # LLM 封装
│   ├── agent-core/         # Agent 核心
│   ├── skills/             # Skills 系统
│   ├── plugin-sdk/         # Plugin SDK
│   ├── mcp/                # MCP 客户端
│   ├── memory/             # 记忆系统
│   ├── sdk/                # SDK
│   ├── commands/           # 命令系统
│   ├── keybindings/         # 快捷键
│   ├── hooks/              # Hooks
│   ├── state/              # 状态管理
│   ├── daemon/             # 守护进程
│   ├── cron/               # 定时任务
│   ├── gateway/            # 网关
│   ├── plugins/            # 插件集合
│   └── adapter-paperclip/  # Paperclip 适配器
├── src/                    # 主应用代码
│   ├── agent/             # Agent 核心
│   ├── tools/             # 工具系统 (60+ 工具)
│   ├── utils/             # 工具函数
│   ├── memory/            # 记忆系统
│   ├── model/             # 模型调用
│   └── ...
└── dist/                  # 构建产物
```

### 1.2 已发布包 (Verdaccio)

| 包名 | 版本 | 状态 |
|------|------|------|
| @upup/types | 0.1.0 | ✅ |
| @upup/utils | 0.1.0 | ✅ |
| @upup/llm | 0.1.0 | ✅ |
| @upup/agent-core | 0.1.0 | ✅ |
| @upup/skills | 0.1.0 | ✅ |
| @upup/mcp | 0.1.0 | ✅ |
| @upup/memory | 0.1.0 | ✅ |
| @upup/plugin-sdk | 0.1.0 | ✅ |
| @upup/adapter-paperclip | 1.0.0 | ✅ |
| ... | ... | ... |

---

## 2. 模块化评估

### 2.1 当前模块化评分

| 维度 | 评分 | 说明 |
|------|------|------|
| **包划分** | ⭐⭐⭐⭐ | 20 个子包，职责清晰 |
| **依赖管理** | ⭐⭐⭐⭐ | 使用 workspace 协议 |
| **导出规范** | ⭐⭐⭐ | 部分包缺少类型导出 |
| **接口设计** | ⭐⭐⭐ | 缺乏统一接口抽象 |
| **可测试性** | ⭐⭐⭐ | 部分代码耦合度高 |

**总分: 3.2/5**

### 2.2 模块化问题清单

#### 问题 1: 工具系统过于耦合

```
问题位置: src/tools/
├── bash/bash-tool.ts (400+ 行)
├── filesystem/*.ts (耦合文件系统操作)
└── registry/index.ts (单文件过大)
```

**影响:**
- 难以单独测试和复用
- 跨包迁移困难
- 代码维护成本高

**建议:**
```typescript
// 改造后结构
src/tools/
├── bash/
│   ├── bash-tool.ts        # 工具定义
│   ├── executor.ts          # 命令执行器 (可复用)
│   ├── security.ts          # 安全检查
│   └── classifiers/        # 命令分类器
├── filesystem/
│   ├── read-tool.ts        # 读取工具
│   ├── write-tool.ts       # 写入工具
│   ├── edit-tool.ts        # 编辑工具
│   ├── path-resolver.ts    # 路径解析 (可复用)
│   └── platform-adapter.ts # 平台适配
└── registry/
    ├── index.ts            # 注册入口
    └── factories/          # 工具工厂
```

#### 问题 2: 工具注册中心过于集中

```typescript
// 当前: src/tools/registry/index.ts
// 问题: 单文件 500+ 行，难以维护
```

**建议:**
```typescript
// 改造后: 分散到各工具子模块
packages/tools-core/
├── src/
│   ├── index.ts
│   ├── base.ts            # 基础工具类
│   ├── registry.ts        # 注册表
│   └── loader.ts         # 动态加载
```

#### 问题 3: 类型导出不完整

```typescript
// 当前: packages/xxx/src/index.ts
// 问题: 部分类型未导出
```

**建议:**
```typescript
// packages/agent-core/src/index.ts
export type { Agent, AgentConfig } from './agent.js';
export type { ToolExecutor } from './tool-executor.js';
export type { ContextManager } from './context-manager.js';
export * from './types.js';
```

---

## 3. 多平台支持评估

### 3.1 多平台支持矩阵

| 功能 | macOS | Windows | Linux | 状态 |
|------|-------|--------|-------|------|
| **Bash 工具** | ✅ | ⚠️ | ✅ | 部分支持 |
| **文件系统** | ✅ | ⚠️ | ✅ | 需适配 |
| **快捷键** | ⚠️ | ⚠️ | ⚠️ | 需统一 |
| **通知系统** | ✅ | ⚠️ | ⚠️ | 需适配 |
| **守护进程** | ⚠️ | ❌ | ✅ | 需改造 |
| **Cron 任务** | ✅ | ❌ | ✅ | 需改造 |

### 3.2 当前多平台问题

#### 问题 1: Bash 工具仅支持 Unix

```typescript
// src/tools/bash/bash-tool.ts
const WRITE_COMMANDS = new Set([
  'mkdir', 'rmdir', 'touch', 'chmod', 'chown', 'chgrp',  // Unix only
  'systemctl', 'service', 'launchctl',  // Platform-specific
  // ❌ 缺少 Windows 命令: 'mkdir', 'del', 'rd'
]);
```

**建议:**
```typescript
// src/utils/platform.ts
import { platform } from 'node:os';

export type Platform = 'darwin' | 'win32' | 'linux';

export const currentPlatform: Platform =
  platform() as Platform;

export const isMac = currentPlatform === 'darwin';
export const isWindows = currentPlatform === 'win32';
export const isLinux = currentPlatform === 'linux';

// src/tools/bash/platform-commands.ts
export const PLATFORM_COMMANDS = {
  darwin: {
    listDir: ['ls', 'ls -la'],
    makeDir: ['mkdir'],
    removeDir: ['rmdir', 'rm -rf'],
    kill: ['kill', 'killall'],
    service: ['launchctl'],
  },
  win32: {
    listDir: ['dir', 'Get-ChildItem'],
    makeDir: ['mkdir', 'md'],
    removeDir: ['rmdir', 'rd', 'Remove-Item'],
    kill: ['taskkill', 'Stop-Process'],
    service: ['sc', 'net start'],
  },
  linux: {
    listDir: ['ls', 'ls -la'],
    makeDir: ['mkdir'],
    removeDir: ['rmdir', 'rm -rf'],
    kill: ['kill', 'killall', 'pkill'],
    service: ['systemctl', 'service'],
  },
};
```

#### 问题 2: 路径验证仅支持 Unix

```typescript
// src/tools/bash/path-validation.ts
export const PROTECTED_PATHS = [
  '/etc/shadow',      // Unix only
  '/etc/sudoers',
  '/root/.ssh',
  '/home/*/.ssh',
  '/var/log/secure',
  // ❌ 缺少 Windows 保护路径
  // 'C:\Windows\System32\config',
  // 'C:\Users\*\.ssh',
];
```

**建议:**
```typescript
// src/utils/platform-paths.ts
import { platform, homedir } from 'node:os';
import { join } from 'node:path';

export interface ProtectedPaths {
  systemFiles: string[];
  protectedDirs: string[];
  sensitivePatterns: RegExp[];
}

export function getProtectedPaths(): ProtectedPaths {
  const plat = platform();

  if (plat === 'win32') {
    const home = homedir();
    return {
      systemFiles: [
        'C:\\Windows\\System32\\config\\SAM',
        'C:\\Windows\\System32\\config\\SYSTEM',
        'C:\\Windows\\System32\\config\\SECURITY',
      ],
      protectedDirs: [
        join(home, '.ssh'),
        'C:\\Windows\\System32',
        'C:\\ProgramData\\Microsoft\\Windows',
      ],
      sensitivePatterns: [
        /\.ssh\/authorized_keys$/,
        /\.env$/,
        /credentials\.json$/,
      ],
    };
  }

  // Unix 系统
  const home = homedir();
  return {
    systemFiles: [
      '/etc/shadow',
      '/etc/sudoers',
      '/etc/gshadow',
    ],
    protectedDirs: [
      '/root/.ssh',
      join(home, '.ssh'),
      '/var/log/secure',
    ],
    sensitivePatterns: [
      /\.ssh\/authorized_keys$/,
      /\.env$/,
      /credentials\.json$/,
    ],
  };
}
```

#### 问题 3: 快捷键系统平台差异

```typescript
// src/utils/text-navigation.ts
/**
 * Used for Option+Left (Mac) / Ctrl+Left (Windows) navigation.
 */

// ❌ 问题: 没有统一处理平台差异
```

**建议:**
```typescript
// src/utils/keybindings.ts
import { platform } from 'node:os';

export interface KeyBinding {
  mac: string[];
  windows: string[];
  linux: string[];
}

export const KEY_BINDINGS = {
  wordLeft: {
    mac: ['Alt+Left'],
    windows: ['Ctrl+Left'],
    linux: ['Alt+Left', 'Ctrl+Alt+Left'],
  },
  wordRight: {
    mac: ['Alt+Right'],
    windows: ['Ctrl+Right'],
    linux: ['Alt+Right', 'Ctrl+Alt+Right'],
  },
  deleteWord: {
    mac: ['Alt+Backspace'],
    windows: ['Ctrl+Backspace'],
    linux: ['Ctrl+Backspace'],
  },
};

export function getKeyBinding(name: keyof typeof KEY_BINDINGS): string[] {
  const plat = platform();
  const binding = KEY_BINDINGS[name];

  if (plat === 'win32') return binding.windows;
  if (plat === 'darwin') return binding.mac;
  return binding.linux;
}
```

#### 问题 4: 新闻客户端 User-Agent 硬编码

```typescript
// src/tools/astock/news-client.ts
'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...'
// ❌ 问题: 硬编码 macOS User-Agent
```

**建议:**
```typescript
// src/utils/user-agent.ts
import { platform, release } from 'node:os';

export function getDefaultUserAgent(): string {
  const plat = platform();
  const ver = release();

  if (plat === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`;
  }
  if (plat === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X ${ver.replace(/\./g, '_')}) AppleWebKit/537.36`;
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36`;
}
```

### 3.3 多平台支持架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      多平台架构设计                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Platform Abstraction Layer                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │   │
│  │  │  platform.ts │  │ path-adapter│  │shell-adapter│         │   │
│  │  │  平台检测   │  │  路径适配   │  │  Shell 适配  │         │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │   │
│  └──────────┼─────────────────┼─────────────────┼──────────────────┘   │
│             │                 │                 │                       │
│             ▼                 ▼                 ▼                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Platform Implementations                       │   │
│  │  ┌───────────────┬───────────────┬───────────────┐             │   │
│  │  │    macOS      │   Windows     │    Linux     │             │   │
│  │  ├───────────────┼───────────────┼───────────────┤             │   │
│  │  │ launchctl    │    sc/net     │  systemd     │             │   │
│  │  │ open command │   cmd.exe    │   systemctl  │             │   │
│  │  │ pbcopy/pbpaste│  clip.exe   │   xclip     │             │   │
│  │  │  Finder path │   Explorer   │   nautilus  │             │   │
│  │  └───────────────┴───────────────┴───────────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 代码质量问题

### 4.1 TypeScript 问题

#### 问题 1: 缺少 ESLint 配置

```bash
# 当前状态
$ npx eslint src/
Oops! Something went wrong! :(
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

**建议: 创建 eslint.config.js**
```javascript
// eslint.config.js
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.test.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
```

#### 问题 2: 类型导出不完整

```typescript
// packages/agent-core/src/index.ts
// ❌ 缺少类型导出
```

**建议: 完善导出**
```typescript
// packages/agent-core/src/index.ts
export type { Agent, AgentConfig, AgentEvent } from './agent.js';
export type { ToolExecutor, ToolResult } from './tool-executor.js';
export type { ContextManager } from './context-manager.js';
export type { InvestmentConfig, InvestmentKnowledge } from './investment.js';
export * from './types.js';
```

### 4.2 安全问题

#### 问题 1: 路径验证仅针对 Unix

```typescript
// src/tools/bash/path-validation.ts
// ⚠️ Windows 路径如 C:\Windows\System32 未被保护
```

#### 问题 2: Shell 命令硬编码

```typescript
// src/tools/bash/command-classifier.ts
// ⚠️ 包含 Unix 特定命令
```

### 4.3 性能问题

#### 问题 1: 大文件打包到内存

```bash
# 当前 memory 包大小
dist/index-*.node: 39MB  (DuckDB WASM)
dist/index.js: 10MB
```

#### 问题 2: 缺少按需加载

```typescript
// 当前: 所有工具一起打包
// 建议: 动态导入
const tool = await import(`./tools/${toolName}.js`);
```

---

## 5. 改造计划

### 5.1 Phase 1: 平台抽象层 (1-2 周)

```
目标: 建立统一的平台抽象层

任务:
1. [ ] 创建 src/utils/platform.ts
   - 平台检测
   - 平台特定命令映射
   - 平台特定路径

2. [ ] 创建 src/utils/platform-paths.ts
   - 跨平台路径验证
   - 保护路径检测
   - 敏感文件识别

3. [ ] 创建 src/utils/keybindings.ts
   - 统一快捷键定义
   - 平台适配

4. [ ] 创建 src/utils/user-agent.ts
   - 动态 User-Agent 生成

5. [ ] 改造 src/tools/bash/bash-tool.ts
   - 支持 Windows PowerShell/cmd
   - 平台特定命令映射

6. [ ] 改造 src/tools/bash/path-validation.ts
   - 支持 Windows 路径
   - 跨平台保护路径
```

### 5.2 Phase 2: 模块化重构 (2-3 周)

```
目标: 提升代码模块化程度

任务:
1. [ ] 拆分 src/tools/registry/
   - 工具工厂模式
   - 按类别分散注册

2. [ ] 创建 packages/tools-core/
   - 基础工具类
   - 统一接口定义
   - 可复用组件

3. [ ] 完善包导出
   - 补全类型导出
   - 统一导出格式

4. [ ] 添加 ESLint 配置
   - TypeScript 规则
   - 安全规则

5. [ ] 添加 Prettier 配置
   - 统一代码风格
```

### 5.3 Phase 3: 多平台适配 (2-3 周)

```
目标: 完整支持 macOS/Windows/Linux

任务:
1. [ ] 改造通知系统
   - macOS: Notification Center
   - Windows: Windows Toast
   - Linux: libnotify/D-Bus

2. [ ] 改造守护进程
   - macOS: launchd
   - Windows: Windows Service
   - Linux: systemd

3. [ ] 改造 Cron 系统
   - macOS: launchd
   - Windows: Task Scheduler
   - Linux: cron

4. [ ] 改造进程管理
   - 跨平台进程检测
   - 跨平台信号处理

5. [ ] 测试套件
   - 各平台单元测试
   - 集成测试
```

### 5.4 Phase 4: 代码质量提升 (1-2 周)

```
目标: 提升整体代码质量

任务:
1. [ ] TypeScript 严格模式
   - 启用 strict: true
   - 修复类型错误

2. [ ] 性能优化
   - 减小打包体积
   - 按需加载
   - 缓存优化

3. [ ] 文档完善
   - JSDoc 注释
   - API 文档
   - 使用示例

4. [ ] 测试覆盖
   - 单元测试
   - 集成测试
   - E2E 测试
```

---

## 6. 实施路线图

### 6.1 时间线

```
Week 1-2    Week 3-4    Week 5-6    Week 7-8    Week 9-10
    │           │           │           │           │
    ▼           ▼           ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│Platform │ │  Tools  │ │ Platform│ │  Code   │ │ Release │
│Abstraction│ │ Module  │ │  Full   │ │ Quality │ │         │
│ Layer   │ │ Refactor│ │ Support │ │提升      │ │ v9.0    │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

### 6.2 详细任务分解

```markdown
## Week 1: 平台抽象层基础

### Day 1-2: platform.ts
- [ ] 实现平台检测
- [ ] 实现平台特定命令映射
- [ ] 添加单元测试

### Day 3-4: platform-paths.ts
- [ ] 实现跨平台路径验证
- [ ] 实现保护路径检测
- [ ] 添加单元测试

### Day 5: keybindings.ts
- [ ] 定义统一快捷键
- [ ] 实现平台适配
- [ ] 添加单元测试

## Week 2: 工具改造

### Day 6-7: bash-tool.ts 改造
- [ ] 重构命令执行器
- [ ] 添加 Windows 支持
- [ ] 添加测试

### Day 8-9: path-validation.ts 改造
- [ ] 添加 Windows 路径支持
- [ ] 完善保护路径
- [ ] 添加测试

### Day 10: 集成测试
- [ ] 跨平台集成测试
- [ ] 修复发现的问题
```

---

## 7. 验收标准

### 7.1 模块化标准

- [ ] 每个子包有清晰的职责
- [ ] 类型导出完整
- [ ] 单元测试覆盖 > 70%
- [ ] 无循环依赖

### 7.2 多平台标准

- [ ] macOS 完整支持
- [ ] Windows 完整支持
- [ ] Linux 完整支持
- [ ] 平台特定功能优雅降级

### 7.3 代码质量标准

- [ ] TypeScript 严格模式通过
- [ ] ESLint 检查通过
- [ ] Prettier 格式化通过
- [ ] 无安全漏洞
- [ ] 文档完整

### 7.4 性能标准

- [ ] 主包 < 50MB
- [ ] 首屏加载 < 3s
- [ ] 工具按需加载

---

## 附录

### A. 参考资料

- [Node.js 平台检测](https://nodejs.org/api/os.html#osplatform)
- [跨平台路径处理](https://nodejs.org/api/path.html)
- [Claude Code 路径验证](file:///Users/louloulin/Documents/linchong/claw/loucode/src/tools/bash/pathValidation.ts)

### B. 相关文档

- [plan8.md](./plan8.md) - Claude Code 投资助手架构
- [LOCAL_PUBLISH_ANALYSIS.md](./LOCAL_PUBLISH_ANALYSIS.md) - 本地发布分析
- [PAPERCLIP_ADAPTER_README.md](./PAPERCLIP_ADAPTER_README.md) - Paperclip 适配器

### C. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 9.0 | 2026-05-12 | 多平台模块化改造计划 |
| 8.0 | 2026-05-12 | Claude Code 投资助手架构 |
| ... | ... | ... |

---

*文档版本: 9.0 | 更新日期: 2026-05-12*
