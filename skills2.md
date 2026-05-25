# Skills 系统统一架构分析文档

> 基于代码全面分析，参考 Claude Code，构建完整架构图

---

## 一、系统全貌

### 1.1 模块结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Skills Module Architecture                           │
└─────────────────────────────────────────────────────────────────────────────┘

src/skills/
├── index.ts                      # 统一导出入口
├── types.ts                     # 类型定义 (Skill, SkillMetadata, SkillCommand)
├── registry.ts                  # 技能发现与注册 (discoverSkills, getSkill)
├── loader.ts                   # SKILL.md 解析 (parseSkillFile, loadSkillFromPath)
├── executor.ts                 # 执行引擎 (getPromptForCommand, executeShellCommands)
├── commands.ts                 # 命令注册 (initializeSkills, getSkillCommand)
├── slash-command.ts            # Slash 命令解析 (parseSlashCommand, SkillCommandRegistry)
├── auto-activate.ts           # 条件激活 (AutoSkillActivator, PatternMatcher)
├── scheduler.ts               # 调度器 (SkillScheduler)
├── dependency.ts             # 依赖管理 (resolveDependencies)
├── recent-usage.ts          # 使用统计 (recordUsage, getRecentScore)
├── skills-menu.ts           # 菜单 UI (SkillsMenu)
├── promptShellExecution.ts   # Shell 命令执行
├── files.ts                # 文件提取
├── context-manager.ts      # 上下文管理
├── cli-commands.ts         # CLI 命令
├── builtin-skills.ts       # 内置技能
├── search.ts               # 搜索
│
├── bundled/                # 内置技能目录
│   ├── dcf/
│   ├── portfolio/
│   └── ...
│
└── [skill-name]/          # 53 个可发现技能
    ├── a-share-analysis/
    ├── a-share-fund/
    └── ...

src/tools/
├── skill.ts                 # Agent 调用的 skillTool
└── registry/
    └── web-search-tools.ts  # 注册 skillTool
```

### 1.2 导出接口

```typescript
// src/skills/index.ts 统一导出

// 核心发现
export { discoverSkills, getSkill, clearSkillCache, buildSkillMetadataSection }

// 执行
export { executeSkill, executeSkillInline, executeSkillFork, getPromptForCommand }

// 命令注册
export { initializeSkills, getSkillCommand, getAllSkillCommands }

// Slash 命令
export { SkillCommandRegistry, parseSlashCommand, isSlashCommand }

// 条件激活
export { AutoSkillActivator, parseConditionalSkill, PatternMatcher }

// 调度
export { SkillScheduler }

// 依赖
export { resolveDependencies }

// 使用统计
export { recordUsage, getRecentScore }
```

---

## 二、触发机制 (双模式)

### 2.1 手动触发 (/command)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Manual Trigger (/command)                            │
└─────────────────────────────────────────────────────────────────────────────┘

  用户输入: /a-share-fund ETF搜索
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  cli.ts → handleSlashCommand()                                           │
│                                                                           │
│  1. 解析: commandName = 'a-share-fund', args = 'ETF搜索'                │
│  2. 调用: executeSkillCommand(commandName, args, context)                │
│  3. 返回: { type: 'query', text: skillInstructions }                    │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  executor.ts → executeSkillCommand()                                      │
│                                                                           │
│  1. initializeSkills() ← 确保已初始化                                     │
│  2. getSkillCommandRegistry().getSkillCommand('a-share-fund')            │
│  3. skillCmd.getPromptForCommand(args, context)                           │
│         │                                                                 │
│         ├─── 1. Load SKILL.md                                            │
│         ├─── 2. Substitute {{args}}, ${VAR}                               │
│         ├─── 3. Execute shell commands (!`curl`, ```! python3```)       │
│         └─── 4. Return processed instructions                            │
│                                                                           │
│  return { type: 'query', text: instructions }                             │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  cli.ts → agentRunner.runQuery(instructions)                             │
│                                                                           │
│  Agent 执行 instructions，调用 Bash/Read 工具                              │
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.2 自动触发 (Agent 调用 skillTool)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Auto Trigger (Agent)                                │
└─────────────────────────────────────────────────────────────────────────────┘

  用户输入: 分析茅台股票
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent 识别需要 A股分析                                                   │
│  Agent 调用 skillTool({ skill: 'a-share-analysis', args: '茅台' })        │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  src/tools/skill.ts → skillTool.func()                                    │
│                                                                           │
│  1. getSkill('a-share-analysis')                                         │
│  2. Resolve markdown links (./xxx.md → absolute path)                     │
│  3. Return instructions                                                   │
│                                                                           │
│  return "## Skill: a-share-analysis\n\n茅台股票分析..."                    │
└───────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Agent 跟随 instructions 执行                                              │
│  Agent 调用 Bash/Read/Write 工具获取数据并分析                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 三、核心组件详解

### 3.1 Registry (技能发现)

```typescript
// src/skills/registry.ts

