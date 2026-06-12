## 架构决策

### 决策 1：适配器模式 vs Fork 模式

**选择：适配器模式（Adapter Pattern）**

```
┌──────────────────────────────────────────────────────┐
│                  Loucode UI 层 (不变)                 │
│  main.tsx → FullscreenLayout → Messages → TextInput  │
│                   StatusLine → Stats                 │
├──────────────────────────────────────────────────────┤
│              引擎接口 (Engine Interface)              │
│  runQuery(query, config) → AsyncGenerator<Event>     │
├────────────────────────┬─────────────────────────────┤
│   ClaudeCodeEngine     │      UpUpEngine (新增)      │
│   (QueryEngine.ts)     │   src/upup/UpUpEngine.ts    │
│                        │                             │
│   query.ts             │   ┌─────────────────────┐   │
│   tools.ts             │   │  UpUp Agent (外部)   │   │
│   commands.ts          │   │  agent.ts            │   │
│                        │   │  tools/ (240+)       │   │
│                        │   │  skills/ (50)        │   │
│                        │   │  commands/investment/ │   │
│                        │   └─────────────────────┘   │
└────────────────────────┴─────────────────────────────┘
```

**理由**：
- Loucode 的 UI 层（Ink/React）和基础设施层（认证、MCP、文件系统）完全保留
- 只在引擎接口处插入适配器，改动最小
- 通过 feature flag 切换，零风险
- 两种引擎可以共存，方便对比和回退

**替代方案（Fork 模式）**：将 UpUp 的代码直接复制到 Loucode 中
- ❌ 代码重复，维护困难
- ❌ UpUp 更新时需手动同步
- ❌ 改动范围大，风险高

### 决策 2：引擎接口设计

**选择：统一为 `IQueryEngine` 接口**

```typescript
// src/upup/types.ts
interface IQueryEngine {
  runQuery(params: QueryParams): AsyncGenerator<EngineEvent>;
  abort(): void;
  getHistory(): Message[];
  getUsage(): TokenUsage;
}

interface QueryParams {
  query: string;
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  signal?: AbortSignal;
  attachments?: Attachment[];
}

type EngineEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; tool: string; args: Record<string, unknown>; id: string }
  | { type: 'tool_progress'; id: string; message: string }
  | { type: 'tool_end'; id: string; result: string; duration: number }
  | { type: 'tool_error'; id: string; error: string }
  | { type: 'tool_approval'; id: string; tool: string; args: Record<string, unknown> }
  | { type: 'done'; answer: string; usage: TokenUsage }
  | { type: 'error'; message: string }
```

**理由**：
- 与 Loucode 现有的 `StreamEvent` 类型兼容
- 与 UpUp 的 `AgentEvent` 类型兼容
- 事件驱动，支持流式渲染
- 类型安全，编译期检查

### 决策 3：事件适配器

**选择：双向事件转换**

```
UpUp AgentEvent                    Loucode StreamEvent
─────────────────                  ────────────────────
tool_start ──────► tool_start      (直接映射)
tool_end   ──────► tool_end        (result 格式转换)
thinking   ──────► thinking        (直接映射)
done       ──────► done            (answer 提取)
tool_error ──────► tool_error      (直接映射)
tool_approval ───► tool_approval   (直接映射)
display    ──────► thinking        (thinking 事件提取)
```

**实现**：`src/upup/event-adapter.ts`

```typescript
export function adaptUpUpEvent(event: AgentEvent): EngineEvent | null {
  switch (event.type) {
    case 'tool_start':
      return {
        type: 'tool_start',
        tool: event.tool,
        args: event.args,
        id: event.toolCallId,
      };
    case 'tool_end':
      return {
        type: 'tool_end',
        id: event.toolCallId,
        result: event.result,
        duration: event.duration,
      };
    case 'thinking':
      return { type: 'thinking', content: event.thinking || event.message };
    case 'done':
      return {
        type: 'done',
        answer: event.answer,
        usage: event.tokenUsage,
      };
    // ... 其他事件
    default:
      return null;
  }
}
```

### 决策 4：工具注册桥接

**选择：动态工具发现 + Schema 转换**

UpUp 的工具通过 `src/tools/registry.ts` 注册，Loucode 的工具通过 `src/tools.ts` 的 `getTools()` 注册。两者格式不同：

```
UpUp Tool 格式:                    Loucode Tool 格式:
{                                  {
  name: string,                      name: string,
  description: string,               description: string,
  parameters: JsonSchema,            inputSchema: ToolInputJSONSchema,
  execute: (args) => Promise<T>      execute: (ctx) => Promise<T>
}                                  }
```

