# UpUp Plan 8.6: 剩余功能实现计划

> 版本: 8.6 | 更新日期: 2026-05-13
> 目标: 全面分析 plan8.5 剩余未实现功能，制定实现计划
> 状态: **P1.1 ✅ P1.2 ✅** | 2178 tests pass

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

#### P1.3 MCP OAuth 认证集成
| 项目 | 说明 |
|------|------|
| **状态** | **部分实现** (oauth.ts 已创建) |
| **影响** | MCP 服务器无法使用 OAuth 认证 |
| **文件** | `src/mcp/oauth.ts`, `src/mcp/client.ts` |
| **实现内容** | OAuth token 获取、刷新、存储 |

**需实现**:
- [ ] 在 `MCPServerConfig` 中添加 `auth` 配置
- [ ] 在 `MCPClientManager.connect()` 中处理 OAuth 流程
- [ ] 实现 token 持久化 (文件/钥匙串)
- [ ] 添加测试用例

#### P1.4 MCP 配置动态 Scope
| 项目 | 说明 |
|------|------|
| **状态** | **部分差距** (仅支持 project) |
| **影响** | 无法区分 user/dynamic scope 配置 |
| **文件** | `src/mcp/types.ts`, `src/mcp/client.ts` |

**需实现**:
- [ ] 扩展 `MCPServerConfig` 支持 `scope: 'project' | 'user' | 'dynamic'`
- [ ] 实现 scope 级别配置管理
- [ ] 支持从不同位置加载配置

### 2.2 中优先级 (P2) - 建议实现

#### P2.1 MCP Server 启动命令
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** |
| **影响** | 无法通过 CLI 启动 MCP 服务器 |
| **文件** | `src/commands/mcp.ts` |
| **参考** | `claude mcp serve` |

**需实现**:
- [ ] 创建 `src/commands/mcp.ts` 包含 serve 子命令
- [ ] 实现 MCP 服务器注册和启动
- [ ] 添加 IPC 通信机制

#### P2.2 Session Transcript 增强
| 项目 | 说明 |
|------|------|
| **状态** | **需增强** (已有 346 行) |
| **影响** | 会话恢复功能不完整 |
| **文件** | `src/agent/session-persistence.ts` |

**需实现**:
- [ ] 添加完整的 Transcript 持久化
- [ ] 实现 `--resume` 恢复功能
- [ ] 添加消息去重和压缩

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

#### P2.4 Skill 变更监听 Hook
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** |
| **影响** | UI 无法感知 Skill 变更 |
| **文件** | `src/hooks/use-skills-change.ts` (React) |

**需实现**:
- [ ] 创建 `useSkillsChange` hook
- [ ] 监听 skills 目录变更
- [ ] 提供 debounced 回调

### 2.3 低优先级 (P3) - 未来实现

#### P3.1 MCP 连接管理 UI
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** (需 React) |
| **影响** | 无可视化 MCP 管理界面 |
| **文件** | React 组件 |
| **优先级** | 需要前端开发 |

#### P3.2 插件 Skill/Hook 集成
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** |
| **影响** | 插件无法提供 Skill/Hook |
| **文件** | `src/plugins/` |

#### P3.3 语义检索 (Embedding)
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** (需外部服务) |
| **影响** | 无法进行向量相似度搜索 |
| **文件** | `src/memory/embeddings.ts` |

#### P3.4 完整任务系统
| 项目 | 说明 |
|------|------|
| **状态** | **缺失** |
| **影响** | 无 Task.ts 功能 |
| **文件** | `src/agent/task.ts` |

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