discoverSkills() → SkillMetadata[]     // 发现所有技能元数据
getSkill(name) → Skill                 // 获取完整技能定义
getBundledSkill(name) → BundledSkill  // 获取内置技能

// Skill 优先级: project > user > builtin
const SKILL_SOURCES = [
  { path: 'src/skills/bundled', source: 'builtin' },   // 最低
  { path: '.claude/skills', source: 'user' },
  { path: '.upup/skills', source: 'project' },         // 最高
];
```

### 3.2 Loader (技能加载)

```typescript
// src/skills/loader.ts

parseSkillFile(skillPath) → { metadata, instructions }
loadSkillFromPath(skillPath) → Skill
extractSkillMetadata(skillPath) → SkillMetadata

// 解析 YAML frontmatter
// --- 
// name: a-share-fund
// description: A股基金数据查询...
// triggers: [...]
// context: inherit
// allowed-tools: [...]
// ---
```

### 3.3 Executor (执行引擎)

```typescript
// src/skills/executor.ts

// 核心: getPromptForCommand
getPromptForCommand(skill, args, context) {
  // 1. 加载 SKILL.md 内容
  let content = skill.instructions;
  
  // 2. 替换变量
  content = substituteArguments(content, args);  // {{args}}, {{name}}
  content = content.replace('${CLAUDE_SKILL_DIR}', skillRoot);
  
  // 3. 执行 shell 命令
  if (containsShellCommands(content)) {
    content = await executeShellCommandsInPrompt(content, context);
  }
  
  // 4. 返回处理后的指令
  return [{ type: 'text', text: content }];
}

// 执行模式判断
shouldUseForkMode(skill) {
  if (skill.context === 'fork') return true;
  if (skill.agent) return true;
  if (skill.allowedTools?.length > 0) return true;
  if (skill.instructions.length > 2000) return true;
  return false;
}
```

### 3.4 Shell 命令执行

```typescript
// src/skills/promptShellExecution.ts

// 支持两种语法:
// 1. 代码块: ```! curl "https://..." ```
// 2. 内联: !`python3 -c "print('hello')"`

executeShellCommandsInPrompt(text) {
  // 1. 提取所有 shell 命令
  // 2. 并行执行
  // 3. 替换命令为输出
  return text.replace(command, output);
}
```

### 3.5 SkillCommandRegistry (命令注册)

```typescript
// src/skills/slash-command.ts

class SkillCommandRegistry {
  commands: Map<string, SkillCommand>      // 按名称
  skillCommands: Map<string, SkillCommand>  // 按触发词
  
  getSkillCommand(name) → SkillCommand
  getAllCommands() → SkillCommand[]
  searchSkillsFuzzy(query) → SkillCommand[]
  registerSkillCommand(cmd) → void
}

// 注册流程
initializeSkills()
  → discoverSkills()
  → for each skill:
      → loadSkillFromPath()
      → createSkillCommand()
      → registry.registerSkillCommand()
```

### 3.6 Auto-Activator (条件激活)

```typescript
// src/skills/auto-activate.ts

class AutoSkillActivator {
  conditionalSkills: Map<string, ConditionalSkill>
  filePatterns: Map<string, PatternMatcher>
  activatedSkills: Set<string>
  
  activateForPaths(cwd, filePaths) → SkillActivationEvent[]
  shouldActivate(skillName, cwd, filePaths) → boolean
}

// PatternMatcher 支持 glob:
// **/*.tsx, src/**/*.ts, [abc]*.js
```

---

## 四、工具集成

### 4.1 skillTool (Agent 调用入口)

```typescript
// src/tools/skill.ts

export const skillTool = new DynamicStructuredTool({
  name: 'skill',
  schema: {
    skill: z.string().describe('技能名称'),
    args: z.string().optional().describe('参数'),
  },
  async func({ skill, args }) {
    const skillDef = getSkill(skill);
    if (!skillDef) return `Skill not found`;
    
    // 解析相对路径
    const resolved = resolveMarkdownLinks(skillDef);
    return resolved;
  },
});
```

### 4.2 工具注册

```typescript
// src/tools/registry/web-search-tools.ts

if (discoverSkills().length > 0) {
  tools.push({ name: 'skill', tool: skillTool });
}
```

---

## 五、系统提示词

```typescript
// src/agent/prompts.ts

