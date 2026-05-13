# UpUp Plan 8.6: 剩余功能实现计划

> 版本: 8.6 | 更新日期: 2026-05-13
> 目标: 全面分析 plan8.5 剩余未实现功能，制定实现计划
> 状态: **P1.1 ✅ P1.2 ✅ P1.3 ✅ P1.4 ✅ P2.1 ✅ P2.2 ✅ P2.4 ✅ P3.1 ✅ P3.2 ✅ P3.3 ✅ P3.4 ✅** | 2281 tests pass

---

## 1. 已完成功能总结

### P0 核心功能 (已完成)
| 功能 | 文件 | 行数 | 测试 |
|------|------|------|------|
| Skills 双模式执行 | `src/skills/executor.ts` | 306 | 32 tests |
| SKILL.md YAML 解析 | `src/skills/loader.ts` | 169 | - |

### P1 重要功能 (已完成)
| 功能 | 文件 | 行数 | 测试 |
|------|------|------|------|
| 内置插件注册表 | `src/plugins/builtin-plugins.ts` | 386 | 22 tests |
| MCP Desktop 导入 | `src/mcp/desktop-import.ts` | 150+ | 11 tests |
| MCP OAuth 工具 | `src/mcp/oauth.ts` | 200+ | 15 tests |
| MCP 类型定义 | `src/mcp/types.ts` | 250+ | 26 tests |
| MCP Server 生命周期 | `src/mcp/server.ts` | 350+ | 12 tests |
| MCP prompts/sampling | `src/mcp/client.ts` | +100 | 8 tests |
| CLI 插件命令 | `src/commands/plugin.ts` | 350+ | 17 tests |
| SDK 类型对齐 | `src/agent/sdk-types.ts` | 400+ | 25 tests |
| 嵌套记忆路径 | `src/memory/nested-paths.ts` | 400+ | 21 tests |
| **✅ Skill 引用文件** | `src/skills/files.ts` | 316 | 19 tests |
| **✅ Skill 工具限制** | `src/skills/executor.ts` | 已集成 | ✅ |
| **✅ Skill 执行追踪** | `src/skills/executor.ts` | SkillTracker | ✅ |

### P2 增强功能 (已完成)
| 功能 | 文件 | 测试 |
|------|------|------|
| MCP Elicitation | `src/hooks/elicitation.ts` | 32 tests |
| Marketplace 发现 | `src/plugins/discovery.ts` | 部分完成 |

---

## 2. 剩余未实现功能清单

### 2.1 高优先级 (P1) - 需实现

#### P1.1 Skill 引用文件功能 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/skills/files.ts` (316 行) |
| **测试** | 19 tests pass |

**实现内容**:
- `SkillFilesConfig`, `ExtractResult` 类型
- `extractSkillFiles()` - 磁盘文件提取
- `extractBundledSkillFiles()` - 内置技能文件提取
- `getSkillReferencedFiles()` - 解析 SKILL.md 中的 files 字段
- `SkillFilesManager` - 文件追踪和清理
- `defaultSkillFilesManager` - 全局管理器

#### P1.2 Skill 工具限制 (allowedTools) ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/skills/types.ts`, `src/skills/loader.ts`, `src/skills/executor.ts` |

**实现内容**:
- `allowedTools?: string[]` 字段在 `SkillMetadata` 中
- `parseAllowedToolsField()` 解析 YAML
- `executeSkillFork()` 中使用 `allowedTools` 过滤
- `shouldUseForkMode()` 根据工具限制决定执行模式

#### P1.3 MCP OAuth 认证集成 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/mcp/oauth.ts`, `src/mcp/client.ts` |
| **测试** | 5 tests (oauth-integration.test.ts) |

**实现内容**:
- `MCPOAuthConfig` 接口 - OAuth 配置定义
- `MCPServerConfig` 添加 `oauth` 字段
- `getAuthHeaders()` - 获取 OAuth 认证头
- `refreshOAuthToken()` - 刷新过期 token
- `defaultTokenStorage` - token 持久化存储
- OAuth token 自动注入到 HTTP headers/env

#### P1.4 MCP 配置动态 Scope ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** (已有完整实现) |
| **文件** | `src/mcp/types.ts` (300 行) |
| **测试** | 26 tests pass |

**实现内容**:
- `ConfigScopeSchema` - 支持 local/user/project/dynamic/enterprise/claudeai/managed
- `MCPUserConfig` - 用户级别配置带 scope 字段
- `MCPConfigFile` - 项目级 .mcp.json 配置
- Helper functions: `getTransportType()`, `supportsOAuth()`, `isStdioConfig()`, `isHttpConfig()`

### 2.2 中优先级 (P2) - 建议实现

#### P2.1 MCP Server 启动命令 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/commands/mcp.ts` (320 行) |
| **测试** | 16 tests pass |

