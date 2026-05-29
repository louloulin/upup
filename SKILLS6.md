# Skills 系统优化改造计划 (SKILLS6.md)

> 基于 loucode 架构分析 + dexter 现状优化

## ✅ Phase 1 已完成

### 修复内容

1. **Agent Skills 注册机制** - 新增 `src/skills/agent-commands.ts`
   - 从 `~/.claude/skills/` 加载 agent skills
   - 正确解析 frontmatter 并创建 SkillCommand
   - 支持变量替换 (`{{args}}`, `${CLAUDE_SKILL_DIR}`)

2. **Skill Executor 统一入口** - 新增 `src/tools/skill-executor.ts`
   - 统一的 slash command 执行接口
   - 正确的上下文传递
   - 支持 fork/inline 双模式

3. **集成到初始化流程** - 修改 `src/skills/commands.ts`
   - 在 `initializeSkills()` 中注册 agent skills
   - 日志输出包含 agent 数量

### 修复结果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 总技能命令 | 114 | **186** |
| Agent skills | 0 | **130** |
| /skill-creator | ❌ | ✅ |
| /using-superpowers | ❌ | ✅ |
| 上下文传递 | ❌ | ✅ |

### 已验证技能

- ✅ /research
- ✅ /hunter
- ✅ /verify
- ✅ /dream
- ✅ /batch
- ✅ /alert
- ✅ /sandbox
- ✅ /portfolio
- ✅ /skill-creator
- ✅ /using-superpowers

---

## 📋 待解决问题

### Phase 2-3 待完成

1. **Skill Creator 缺失**: 没有从成功路径自动创建 skill 的能力
2. **执行流程中断**: 复杂 skill 执行时上下文丢失
3. **工具集成不完整**: 部分 agent skills 可能需要进一步测试
4. **缺少动态发现**: 运行时新增 skill 需要重启

### loucode vs Dexter 差异

| 特性 | loucode | Dexter |
|------|---------|--------|
| Skill 来源 | 运行时自动创建 | 静态 SKILL.md + bundled |
| 触发机制 | 复杂度/错误检测自动触发 | 用户显式调用 `/skill` |
| 创建方式 | `SkillCreator` 自动生成 | 手动编写 |
| 知识提升 | `MemoryPromoter` | 缺失 |
| 使用追踪 | 7天半衰期评分 | 基础记录 |
| 文件监控 | chokidar 动态发现 | 静态加载 |

---

## 🎯 改造目标

### Phase 1: 核心问题修复
- [ ] 修复 `/skill-creator` 执行流程
- [ ] 完善工具注册机制
- [ ] 修复上下文传递问题

### Phase 2: loucode 对齐
- [ ] 实现 `SkillCreator` 自动创建
- [ ] 实现 `TaskAnalyzer` 复杂度检测
- [ ] 实现 `SuccessPath` 提取

### Phase 3: 高级功能
- [ ] 实现 `SkillRefiner` 使用追踪
- [ ] 实现 `MemoryPromoter` 知识提升
- [ ] 实现动态文件监控

---

## 🔧 Phase 1: 核心问题修复

### 1.1 修复 Skill 执行流程

**问题**: skill 执行后上下文丢失

**当前流程**:
```
User Input → Slash Parser → getSkill() → 返回instructions → 上下文丢失
```

