# UpUp 模块化配置规范化 - plan9.1.md

> 版本: 9.1.1 | 更新日期: 2026-05-12
> 目标: 规范化包配置，消除 src 导入，包之间完全隔离

---

## 1. 问题分析

### 1.1 核心问题

**包隔离问题**: `adapter-paperclip` 包无法独立存在，因为它需要主应用的 `Agent` 类。

```
当前架构问题:

┌─────────────────────────────────────────────────────────────┐
│  src/agent/agent.ts (主应用)                              │
│  └── export class Agent { ... }                           │
│      depends on 26 internal modules:                       │
│      ├── ../model/llm.js                                 │
│      ├── ../tools/registry/index.js                       │
│      ├── ../hooks/agent-hooks.js                          │
│      ├── ../memory/index.js                              │
│      └── ... (22 more)                                   │
└─────────────────────────────────────────────────────────────┘
           │
           │ (不存在!)
           ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/agent-core (只导出类型)                           │
│  └── export type { AgentConfig, AgentEvent, ... }        │
│      ❌ 没有 Agent 类运行时                                │
└─────────────────────────────────────────────────────────────┘
           │
           │ 期望导入 Agent 类
           ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/adapter-paperclip                                │
│  └── import { Agent } from '@upup/agent-core';  ❌ ERROR  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 依赖关系图

```
@upup/types (独立) ←──┬──→ @upup/utils (独立)
                      │
                      ▼
              @upup/llm ────→ @upup/agent-core (类型)
                      │              │
                      │              │ (缺少运行时!)
                      ▼              ▼
              @upup/memory    @upup/adapter-paperclip
                                ❌ 需要 Agent 类
```

### 1.3 问题总结

| 问题 | 描述 | 影响 |
|------|------|------|
| Agent 类位置错误 | Agent 类在 src/ 不在 packages/ | adapter-paperclip 无法独立 |
| agent-core 名不副实 | 名字暗示运行时，实际只有类型 | 开发者困惑 |
| 26 个内部依赖 | Agent 依赖 26 个内部模块 | 重构成本高 |
| 包隔离失败 | adapter-paperclip 依赖主应用 | 无法发布独立包 |

---

## 2. 解决方案

### 2.1 方案对比

| 方案 | 描述 | 优点 | 缺点 | 成本 |
|------|------|------|------|------|
| **A. 移除 adapter-paperclip** | 删除 packages/adapter-paperclip | 完全隔离 | 功能丢失 | 低 |
| **B. 集成到主应用** | 移动到 src/adapters/paperclip | 架构清晰 | 包数量减少 | 低 |
| **C. 重构为子进程** | 使用 @upup/sdk 的 stdio 通信 | 完全隔离 | 性能开销 | 中 |
| **D. 创建 agent-runtime** | 新建 packages/agent-runtime | 架构正确 | 工作量大 | 高 |

### 2.2 推荐方案: B + C 组合

#### 阶段 1: 立即行动 (推荐)

**方案 B**: 将 adapter-paperclip 移入主应用

```
当前:                                   目标:
packages/adapter-paperclip/    →     src/adapters/paperclip/
     └── src/server/execute.ts             └── src/server/execute.ts
     └── src/runtime/agent.ts (src引用)    └── 直接导入 src/agent/
```

**执行步骤**:
```bash
# 1. 移动目录
mv packages/adapter-paperclip src/adapters/paperclip

# 2. 修复导入
# src/adapters/paperclip/src/runtime/agent.ts → 删除，使用 src/agent/

# 3. 更新主应用入口
# src/index.tsx 导入 src/adapters/paperclip

# 4. 删除 packages/adapter-paperclip
rm -rf packages/adapter-paperclip
```

#### 阶段 2: 长期优化 (可选)

**方案 C**: 为外部集成创建 stdio 通信方式

```
外部应用 ──stdio──→ @upup/sdk ──stdio──→ upup (子进程)
                                    └── Agent 运行在子进程