function buildSkillsSection() {
  const skills = discoverSkills();
  const list = skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
  
  return `## Available Skills

${list}

## Skill Usage Policy

- Check if available skills can help complete the task more effectively
- When a skill is relevant, invoke it IMMEDIATELY as your first action
- Skills provide specialized workflows for complex tasks
- Use the \`skill\` tool to invoke skills by name`;
}
```

---

## 六、与 Claude Code 对比

| 功能 | Claude Code | UpUp | 状态 |
|------|-------------|------|------|
| 技能发现 | ✅ 动态扫描 | ✅ discoverSkills | ✅ |
| Slash 命令 | ✅ SkillTool | ✅ executeSkillCommand | ✅ |
| Agent 工具 | ✅ skill 工具 | ✅ skillTool | ✅ |
| Shell 执行 | ✅ promptShellExecution | ✅ promptShellExecution | ✅ |
| Fork 执行 | ✅ runAgent | ✅ executeSkillFork | ✅ |
| 条件激活 | ✅ paths/ignore | ✅ AutoSkillActivator | ✅ |
| 依赖管理 | ✅ | ✅ resolveDependencies | ✅ |
| 使用统计 | ✅ | ✅ recent-usage | ✅ |
| whenToUse | ✅ | ❌ | 缺失 |
| 动态加载事件 | ✅ skillsLoaded | ❌ | 缺失 |
| Skill 追踪 | ✅ | ✅ SkillTracker | ✅ |

---

## 七、问题与改进

### 7.1 已实现 (无需改造)

- ✅ 手动触发 (`/a-share-fund`)
- ✅ 自动触发 (`skillTool`)
- ✅ Shell 命令执行
- ✅ Fork/Inline 双模式
- ✅ 条件激活 (paths)
- ✅ 依赖管理
- ✅ 使用统计

### 7.2 待实现 (P1)

| 功能 | 说明 | 实现位置 |
|------|------|----------|
| whenToUse 匹配 | 基于内容自动建议技能 | slash-command.ts |
| 动态加载事件 | skillsLoaded EventEmitter | registry.ts |

### 7.3 whenToUse 匹配实现

```typescript
// src/skills/slash-command.ts