**优化流程**:
```typescript
// src/tools/skill-executor.ts

export class SkillExecutor {
  constructor(
    private registry: SkillCommandRegistry,
    private contextBuilder: ContextBuilder,
    private hooksRunner: HooksRunner
  ) {}

  async execute(input: string, context: AgentContext): Promise<ExecutionResult> {
    // 1. 解析 slash command
    const parsed = parseSlashCommand(input);
    if (!parsed) return { handled: false };

    // 2. 获取 skill command
    const command = this.registry.getSkillCommand(parsed.name);
    if (!command) return { handled: false };

    // 3. 记录使用
    await this.recordUsage(command.name);

    // 4. 执行 pre-execute hooks
    const hookResult = await this.hooksRunner.runPreExecute({
      skillName: command.name,
      args: parsed.args,
    });
    if (hookResult.skip) {
      return { handled: true, output: hookResult.output };
    }

    // 5. 获取 prompt
    const prompt = await command.getPromptForCommand(parsed.args || '', {
      cwd: context.cwd,
      getAppState: context.getAppState,
    });

    // 6. 注入上下文 (关键修复)
    const injected = await this.contextBuilder.inject({
      prompt: prompt[0].text,
      skill: command,
      context: context,
    });

    // 7. 返回完整上下文
    return {
      handled: true,
      output: injected.prompt,
      newMessages: injected.messages,
      contextModifier: injected.modifier,
    };
  }
}
```

### 1.2 完善工具注册机制

**问题**: agent skills (如 `/skill-creator`) 未正确注册到命令系统

**修复方案**:

```typescript
// src/skills/agent-commands.ts

export function registerAgentCommands(): void {
  // 从 ~/.claude/skills/ 目录加载 agent skills
  const agentSkillsDir = join(os.homedir(), '.claude', 'skills');

  if (!existsSync(agentSkillsDir)) return;

  const entries = readdirSync(agentSkillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = join(agentSkillsDir, entry.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        // 解析 frontmatter
        const metadata = extractSkillMetadata(skillPath, 'agent');

        // 创建 command
        const command = createAgentSkillCommand(metadata, skillPath);

        // 注册到 registry
        getSkillCommandRegistry().registerSkillCommand(entry.name, command);
        getSkillCommandRegistry().registerSkill(metadata, command);
      }
    }
  }
}

function createAgentSkillCommand(
  metadata: SkillMetadata,
  skillPath: string
): SkillCommand {
  const skillRoot = dirname(skillPath);

  return {
    type: 'prompt',
    name: metadata.name,
    description: metadata.description || '',
    contentLength: 0,
    userInvocable: true,
    source: 'agent',

    async getPromptForCommand(args, context) {
      // 读取 skill 文件
      const content = await readFile(skillPath, 'utf-8');

      // 提取 body (去掉 frontmatter)
      const body = content.replace(/^---[\s\S]*?---\n*/, '');

      // 替换变量
      let final = body
        .replace(/\${CLAUDE_SKILL_DIR}/g, skillRoot)
        .replace(/\${CLAUDE_SESSION_ID}/g, getSessionId())
        .replace(/\{\{args\}\}/g, args);

      return [{ type: 'text', text: final }];
    },
  };
}
```

### 1.3 修复上下文传递

**关键问题**: `getPromptForCommand` 返回后，原有上下文没有正确扩展

**修复方案**:

