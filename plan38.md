# Dexter/UpUp 多智能体系统改造计划

**日期**: 2026-05-24  
**版本**: 1.0 (初稿)  
**状态**: 📋 规划中  
**分支**: feature/multi-agent-engine

---

## 一、问题分析

### 1.1 当前实现概述

当前UpUp多智能体系统基于Claude Code Swarm设计，核心组件包括：

| 组件 | 位置 | 功能 |
|------|------|------|
| SwarmCoordinator | `src/multi-agent/coordinator.ts` | 多智能体编排 |
| TeamManager | `src/multi-agent/team-manager.ts` | 团队生命周期管理 |
| Backend Registry | `src/multi-agent/backends/index.ts` | 执行后端管理 |
| SubagentRunner | `src/agent/subagent-runner.ts` | 子Agent执行 |
| SwarmTools | `src/multi-agent/tools/swarm-tools.ts` | LLM工具接口 |

### 1.2 发现的问题

#### 问题1: 工具重复定义
- `src/multi-agent/tools/swarm-tools.ts` 定义了`swarm_team_create`等工具
- `src/tools/team-tools.ts` 定义了`team_create`等工具
- 两者功能重叠但实现不同

#### 问题2: 团队管理分散
- `TeamManager`使用文件持久化（`~/.upup/teams/`）
- `team-tools.ts`使用内存Map存储
- 数据不一致，teams累积过多

#### 问题3: 执行后端未集成到主Agent
- Backend Registry存在但未被主Agent使用
- 多智能体工具未被注册到工具注册表
- LLM无法直接调用多智能体功能

#### 问题4: 缺少真实的多智能体工作流
- 现有脚本是测试性质的
- 没有真实的多智能体分析工作流
- 交互式AppScript触发机制不完善

### 1.3 与Claude Code的差距

| 功能 | Claude Code | 当前UpUp | 差距 |
|------|------------|----------|------|
| Team管理 | 文件+内存同步 | 仅文件 | ⚠️ |
| Agent Spawn | 真实子进程 | 内部执行 | ⚠️ |
| 工具注册 | 全局注册 | 部分注册 | ⚠️ |
| 工作流 | 内置模板 | 缺失 | ❌ |
| 交互触发 | 成熟机制 | 待完善 | ⚠️ |

---

## 二、改造目标

### 2.1 总体目标

1. **统一团队管理** - 合并两套team实现，建立单一数据源
2. **完善工具集成** - 将多智能体工具注册到主工具注册表
3. **增强交互触发** - 实现真实的交互式多智能体工作流
4. **优化资源管理** - 自动清理旧teams，防止堆积

### 2.2 具体目标

| 目标 | 优先级 | 说明 |
|------|--------|------|
| 统一Team存储 | P0 | 合并team-tools.ts和TeamManager |
| 注册SwarmTools | P0 | 将工具注册到domain-tools.ts |
| 真实工作流 | P1 | 创建多智能体分析工作流 |
| 交互触发 | P1 | 完善AppScript交互机制 |
| 资源清理 | P2 | Team自动清理机制 |

---

## 三、改造计划

### Phase 1: 统一Team存储 (P0)

#### 1.1 合并Team实现

**目标**: 建立单一team数据源

```
现状:
- TeamManager: 文件存储 ~/.upup/teams/
- teamStore: 内存 Map<string, Team>

改造后:
- 统一使用TeamManager
- team-tools.ts调用TeamManager API
- 删除重复的teamStore
```

#### 1.2 改造步骤

1. 修改`src/tools/team-tools.ts`使用TeamManager API
2. 删除`src/multi-agent/tools/swarm-tools.ts`中的team相关代码
3. 添加TeamManager的内存缓存同步
4. 更新team持久化逻辑

#### 1.3 验证

```bash
# 运行AppScript验证
bun run src/multi-agent/appscript-verifier.ts

# 检查teams目录
ls ~/.upup/teams/ | wc -l  # 应该 < 100
```

---

### Phase 2: 注册SwarmTools (P0)

#### 2.1 添加工具注册

**目标**: 将swarm工具注册到主工具注册表

修改`src/tools/registry/domain-tools.ts`:

```typescript
// 添加swarm工具导入
import { swarmTools } from '../../multi-agent/tools/swarm-tools.js';

// 在loadDomainTools中注册
export async function loadDomainTools(): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [];
  
  // ... 现有工具 ...
  
  // 添加Swarm多智能体工具
  for (const tool of swarmTools) {
    tools.push({
      name: tool.name,
      tool,
      description: tool.description,
      compactDescription: `SWARM: ${tool.description.slice(0, 50)}...`,
      concurrencySafe: false, // 多智能体操作非并发安全
    });
  }
  
  return tools;
}
```

#### 2.2 验证

```bash
# 检查工具列表中是否包含swarm工具
./dist/upup --help 2>&1 | grep swarm

# 检查LLM工具描述
./dist/upup --doctor 2>&1 | grep -i swarm
```