getSkillsByTrigger(content: string): SkillCommand[] {
  const normalized = content.toLowerCase();
  const results: SkillCommand[] = [];
  
  for (const cmd of this.commands.values()) {
    // 1. triggers 匹配
    if (cmd.triggers?.some(t => normalized.includes(t))) {
      results.push({ cmd, score: 3 });
      continue;
    }
    
    // 2. whenToUse 匹配
    if (cmd.whenToUse) {
      const keywords = parseKeywords(cmd.whenToUse);
      if (keywordsMatch(keywords, normalized)) {
        results.push({ cmd, score: 2 });
      }
    }
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}
```

---

## 八、完整架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UpUp Skills Architecture (Complete)                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│                          User Input                                        │
│                                                                           │
│  ┌─────────────────────────┐     ┌──────────────────────────────┐     │
│  │   /a-share-fund ETF     │     │   分析茅台股票                 │     │
│  │   (手动触发)             │     │   (自动触发)                 │     │
│  └───────────┬─────────────┘     └──────────────┬───────────────┘     │
│              │                                        │                  │
└──────────────┼────────────────────────────────────┼────────────────────┘
               │                                        │
               ▼                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       CLI / Agent Layer                                   │
│                                                                           │
│  ┌─────────────────────────────┐     ┌──────────────────────────────┐   │
│  │  cli.ts                   │     │  agent.ts                    │   │
│  │  handleSlashCommand()    │     │  skillTool.func()           │   │
│  └───────────┬───────────────┘     └──────────────┬───────────────┘   │
│              │                                        │                  │
└──────────────┼────────────────────────────────────┼────────────────────┘
               │                                        │
               ▼                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Skills Module (src/skills/)                            │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  commands.ts → initializeSkills()                               │    │
│  │         │                                                       │    │
│  │         ▼                                                       │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │  registry.ts → discoverSkills()                        │   │    │
│  │  │         │                                              │   │    │
│  │  │         ▼                                              │   │    │
│  │  │  loader.ts → loadSkillFromPath()                       │   │    │
│  │  │         │                                              │   │    │
│  │  │         ▼                                              │   │    │
│  │  │  executor.ts → getPromptForCommand()                   │   │    │
│  │  │         │                                              │   │    │
│  │  │         ├─── Load SKILL.md                            │   │    │
│  │  │         ├─── Substitute {{args}}                       │   │    │
│  │  │         ├─── Execute shell (!`curl`, ```! python3```)  │   │    │
│  │  │         └─── Return instructions                        │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    Agent Execution Layer                                   │
│                                                                           │
│  agent.run(instructions)                                                  │
│         │                                                                 │
│         ├─── System Prompt (Available Skills)                             │
│         ├─── skillTool (可选再次调用)                                     │
│         └─── Tools: Bash, Read, Write, Grep                              │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 九、验证结果

```bash
✅ skillTool.name === 'skill'
✅ discoverSkills() 返回 53 个技能
✅ getSkill('a-share-fund') 返回完整内容 (4424 chars)
✅ skillTool.func() 返回 instructions (4477 chars)
✅ executeSkillCommand() 包含 shell 命令
✅ typecheck 通过
```

---

## 十、结论

### 10.1 系统完整度

**Skills 系统已完整实现**，覆盖:
- 手动/自动双触发
- Shell 命令执行
- Fork/Inline 双模式
- 条件激活
- 依赖管理
- 使用统计

### 10.2 与 Claude Code 对齐度

| 对齐项 | Claude Code | UpUp |
|--------|-------------|------|
| 核心架构 | ✅ | ✅ |
| 执行流程 | ✅ | ✅ |
| 触发机制 | ✅ | ✅ |
| Shell 执行 | ✅ | ✅ |

### 10.3 后续优化

| 优先级 | 功能 | 工作量 |
|--------|------|--------|
| P1 | whenToUse 匹配 | 2h |
| P2 | 动态加载事件 | 1h |

---

**文档版本**: v3.0 (统一架构分析)  
**更新日期**: 2026-05-25  
**状态**: 系统完整，已验证

## P1 实现: getSkillsByTrigger (2026-05-25)

### 实现状态
- [x] SkillMetadata 类型更新（添加 whenToUse 字段）
- [x] getSkillsByTrigger 方法
- [x] extractKeywords 辅助函数
- [x] TypeScript 编译通过
- [x] 功能验证通过

### 验证结果
```
Input: 分析茅台股票 基金查询
  -> a-share-analysis (score: 45)
  -> a-share-fund (score: 45)

Input: ETF基金涨跌排名
  -> a-share-fund (score: 90)

Input: /a-share-fund 基金净值
  -> a-share-fund (score: 145)
```

### 代码位置
- `src/skills/slash-command.ts` - SkillCommandRegistry 类

## P2 实现: 动态加载事件 (2026-05-25)

### 实现状态
- [x] EventEmitter 导入 registry.ts
- [x] skillEvents 实例创建
- [x] onSkillEvent 订阅函数
- [x] offSkillEvent 取消订阅函数
- [x] getSkillEventEmitter 获取器函数
- [x] skillsLoaded 事件触发
- [x] skillCacheCleared 事件触发
- [x] TypeScript 编译通过
- [x] 功能验证通过

### 验证结果
```
✅ skillsLoaded event fires after discoverSkills()
✅ skillCacheCleared event fires after clearSkillCache()
✅ onSkillEvent/offSkillEvent work correctly
✅ Events don't fire when using cached results
✅ getSkillEventEmitter returns EventEmitter instance
```

### 代码位置
- `src/skills/registry.ts` - skillEvents EventEmitter
- `src/skills/index.ts` - 导出新函数

### 使用示例
```typescript
import { onSkillEvent, offSkillEvent } from './src/skills/index.ts';

// Subscribe to skill loading
onSkillEvent('skillsLoaded', (skills) => {
  console.log('Skills loaded:', skills.length);
});

// Unsubscribe
offSkillEvent('skillsLoaded', handler);
```

## P3 实现: Skill Suggestions (2026-05-25)

### 实现状态
- [x] suggestSkills 函数 - 基于 getSkillsByTrigger 的智能建议
- [x] formatSkillSuggestions 函数 - 终端格式化显示
- [x] 从 index.ts 导出新函数
- [x] TypeScript 编译通过
- [x] 功能验证通过

### 验证结果
```
Input: ETF基金涨跌排名
🎯 Skill Suggestions:
  1. a-share-fund (score: 90)
  2. fund-holdings (score: 15)
  3. market-monitor (score: 15)

Input: 分析A股市场结构
🎯 Skill Suggestions:
  1. a-share-market-structure (score: 45)
  2. review (score: 15)
```

### 代码位置
- `src/skills/skills-menu.ts` - suggestSkills, formatSkillSuggestions
- `src/skills/index.ts` - 导出新函数

### 使用示例
```typescript
import { suggestSkills, formatSkillSuggestions } from './src/skills/index.ts';

// Get suggestions
const suggestions = suggestSkills('ETF基金涨跌排名', 5);

// Format for display
console.log(formatSkillSuggestions(suggestions));
```