```typescript
// src/skills/context-injector.ts

export interface ContextInjection {
  prompt: string;
  messages?: Array<{ role: string; content: string }>;
  modifier?: ContextModifier;
}

export class ContextBuilder {
  async inject(options: {
    prompt: string;
    skill: SkillCommand;
    context: AgentContext;
  }): Promise<ContextInjection> {
    const { prompt, skill, context } = options;

    // 1. 构建 system prompt 片段
    const systemFragment = this.buildSystemFragment(skill);

    // 2. 添加 skill 指令
    const enhancedPrompt = `${systemFragment}\n\n## Task\n\n${prompt}`;

    // 3. 构建 context modifier
    const modifier: ContextModifier = {
      systemPrompt: enhancedPrompt,
      // 传递 allowed tools
      allowedTools: skill.allowedTools,
      // 传递 model preference
      model: skill.model,
      // 传递 effort 估算
      effort: skill.effort,
    };

    // 4. 如果是 fork 模式，构建 subagent 配置
    if (skill.context === 'fork') {
      return {
        prompt: enhancedPrompt,
        newMessages: this.buildNewMessages(enhancedPrompt, context),
        contextModifier: modifier,
      };
    }

    return {
      prompt: enhancedPrompt,
      contextModifier: modifier,
    };
  }

  private buildSystemFragment(skill: SkillCommand): string {
    const lines = [`# ${skill.name}`, ''];

    if (skill.description) {
      lines.push(skill.description);
      lines.push('');
    }

    if (skill.argumentHint) {
      lines.push(`**Usage**: /${skill.name} ${skill.argumentHint}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildNewMessages(
    prompt: string,
    context: AgentContext
  ): Array<{ role: string; content: string }> {
    // 构建新的 messages 数组
    // 确保 skill 指令在 system 中，user 输入正确传递
    return [
      ...(context.messages || []),
      { role: 'user', content: prompt },
    ];
  }
}
```

---

## 🔄 Phase 2: loucode 对齐

### 2.1 实现 SkillCreator

```typescript
// src/evolution/skill-creator.ts

export interface SuccessPath {
  taskId: string;
  toolSequence: Array<{
    tool: string;
    input: unknown;
    output?: string;
  }>;
  reasoning: string;
  context: string;
  success: boolean;
}

export class SkillCreator {
  private skillsDir: string;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || this.getDefaultSkillsDir();
  }

  async createFromPath(path: SuccessPath): Promise<string> {
    const name = this.generateSkillName(path);
    const skillDir = join(this.skillsDir, name);

    // 创建目录
    await mkdir(skillDir, { recursive: true });

    // 构建模板
    const template = this.buildTemplate(path, name);

    // 渲染 Markdown
    const content = this.renderMarkdown(template);

    // 写入文件
    const filePath = join(skillDir, 'SKILL.md');
    await writeFile(filePath, content, 'utf-8');

    // 触发重新加载
    clearSkillCache();
    skillEvents.emit('skillCreated', { name, path: filePath });

    return filePath;
  }

  private generateSkillName(path: SuccessPath): string {
    const tools = path.toolSequence.map(t => t.tool.toLowerCase());
    const primary = tools[0] || 'generic';
    const action = this.inferAction(tools);
    return `${primary}-${action}`.replace(/[^a-z0-9-]/g, '-').slice(0, 64);
  }

  private inferAction(tools: string[]): string {
    const toolSet = new Set(tools);
    if (toolSet.has('bash')) return 'execute';
    if (toolSet.has('read') && toolSet.has('edit')) return 'file-ops';
    if (toolSet.has('glob') || toolSet.has('grep')) return 'search';
    if (toolSet.has('browser')) return 'browser';
    return 'task';
  }

  private buildTemplate(path: SuccessPath, name: string): SkillTemplate {
    return {
      name,
      description: `Auto-generated from ${path.toolSequence.length} tool calls`,
      whenToUse: 'When ' + this.inferWhenToUse(path),
      userInvocable: true,
      argumentHint: '<task>',
      tools: Array.from(new Set(path.toolSequence.map(t => t.tool))),
      steps: path.toolSequence.map((t, i) => `${i + 1}. Use ${t.tool}`),
    };
  }

  private renderMarkdown(template: SkillTemplate): string {
    return `---
name: ${template.name}
description: ${template.description}
whenToUse: "${template.whenToUse}"
userInvocable: true
argumentHint: ${template.argumentHint || '<task>'}
allowed-tools:
${(template.tools || []).map(t => `  - ${t}`).join('\n')}
---

# ${template.name}

## 使用场景
${template.whenToUse}

## 执行步骤
${(template.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

---
*Auto-generated on ${new Date().toISOString()}*
`;
  }
}
```

### 2.2 实现 TaskAnalyzer

```typescript
// src/evolution/task-analyzer.ts

export interface TaskMetrics {
  sessionId: string;
  toolCallCount: number;
  toolSequence: Array<{ tool: string; input: unknown; output?: string }>;
  reasoning: string;
  success: boolean;
  duration: number;
}

export interface SkillTrigger {
  type: 'complexity' | 'error_fix' | 'recurring';
  threshold: number;
  metrics: TaskMetrics;
}

export class TaskAnalyzer {
  private readonly COMPLEXITY_THRESHOLD = 5;
  private readonly RECURRENCE_THRESHOLD = 3;

  analyze(metrics: TaskMetrics): SkillTrigger | null {
    // 复杂度触发
    if (metrics.toolCallCount >= this.COMPLEXITY_THRESHOLD && metrics.success) {
      return {
        type: 'complexity',
        threshold: this.COMPLEXITY_THRESHOLD,
        metrics,
      };
    }

    // 错误修复触发
    if (this.isErrorFix(metrics)) {
      return {
        type: 'error_fix',
        threshold: 1,
        metrics,
      };
    }

    return null;
  }

  extractSuccessPath(metrics: TaskMetrics): SuccessPath {
    return {
      taskId: metrics.sessionId,
      toolSequence: metrics.toolSequence,
      reasoning: metrics.reasoning,
      context: this.extractContext(metrics),
      success: metrics.success,
    };
  }

  private isErrorFix(metrics: TaskMetrics): boolean {
    const errorPatterns = [
      /error:/i,
      /failed to/i,
      /cannot/i,
      /unable to/i,
      /exception/i,
    ];

    return metrics.toolSequence.some(t => {
      const output = String(t.output || '');
      return errorPatterns.some(p => p.test(output));
    });
  }
}
```

### 2.3 实现文件监控

```typescript
// src/skills/file-watcher.ts

import chokidar from 'chokidar';

export class SkillFileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  async start(dirs: string[]): Promise<void> {
    this.watcher = chokidar.watch(
      dirs.map(d => join(d, '*/SKILL.md')),
      {
        depth: 2,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 1000,
          pollInterval: 100,
        },
      }
    );

    this.watcher
      .on('add', (path) => this.handleChange('add', path))
      .on('change', (path) => this.handleChange('change', path))
      .on('unlink', (path) => this.handleChange('unlink', path));
  }

  private handleChange(event: string, path: string): void {
    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      // 清除缓存
      clearSkillCache();

      // 触发事件
      skillEvents.emit('skillFileChanged', {
        event,
        path,
        skillName: this.extractSkillName(path),
      });
    }, 500);
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
```

---

## 📈 Phase 3: 高级功能

### 3.1 实现 SkillRefiner

```typescript
// src/evolution/skill-refiner.ts

export interface SkillUsageStats {
  successCount: number;
  failureCount: number;
  lastUsed: number;
  totalTokens: number;
}

export class SkillRefiner {
  private stats: Map<string, SkillUsageStats> = new Map();

  recordUsage(skillName: string, success: boolean): void {
    const existing = this.stats.get(skillName) || {
      successCount: 0,
      failureCount: 0,
      lastUsed: 0,
      totalTokens: 0,
    };

    if (success) {
      existing.successCount++;
    } else {
      existing.failureCount++;
    }
    existing.lastUsed = Date.now();

    this.stats.set(skillName, existing);
  }

  getScore(skillName: string): number {
    const stats = this.stats.get(skillName);
    if (!stats) return 0;

    // 7天半衰期
    const daysSinceUse = (Date.now() - stats.lastUsed) / (1000 * 60 * 60 * 24);
    const recencyFactor = Math.pow(0.5, daysSinceUse / 7);

    const total = stats.successCount + stats.failureCount;
    const successRate = total > 0 ? stats.successCount / total : 0;

    return successRate * Math.max(recencyFactor, 0.1) * total;
  }

  shouldRefine(skillName: string): boolean {
    const stats = this.stats.get(skillName);
    if (!stats) return false;

    const total = stats.successCount + stats.failureCount;
    if (total < 5) return false;

    const failureRate = stats.failureCount / total;
    return failureRate > 0.2; // >20% 失败率
  }
}
```

### 3.2 实现 MemoryPromoter

```typescript
// src/evolution/memory-promoter.ts

export interface LearningTracking {
  category: 'project_rule' | 'agent_config' | 'user_preference';
  recurrenceCount: number;
  taskCount: number;
  firstSeen: number;
  lastSeen: number;
}

export class MemoryPromoter {
  private tracking: Map<string, LearningTracking> = new Map();

  record(pattern: string, category: LearningTracking['category']): void {
    const existing = this.tracking.get(pattern);

    if (existing) {
      existing.recurrenceCount++;
      existing.lastSeen = Date.now();
    } else {
      this.tracking.set(pattern, {
        category,
        recurrenceCount: 1,
        taskCount: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }

    // 检查是否应该提升
    if (this.shouldPromote(pattern)) {
      this.promote(pattern);
    }
  }

  private shouldPromote(pattern: string): boolean {
    const t = this.tracking.get(pattern);
    if (!t) return false;

    const daysSinceFirst = (Date.now() - t.firstSeen) / (1000 * 60 * 60 * 24);

    return (
      t.recurrenceCount >= 3 &&
      t.taskCount >= 2 &&
      daysSinceFirst <= 30
    );
  }

  private promote(pattern: string): void {
    const t = this.tracking.get(pattern);
    if (!t) return;

    const target = this.getPromotionTarget(t.category);

    // 写入到目标文件
    if (target === 'CLAUDE.md') {
      this.addToCLAUDEMD(pattern);
    }
  }

  private getPromotionTarget(
    category: LearningTracking['category']
  ): 'CLAUDE.md' | 'AGENTS.md' | 'settings.json' {
    switch (category) {
      case 'project_rule':
        return 'CLAUDE.md';
      case 'agent_config':
        return 'AGENTS.md';
      case 'user_preference':
        return 'settings.json';
    }
  }
}
```

---

## 📁 文件变更计划

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/evolution/skill-creator.ts` | 自动创建 skill |
| `src/evolution/task-analyzer.ts` | 复杂度检测 |
| `src/evolution/skill-refiner.ts` | 使用追踪 |
| `src/evolution/memory-promoter.ts` | 知识提升 |
| `src/skills/file-watcher.ts` | 动态监控 |
| `src/skills/agent-commands.ts` | agent skills 注册 |
| `src/skills/context-injector.ts` | 上下文注入 |
| `src/tools/skill-executor.ts` | skill 执行器 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/skills/commands.ts` | 注册 agent commands |
| `src/skills/registry.ts` | 添加文件监控 |
| `src/tools/skill.ts` | 完善执行逻辑 |
| `src/tools/skill-tool.ts` | 集成 executor |

---

## 🧪 测试计划

### 单元测试

```typescript
// src/evolution/skill-creator.test.ts
describe('SkillCreator', () => {
  it('should generate skill name from tool sequence');
  it('should create SKILL.md file');
  it('should trigger cache clear');
});

// src/evolution/task-analyzer.test.ts
describe('TaskAnalyzer', () => {
  it('should detect complexity threshold');
  it('should detect error fix patterns');
  it('should extract success path');
});
```

### 集成测试

```bash
# 测试完整的 skill 创建流程
bun run test:skills

# 测试文件监控
bun run test:file-watcher

# 测试上下文注入
bun run test:context-injector
```

---

## 📅 优先级

| 优先级 | 任务 | 预计时间 |
|--------|------|----------|
| P0 | 修复 skill-creator 执行 | 2h |
| P0 | 修复上下文传递 | 2h |
| P1 | 注册 agent commands | 1h |
| P1 | 实现 TaskAnalyzer | 3h |
| P1 | 实现 SkillCreator | 3h |
| P2 | 实现 SkillRefiner | 2h |
| P2 | 实现文件监控 | 2h |
| P3 | 实现 MemoryPromoter | 3h |

---

*文档版本: 1.0*
*创建时间: 2026-05-28*
*参考: loucode ccx daemon/evolution/*