---

### Phase 3: 真实多智能体工作流 (P1)

#### 3.1 创建工作流模板

**文件**: `src/skills/swarm-analysis/SKILL.md`

```yaml
---
name: swarm-analysis
description: Multi-agent stock analysis workflow
context: swarm
agent: coordinator
---

# 多智能体股票分析工作流

## 步骤

1. 创建团队 `stock-analysis-{symbol}`
2. Spawn研究员Agent - 研究基本面
3. Spawn分析师Agent - 分析财务指标
4. 汇总Agent - 生成投资建议
5. 聚合结果返回

## 触发方式

使用 `/swarm-analysis {symbol}` 触发
```

#### 3.2 创建工作流执行器

**文件**: `src/multi-agent/workflows/stock-analysis.ts`

实现真实的多智能体股票分析工作流。

---

### Phase 4: 交互触发机制 (P1)

#### 4.1 增强AppScript脚本

```bash
# 新的触发命令
./scripts/upup-swarm-analysis.sh 000001  # 分析平安银行
./scripts/upup-swarm-interactive.sh        # 交互式菜单
```

#### 4.2 AppleScript集成

创建`scripts/upup-swarm-trigger.applescript`用于：
- 检测运行状态
- 触发工作流
- 收集结果
- 显示反馈

---

### Phase 5: 资源清理机制 (P2)

#### 5.1 Team自动清理

已有`cleanupOldTeams()`方法，需要：

1. 添加启动时清理
2. 添加定时清理（可选）
3. 添加手动清理命令

#### 5.2 清理配置

```typescript
// TeamManager配置
interface TeamManagerConfig {
  maxTeams: number;           // 最大teams数量
  maxAgeMs: number;           // 最大保留时间
  cleanupOnStartup: boolean; // 启动时清理
}
```

---

## 四、代码变更清单

### 4.1 新增文件

| 文件 | 功能 |
|------|------|
| `src/multi-agent/workflows/stock-analysis.ts` | 股票分析工作流 |
| `src/skills/swarm-analysis/SKILL.md` | 工作流skill |
| `scripts/upup-swarm-analysis.sh` | 分析脚本 |
| `scripts/upup-swarm-trigger.applescript` | AppleScript触发器 |

### 4.2 修改文件

| 文件 | 变更 |
|------|------|
| `src/tools/team-tools.ts` | 使用TeamManager API |
| `src/tools/registry/domain-tools.ts` | 注册swarm工具 |
| `src/multi-agent/tools/swarm-tools.ts` | 清理重复代码 |
| `src/multi-agent/team-manager.ts` | 增强清理功能 |

### 4.3 删除文件

| 文件 | 原因 |
|------|------|
| (待定) | 如果确认无用则删除 |

---

## 五、验证计划

### 5.1 单元测试

```bash
bun test src/multi-agent/
# 目标: 16 pass, 0 fail
```

### 5.2 集成测试

```bash
# AppScript验证
bun run src/multi-agent/appscript-verifier.ts
# 目标: 12/12 passed

# 工具注册测试
./dist/upup --doctor | grep swarm
# 目标: 显示swarm工具

# 多智能体分析测试
./scripts/upup-swarm-analysis.sh 000001
# 目标: 成功执行分析
```

### 5.3 性能测试

```bash
# Teams数量检查
ls ~/.upup/teams/ | wc -l
# 目标: < 100

# 内存使用检查
ps aux | grep upup | grep -v grep
# 目标: 稳定
```

---

## 六、实施顺序

### Step 1: 统一Team存储
- 修改team-tools.ts
- 验证teams正确创建
- 运行AppScript验证

### Step 2: 注册SwarmTools
- 修改domain-tools.ts
- 运行doctor检查
- 验证工具可用

### Step 3: 真实工作流
- 创建工作流文件
- 测试工作流执行
- 优化输出格式

### Step 4: 交互触发
- 创建Shell脚本
- 创建AppleScript
- 测试交互流程

### Step 5: 资源清理
- 完善清理逻辑
- 添加配置选项
- 验证清理效果

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Team数据丢失 | 高 | 保留备份逻辑 |
| 工具冲突 | 中 | 逐步迁移 |
| 性能下降 | 中 | 监控内存使用 |
| 现有功能破坏 | 高 | 充分的回归测试 |

---

## 八、时间估算

| Phase | 预计时间 | 依赖 |
|-------|----------|------|
| Phase 1 | 2-3小时 | 无 |
| Phase 2 | 1-2小时 | Phase 1 |
| Phase 3 | 2-3小时 | Phase 2 |
| Phase 4 | 1-2小时 | Phase 3 |
| Phase 5 | 1小时 | Phase 1 |

**总计**: 7-11小时

---

**最终更新时间**: 2026-05-24 17:30 GMT+8
**状态**: 📋 规划中
**版本**: 1.0