**实现**：`src/upup/tool-bridge.ts`

```typescript
export async function bridgeUpUpTools(): Promise<Tool[]> {
  const upupTools = await getUpUpToolRegistry();
  return upupTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: convertJsonSchema(tool.parameters),
    execute: async (ctx) => {
      const result = await tool.execute(ctx.args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  }));
}
```

### 决策 5：技能命令映射

**选择：SKILL.md → Slash Command 自动映射**

UpUp 的 50 个 SKILL.md 技能通过 `src/skills/registry.ts` 管理。在 Loucode 中，将它们注册为 slash 命令：

```
UpUp SKILL.md                      Loucode Slash Command
─────────────────                  ─────────────────────
dcf/SKILL.md     ──────► /dcf      估值分析
stock-screen     ──────► /screen   股票筛选
morning-brief    ──────► /brief    早间简报
portfolio-review ──────► /portfolio 持仓回顾
risk-dashboard   ──────► /risk     风险仪表盘
earnings-preview ──────► /earnings 财报预览
```

**实现**：`src/upup/skill-commands.ts`

```typescript
export async function registerUpUpSkillCommands(): Promise<Command[]> {
  const skills = await getUpUpSkillRegistry();
  return skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    execute: async (args, context) => {
      // 构造投资查询，委托给 UpUp Agent
      const query = buildInvestmentQuery(skill, args);
      return { type: 'query', text: query };
    },
  }));
}
```

### 决策 6：投资工作台布局

**选择：扩展现有 FullscreenLayout，添加投资面板**

```
┌──────────────────────────────────────────────────────┐
│  MarketTicker: 上证 3,200.50 ▲1.2%  深证 ▲0.8% ...  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────┐  ┌────────────────────┐  │
│  │                        │  │  PortfolioSummary   │  │
│  │   Messages (消息区)    │  │  ┌────────────────┐ │  │
│  │                        │  │  │ 持仓1   +5.2%  │ │  │
│  │   [User] 分析茅台      │  │  │ 持仓2   -1.3%  │ │  │
│  │   [Agent] 正在估值...  │  │  │ 持仓3   +0.8%  │ │  │
│  │                        │  │  └────────────────┘ │  │
│  │                        │  │                    │  │
│  └────────────────────────┘  └────────────────────┘  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  TextInput: 输入投资问题...                          │
│  StatusLine: ↑↓ 历史 · / 技能 · Ctrl+C 退出          │
└──────────────────────────────────────────────────────┘
```

**实现**：`src/upup/InvestmentLayout.tsx`

基于 Loucode 的 `FullscreenLayout.tsx` 扩展，添加右侧投资面板。面板内容通过 UpUp 的实时数据接口获取。

### 决策 7：依赖管理

**选择：npm link 开发，workspace 引用生产**

```json
// Loucode package.json
{
  "dependencies": {
    "upup-agent": "link:../../touzhi/upup/packages/agent-core"
  }
}
```

**理由**：
- 开发阶段用 `npm link`，修改 UpUp 后 Loucode 自动获取最新代码
- 生产阶段打包时，将 UpUp 的 agent-core 作为依赖打包
- 不需要修改 UpUp 的构建流程

## 数据流

```
用户输入 "分析贵州茅台估值"
         │
         ▼
  TextInput.tsx (Loucode UI)
         │
         ▼
  main.tsx → handleSubmit()
         │
         ├── UPUP_MODE=1 ──► UpUpEngine.runQuery()
         │                        │
         │                        ├─► Agent.create({ model, tools, skills })
         │                        ├─► agent.run(query)
         │                        │     │
         │                        │     ├─► tool_start: "get_stock_price"
         │                        │     ├─► tool_end: { price: 1680.50 }
         │                        │     ├─► tool_start: "skill" (dcf)
         │                        │     ├─► thinking: "基于DCF模型..."
         │                        │     └─► done: "茅台公允价值约..."
         │                        │
         │                        └─► adaptUpUpEvent() → EngineEvent
         │
         └── 默认 ──► QueryEngine.runQuery() (原有)
         
         ▼
  Messages.tsx 渲染消息
  StatusLine.tsx 更新状态
```

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| UpUp Agent 与 Loucode 消息格式不兼容 | 中 | 事件适配器做严格类型转换，编译期检查 |
| UpUp 工具依赖的环境变量在 Loucode 中缺失 | 中 | 配置桥接层自动读取 `.env` |
| Loucode 的 Ink 版本与 UpUp 依赖冲突 | 低 | UpUp 只用 agent-core，不引入 Ink |
| 性能：UpUp Agent 初始化开销 | 低 | 懒加载，首次查询时才初始化 |