```

---

## 3. 包依赖管理最佳实践

### 3.1 依赖分层

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: 基础层 (无依赖)                  │
├─────────────────────────────────────────────────────────────┤
│  @upup/types    - 共享类型定义                              │
│  @upup/utils    - 纯工具函数 (无外部依赖)                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 2: 核心层                          │
├─────────────────────────────────────────────────────────────┤
│  @upup/llm       - 依赖 types                              │
│  @upup/state     - 依赖 types                             │
│  @upup/memory    - 依赖 types                             │
│  @upup/hooks     - 依赖 types, utils                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: 服务层                          │
├─────────────────────────────────────────────────────────────┤
│  @upup/skills     - 依赖 types, utils, hooks              │
│  @upup/mcp        - 依赖 types, utils, hooks              │
│  @upup/plugins    - 依赖 types                            │
│  @upup/plugin-sdk - 依赖 types                            │
│  @upup/commands   - 依赖 types                            │
│  @upup/keybindings- 依赖 types                            │
│  @upup/cron       - 依赖 types                            │
│  @upup/daemon     - 依赖 types                            │
│  @upup/gateway    - 依赖 types, utils                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 4: SDK 层 (对外)                    │
├─────────────────────────────────────────────────────────────┤
│  @upup/sdk        - 依赖 types (stdio 通信)                │
│  @upup/agent-core - 依赖 types (仅类型)                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 5: 应用层 (主应用)                   │
├─────────────────────────────────────────────────────────────┤
│  src/             - 整合所有包 + Agent 运行时              │
│  src/adapters/    - 集成适配器                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 隔离规则

| 规则 | 说明 | 示例 |
|------|------|------|
| **R1** | packages/ 之间只能依赖 Layer 1-4 | ✅ @upup/sdk → @upup/types |
| **R2** | Layer 4 包不能依赖 Layer 5 | ✅ @upup/agent-core 只导出类型 |
| **R3** | src/ 可以依赖任何包 | ✅ src/index.tsx → @upup/llm |
| **R4** | src/ 可以导入 src/ | ✅ src/agent → src/tools |
| **R5** | 禁止 src → packages 循环依赖 | ❌ src/agent 不能导入 adapter-paperclip |

---

## 4. 实施计划

### 4.1 立即执行 (1天)

```markdown
- [ ] 将 adapter-paperclip 移至 src/adapters/
- [ ] 删除 packages/adapter-paperclip
- [ ] 修复所有导入路径
- [ ] 验证 TypeScript 类型检查通过
- [ ] 验证测试套件通过
```

### 4.2 清理验证 (1天)

```markdown
- [ ] 验证所有包配置使用 dist/
- [ ] 验证没有 src 相对路径导入
- [ ] 验证包依赖关系符合分层规则
- [ ] 更新文档
```

### 4.3 长期优化 (可选)

```markdown
- [ ] 创建外部 stdio 通信示例
- [ ] 完善 @upup/sdk 文档
- [ ] 添加包版本兼容性测试
```

---

## 5. 包功能映射 (更新)

### 5.1 核心包 (packages/)

| 包名 | 功能 | 依赖 | 发布状态 |
|------|------|------|----------|
| @upup/types | 共享类型 | 无 | ✅ |
| @upup/utils | 工具函数 | types | ✅ |
| @upup/llm | LLM 封装 | types | ✅ |
| @upup/state | 状态管理 | 无 | ✅ |
| @upup/memory | 记忆系统 | types | ✅ |
| @upup/mcp | MCP 客户端 | types, utils, hooks | ✅ |
| @upup/skills | Skills | types, utils, hooks | ✅ |
| @upup/plugins | 插件系统 | types | ✅ |
| @upup/plugin-sdk | 插件 SDK | types | ✅ |
| @upup/commands | 命令系统 | types | ✅ |
| @upup/keybindings | 快捷键 | types | ✅ |
| @upup/hooks | Hooks | types, utils | ✅ |
| @upup/cron | Cron | types | ✅ |
| @upup/daemon | 守护进程 | types | ✅ |
| @upup/gateway | 网关 | types, utils | ✅ |
| @upup/sdk | Agent SDK | types (stdio) | ✅ |
| @upup/agent-core | Agent 类型 | types | ✅ |

### 5.2 应用集成 (src/)

| 路径 | 功能 | 说明 |
|------|------|------|
| src/agent/ | Agent 运行时 | 包含完整 Agent 类 |
| src/adapters/ | 适配器 | Paperclip 等集成 |
| src/tools/ | 工具系统 | 60+ 工具实现 |
| src/model/ | 模型调用 | LLM 集成 |

---

## 6. 验收标准

- [ ] 18 个包全部使用 dist 目录
- [ ] 没有 src 相对路径导入 (packages/)
- [ ] 包依赖关系符合分层规则
- [ ] TypeScript 类型检查通过
- [ ] 测试套件全部通过
- [ ] 文档完整

---

## 7. 当前状态

### 7.1 构建状态

```
Build Status: 18/18 packages ✅
Test Status: 2012/2012 tests ✅
Typecheck: PASS ✅
```

### 7.2 待修复问题

| 问题 | 状态 |
|------|------|
| adapter-paperclip 使用 src | ⚠️ 待修复 |
| Agent 类位置不当 | ⚠️ 待修复 |

---

## 8. 附录

### A. 相关文档

- [plan9.md](./plan9.md) - 多平台模块化改造计划
- [LOCAL_PUBLISH_ANALYSIS.md](./LOCAL_PUBLISH_ANALYSIS.md) - 本地发布分析
- [PAPERCLIP_ADAPTER_README.md](./PAPERCLIP_ADAPTER_README.md) - Paperclip 适配器

### B. 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| 9.1.1 | 2026-05-12 | 包隔离分析，移除 adapter-paperclip 方案 |
| 9.1 | 2026-05-12 | 模块化配置规范化 |
| 9.0 | 2026-05-12 | 多平台模块化改造计划 |

---

*文档版本: 9.1.1 | 更新日期: 2026-05-12*