**实现内容**:
- `serveCommand` - 启动 MCP 服务器
- `listCommand` - 列出配置的服务器
- `statusCommand` - 显示连接状态
- `addCommand` - 添加新服务器配置
- `removeCommand` - 删除服务器配置
- `loadMCPConfig`/`saveMCPConfig` - 配置管理
- 支持 stdio/SSE/HTTP/WebSocket 传输类型

#### P2.2 Session Transcript 增强 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/agent/session-persistence.ts` (632 行) |
| **测试** | 12 tests pass |

**实现内容**:
- `TranscriptRole`, `TranscriptMessage` 类型
- `addTranscriptMessage()` - 添加消息到 transcript
- `getTranscript()` - 获取完整 transcript
- `compressTranscript()` - 压缩旧消息保留最近 N 条
- `deduplicateTranscript()` - 去重连续重复消息
- `resumeFrom()` - 从旧会话恢复 transcript
- `exportTranscript()` - 导出为可读格式
- 完整的 transcript 统计 (user/assistant/tool 数量)

#### P2.3 Skill 执行追踪 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/skills/executor.ts` (SkillTracker 类) |

**实现内容**:
- `SkillTracker` 类 - 追踪已发现和已执行的技能
- `discoveredSkillNames` Set - 已发现技能集合
- `executedSkillNames` Set - 已执行技能集合
- `recordDiscovered()`, `recordExecuted()` - 记录方法
- `wasDiscovered()`, `wasExecuted()` - 查询方法
- `defaultSkillTracker` - 全局追踪器实例

#### P2.4 Skill 变更监听 Hook ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/hooks/use-skills-change.ts` |
| **测试** | 7 tests |

**实现内容**:
- `useSkillsChange` - React hook 监听 skills 变更
- `useSkillsList` - 简化版 skill 列表 hook
- `createSkillsWatcher` - 非 React 场景的文件监视器
- 支持 add/modified/removed 事件
- Debounced 回调避免频繁触发
- `SkillChangeEvent` 类型定义

### 2.3 低优先级 (P3) - 未来实现

#### P3.1 MCP 连接管理 UI ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** (Terminal UI) |
| **文件** | `src/mcp/mcp-ui.ts` |
| **测试** | 9 tests pass |
| **依赖** | @mariozechner/pi-tui |

**实现内容**:
- `MCPUI` - 交互式终端 UI 类
- `MCPServerList` - 服务器列表组件
- `MCPServerDetail` - 服务器详情组件
- `printMCPServers()` - 文本输出函数
- 键盘导航 (↑↓ Enter Q)
- 状态显示 (connected/disconnected/error)

#### P3.2 插件 Skill/Hook 集成 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/plugins/types.ts`, `src/skills/loader.ts` |
| **测试** | 10 tests pass |

**实现内容**:
- 扩展 `PluginCapability` 支持 `'skill'` 和 `'hook'`
- 添加 `convertPluginSkill()` 函数转换插件技能
- 添加 `convertPluginSkills()` 批量转换
- `BuiltinPluginDefinition.skills` 字段已存在
- `BuiltinPluginDefinition.hooks` 字段已存在
- `getBuiltinPluginSkills()` 和 `getBuiltinPluginMCPServers()` 已实现

#### P3.3 语义检索 (Embedding) ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** (集成到 memvid) |
| **文件** | `src/memory/search.ts` |
| **测试** | 10 tests pass |

**实现内容**:
- `tfidfSearch()` - TF-IDF 语义搜索函数
- `TFIDFSearchEngine` - 内存搜索引擎
- `TFIDFEmbedder` - TF-IDF 向量嵌入
- 与 memvid BM25 搜索集成
- 无需外部 embedding API

#### P3.4 完整任务系统 ✅ 已完成
| 项目 | 说明 |
|------|------|
| **状态** | ✅ **已完成** |
| **文件** | `src/agent/task.ts` (420 行) |
| **测试** | 34 tests pass |

**实现内容**:
- `TaskStatus` - pending/running/completed/failed/cancelled
- `TaskPriority` - low/normal/high/critical
- `TaskManager` - 任务创建/更新/查询/删除
- `TaskQueue` - 顺序执行队列
- `getReadyTasks()` - 获取依赖已满足的就绪任务
- `getNextTask()` - 按优先级获取下一个任务
- 子任务和进度追踪
- 事件监听器
- JSON 导入/导出

---

## 3. 实现路线图

### 3.1 短期 (1-2 周) - P1 功能

```
Week 1-2:
┌──────────┐   ┌──────────┐   ┌──────────┐
│ P1.1    │   │ P1.2    │   │ P1.3    │
│ Skill   │ → │ Skill   │ → │ MCP     │
│ 引用文件 │   │ 工具限制 │   │ OAuth   │
│         │   │         │   │ 集成     │
└──────────┘   └──────────┘   └──────────┘
```

### 3.2 中期 (3-4 周) - P2 功能

```
Week 3-4:
┌──────────┐   ┌──────────┐   ┌──────────┐
│ P2.1    │   │ P2.2    │   │ P2.3    │
│ MCP     │   │ Session │   │ Skill   │
│ Serve   │   │ 增强    │   │ 执行追踪 │
└──────────┘   └──────────┘   └──────────┘
```

### 3.3 长期 (5+ 周) - P3 功能

```
Week 5+:
┌──────────┐   ┌──────────┐   ┌──────────┐
│ P3.1    │   │ P3.2    │   │ P3.3    │
│ MCP UI  │   │ Plugin  │   │ Embed-  │
│ (前端)   │   │ Skill   │   │ ding    │
└──────────┘   └──────────┘   └──────────┘
```

---

## 4. 详细实现规格

### 4.1 P1.1 Skill 引用文件

```typescript
// src/skills/types.ts 扩展
interface SkillFile {
  path: string;           // 文件路径 (相对 SKILL.md)
  description?: string;   // 描述
}

interface SkillDefinition {
  // ... 现有字段
  files?: SkillFile[];    // 新增: 引用的文件
}

// src/skills/files.ts
export async function extractFileContents(
  skill: SkillDefinition,
  skillDir: string
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  if (!skill.files) return contents;

  for (const file of skill.files) {
    const fullPath = join(skillDir, file.path);
    if (existsSync(fullPath)) {
      contents.set(file.path, readFileSync(fullPath, 'utf-8'));
    }
  }
  return contents;
}

export function replaceFileReferences(
  content: string,
  fileContents: Map<string, string>
): string {
  // 替换 {{file "path"}} 引用
  return content.replace(/\{\{file\s+"([^"]+)"\}\}/g, (_, path) => {
    return fileContents.get(path) || `{{file "${path}" not found}}`;
  });
}
```

### 4.2 P1.2 Skill 工具限制

```typescript
// src/skills/types.ts 扩展
interface SkillDefinition {
  // ... 现有字段
  allowedTools?: string[];  // 允许的工具列表 (fork 模式)
}

// src/skills/executor.ts 修改
async function executeSkillFork(
  skill: SkillDefinition,
  args: Record<string, string>,
  options: SkillExecuteOptions
): Promise<string> {
  // 工具过滤
  const availableTools = options.availableTools || [];
  const allowedTools = skill.allowedTools
    ? availableTools.filter(t => skill.allowedTools!.includes(t.name))
    : availableTools;

  // 创建子 Agent 时传入过滤后的工具
  return runSubAgent({
    prompt: skill.content,
    tools: allowedTools,
    model: skill.model,
    // ...
  });
}
```

### 4.3 P1.3 MCP OAuth 集成

```typescript
// src/mcp/client.ts 扩展
interface MCPAuthConfig {
  type: 'oauth' | 'bearer' | 'apikey';
  // OAuth specific
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}

interface MCPServerConfig {
  // ... 现有字段
  auth?: MCPAuthConfig;
  scope?: 'project' | 'user' | 'dynamic';
}

async connect(serverConfig: MCPServerConfig): Promise<void> {
  // 处理 OAuth 认证
  if (serverConfig.auth?.type === 'oauth') {
    const token = await getOAuthToken(serverConfig.auth);
    serverConfig.headers = {
      ...serverConfig.headers,
      'Authorization': `Bearer ${token}`,
    };
  }
  // ... 现有连接逻辑
}
```

---

## 5. 测试策略

### 5.1 单元测试
- [ ] Skill files 解析和替换测试
- [ ] 工具过滤逻辑测试
- [ ] OAuth 流程测试

### 5.2 集成测试
- [ ] Skill 引用文件端到端测试
- [ ] MCP OAuth 认证测试
- [ ] Fork 模式工具限制测试

---

## 6. 风险评估

| 功能 | 风险 | 缓解措施 |
|------|------|----------|
| P1.1 Skill 引用文件 | 路径安全 | 使用 path-safety.ts 检查 |
| P1.3 MCP OAuth | Token 安全 | 使用系统钥匙串存储 |
| P2.1 MCP Serve | IPC 复杂度 | 使用现有 RPC 框架 |

---

## 7. 下一步行动

1. **立即开始**: P1.1 Skill 引用文件 (files.ts 已创建)
2. **其次**: P1.2 Skill 工具限制 (allowedTools)
3. **第三**: P1.3 MCP OAuth 集成

---

## 8. 参考文档

- [MCP OAuth 规范](https://modelcontextprotocol.io/docs)
- [Claude Code 内置插件](https://github.com/sourcegraph/cody/blob/main/claude/cody.md)
- [Skill 执行流程](plan8.5.md#7-skills-系统完善计划)