# mm3.md: Dexter vs Claude Code 深度对比分析与架构图

> 版本: v2.0
> 日期: 2026-05-08
> 目标: 全面对比 Dexter 与 Claude Code 架构差距，Tools 差异，制定完整 TODO

---

## 一、项目规模对比总览

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        CODE SIZE COMPARISON                                   │
├──────────────────────┬───────────────────────┬───────────────────────────────┤
│ Component            │ Claude Code (loucode) │ Dexter                        │
├──────────────────────┼───────────────────────┼───────────────────────────────┤
│ Core Agent           │ 812KB main.tsx        │ 770 lines agent.ts (15KB)     │
│                      │ 46KB QueryEngine.ts   │                               │
│                      │ 68KB query.ts         │                               │
│ Tools                │ 53 tools              │ 49 tools                      │
│                      │ 10,894 lines BashTool │ ✅ BashTool ~2,400L (6 files) │
│                      │ 3,811 lines AgentTool │ ~300 lines agent-tool.ts      │
│                      │ 1,524 lines FileEdit  │ ~200 lines edit-file.ts       │
│ Hooks                │ 89 React hooks        │ 6 hooks                       │
│                      │ 116KB useReplBridge   │                               │
│                      │ 212KB useTypeahead    │                               │
│ Memory               │ 11 files (memdir/)    │ 26+ files (memory/)           │
│                      │ 21KB memdir.ts        │ Has Memvid + BM25 + AI-Sel    │
│ Compaction           │ 3,983 lines (8 files) │ ~600 lines (3 files)          │
│ Commands             │ 115 commands          │ 0 commands                    │
│ Services             │ 40+ service modules   │ Minimal services              │
└──────────────────────┴───────────────────────┴───────────────────────────────┘
```

---

## 二、工具系统完整对比 (Tool-by-Tool)

### 2.1 Claude Code 全部工具清单 (53 Tools)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE TOOLS (53 total)                               │
├────────────────────┬──────────────┬──────────────────────────────────────────┤
│ Tool               │ Lines        │ Description                              │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ CORE EXECUTION     │              │                                          │
│ ├─ BashTool        │ 10,894       │ Shell execution + security + sandbox     │
│                    │              │ ✅ Dexter: ~2,400 lines (6 files)        │
│ ├─ PowerShellTool  │ ~500         │ Windows PowerShell                       │
│ ├─ REPLTool        │ ~200         │ REPL execution                           │
│ └─ TerminalCapture │ ~100         │ Terminal output capture                  │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ FILE OPERATIONS    │              │                                          │
│ ├─ FileReadTool    │ ~300         │ Read files with permissions              │
│ ├─ FileEditTool    │ 1,524        │ Edit files with diff/patch               │
│ ├─ FileWriteTool   │ ~200         │ Write files                              │
│ ├─ GlobTool        │ ~150         │ Glob pattern file search                 │
│ ├─ GrepTool        │ ~200         │ Regex content search                     │
│ ├─ LSPTool         │ ~300         │ Language Server Protocol                 │
│ └─ NotebookEdit    │ ~200         │ Jupyter notebook editing                 │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ AGENT/SUBAGENT     │              │                                          │
│ ├─ AgentTool       │ 3,811        │ Subagent orchestration                   │
│ ├─ SendMessageTool │ ~200         │ Inter-agent messaging                    │
│ ├─ TeamCreateTool  │ ~200         │ Create agent teams                       │
│ └─ TeamDeleteTool  │ ~200         │ Delete agent teams                       │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ TASK MANAGEMENT    │              │                                          │
│ ├─ TaskCreateTool  │ 138          │ Create background task                   │
│ ├─ TaskGetTool     │ 128          │ Get task status                          │
│ ├─ TaskListTool    │ ~100         │ List all tasks                           │
│ ├─ TaskOutputTool  │ ~100         │ Get task output                          │
│ ├─ TaskStopTool    │ ~100         │ Stop task                                │
│ ├─ TaskUpdateTool  │ ~100         │ Update task                              │
│ └─ TodoWriteTool   │ ✅ DONE   │ Todo list management                     │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ SKILLS & WORKFLOW  │              │                                          │
│ ├─ SkillTool       │ 1,351        │ Skill execution with frontmatter         │
│ ├─ DiscoverSkills  │ ~50          │ Discover available skills                │
│ ├─ WorkflowTool    │ ~200         │ Workflow execution                       │
│ └─ ToolSearchTool  │ ~150         │ Search for tools                         │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ WEB & SEARCH       │              │                                          │
│ ├─ WebSearchTool   │ ~200         │ Web search                               │
│ ├─ WebFetchTool    │ ~300         │ Fetch URL content                        │
│ └─ WebBrowserTool  │ ~200         │ Browser automation                       │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ SCHEDULING         │              │                                          │
│ ├─ ScheduleCron    │ 595          │ Cron create/delete/list                  │
│ └─ SleepTool       │ ~100         │ Sleep/delay                              │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ CONTEXT & MEMORY   │              │                                          │
│ ├─ SnipTool        │ ~50          │ Context snipping                         │
│ └─ ConfigTool      │ ~200         │ Configuration management                 │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ MCP                │              │                                          │
│ ├─ MCPTool         │ ~200         │ MCP tool execution                       │
│ ├─ McpAuthTool     │ ~50          │ MCP authentication                       │
│ ├─ ListMcpResource │ ~100         │ List MCP resources                       │
│ └─ ReadMcpResource │ ~100         │ Read MCP resource                        │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ NOTIFICATIONS      │              │                                          │
│ ├─ PushNotifTool   │ ~150         │ Push notifications                       │
│ ├─ SubscribePR     │ ~100         │ Subscribe to PR updates                  │
│ └─ SuggestBgPR     │ ~50          │ Suggest background PR                    │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ PLAN MODE          │              │                                          │
│ ├─ EnterPlanMode   │ ~100         │ Enter planning mode                      │
│ ├─ ExitPlanMode    │ ~100         │ Exit planning mode                       │
│ └─ VerifyPlanExec  │ ~100         │ Verify plan execution                    │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ WORKTREE           │              │                                          │
│ ├─ EnterWorktree   │ ~100         │ Enter worktree                           │
│ └─ ExitWorktree    │ ~100         │ Exit worktree                            │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ USER INTERACTION   │              │                                          │
│ ├─ AskUserQuestion │ ~200         │ Interactive questions                    │
│ ├─ BriefTool       │ ~100         │ Brief mode                               │
│ └─ SendUserFile    │ ~100         │ Send file to user                        │
├────────────────────┼──────────────┼──────────────────────────────────────────┤
│ OTHER              │              │                                          │
│ ├─ MonitorTool     │ ~100         │ System monitoring                        │
│ ├─ ReviewArtifact  │ ~100         │ Review artifacts                         │
│ ├─ RemoteTrigger   │ ~100         │ Remote triggers                          │
│ ├─ OverflowTest    │ ~50          │ Overflow testing                         │
│ ├─ SyntheticOutput │ ~50          │ Synthetic output                         │
│ └─ TungstenTool    │ ~100         │ Tungsten tool                            │
└────────────────────┴──────────────┴──────────────────────────────────────────┘
```

### 2.2 Dexter 当前工具清单 (49 Tools)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    DEXTER TOOLS (49 total)                                    │
├────────────────────┬──────────────────────────────────────────────────────────┤
│ INVESTMENT DATA    │ Status   │ Notes                        │
├────────────────────┼──────────┼──────────────────────────────┤
│ get_financials     │ ✅ Done  │ Financial statements/metrics │
│ get_market_data    │ ✅ Done  │ Prices/news/insider         │
│ read_filings       │ ✅ Done  │ SEC filings                 │
│ stock_screener     │ ✅ Done  │ US stock screening          │
│ get_astock_price   │ ✅ Done  │ A-share/HK prices           │
│ get_astock_finance │ ✅ Done  │ A-share financials          │
│ get_astock_news    │ ✅ Done  │ A-share news                │
│ screen_astocks     │ ✅ Done  │ A-share screening           │
│ get_sector_data    │ ✅ Done  │ Sector/concept boards       │
│ get_technical_data │ ✅ Done  │ MA/MACD/RSI for A-shares    │
│ get_market_struct  │ ✅ Done  │ Dragon-tiger/northbound     │
├────────────────────┼──────────┼──────────────────────────────┤
│ QUANT              │          │                              │
│ calculate_var      │ ✅ Done  │ Value at Risk                │
│ calculate_sharpe   │ ✅ Done  │ Sharpe Ratio                 │
│ calculate_sortino  │ ✅ Done  │ Sortino Ratio                │
│ calculate_max_dd   │ ✅ Done  │ Maximum Drawdown             │
├────────────────────┼──────────┼──────────────────────────────┤
│ PORTFOLIO          │          │                              │
│ add_position       │ ✅ Done  │ Add position                 │
│ update_position    │ ✅ Done  │ Update position              │
│ remove_position    │ ✅ Done  │ Remove position              │
│ get_portfolio      │ ✅ Done  │ Get portfolio + P&L          │
├────────────────────┼──────────┼──────────────────────────────┤
│ RESEARCH           │          │                              │
│ analyze_sentiment  │ ✅ Done  │ Text sentiment               │
│ detect_events      │ ✅ Done  │ Investment events            │
│ extract_entities   │ ✅ Done  │ Tickers/numbers/dates        │
├────────────────────┼──────────┼──────────────────────────────┤
│ WEB & SEARCH       │          │                              │
│ web_search         │ ✅ Done  │ Exa/Perplexity/Tavily        │
│ x_search           │ ✅ Done  │ X/Twitter search             │
│ web_fetch          │ ✅ Done  │ URL content fetch            │
│ browser            │ ✅ Done  │ Playwright (conditional)     │
├────────────────────┼──────────┼──────────────────────────────┤
│ FILESYSTEM         │          │                              │
│ read_file          │ ✅ Done  │ Read local files             │
│ write_file         │ ✅ Done  │ Write files                  │
│ edit_file          │ ✅ Done  │ Edit files (diff replace)    │
│ glob               │ ✅ Done  │ Glob pattern search          │
│ grep               │ ✅ Done  │ Regex content search         │
├────────────────────┼──────────┼──────────────────────────────┤
│ MEMORY             │          │                              │
│ memory_search      │ ✅ Done  │ Search memories              │
│ memory_get         │ ✅ Done  │ Read memory file             │
│ memory_update      │ ✅ Done  │ Add/edit/delete memories     │
├────────────────────┼──────────┼──────────────────────────────┤
│ SCHEDULING         │          │                              │
│ cron               │ ✅ Done  │ Cron management              │
│ heartbeat          │ ✅ Done  │ Periodic checklist           │
├────────────────────┼──────────┼──────────────────────────────┤
│ SKILLS             │          │                              │
│ skill              │ ✅ Done  │ Execute skill                │
│ list_skills        │ ✅ Done  │ List skills                  │
│ search_skills      │ ✅ Done  │ Search skills                │
│ get_skill          │ ✅ Done  │ Get skill details            │
├────────────────────┼──────────┼──────────────────────────────┤
│ AGENT              │          │                              │
│ agent              │ ✅ Done  │ Subagent spawning            │
├────────────────────┼──────────┼──────────────────────────────┤
│ WORKTREE           │          │                              │
│ create_worktree    │ ✅ Done  │ Create git worktree          │
│ remove_worktree    │ ✅ Done  │ Remove git worktree          │
│ list_worktree      │ ✅ Done  │ List git worktrees           │
├────────────────────┼──────────┼──────────────────────────────┤
│ PLAN MODE          │          │                              │
│ enter_plan_mode    │ ✅ Done  │ Enter planning               │
│ exit_plan_mode     │ ✅ Done  │ Exit planning                │
│ add_plan_step      │ ✅ Done  │ Add plan step                │
│ update_plan_step   │ ✅ Done  │ Update plan step             │
│ list_plan_steps    │ ✅ Done  │ List plan steps              │
└────────────────────┴──────────┴──────────────────────────────┘
```

### 2.3 工具差距分析 (Tools Gap)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                DEXTER MISSING TOOLS (vs Claude Code)                         │
├────────────────────┬──────────┬──────────────────────────────────────────────┤
│ Tool               │ Priority │ Reason                                      │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ CRITICAL MISSING                                                            │
│ ├─ BashTool        │ P0 ✅   │ Shell execution - IMPLEMENTED                │
│ │                  │          │ Claude Code: 10,894 lines with security     │
│ │                  │          │ Dexter: ~2,400 lines (6 files, 60 tests)   │
│ ├─ NotebookEdit    │ P2 ✅   │ Jupyter notebook editing - IMPLEMENTED      │
│ │                  │          │ 5 tools, 23 tests passing                   │
│ └─ LSPTool         │ P2 ✅   │ Language Server Protocol - IMPLEMENTED       │
│                    │          │ 5 tools, 23 tests passing                   │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ TASK SYSTEM                                                                 │
│ ├─ TaskCreate      │ ✅ DONE   │ Background task creation                     │
│ ├─ TaskGet         │ ✅ DONE   │ Get task status/output                       │
│ ├─ TaskList        │ ✅ DONE   │ List running tasks                           │
│ ├─ TaskStop        │ ✅ DONE   │ Stop running task                            │
│ └─ TaskUpdate      │ ✅ DONE   │ Update task                                  │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ AGENT SYSTEM                                                               │
│ ├─ SendMessage     │ P1 ✅   │ Inter-agent messaging - IMPLEMENTED           │
│ └─ TeamCreate/Del  │ P3 ✅   │ Team management - IMPLEMENTED                │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ USER INTERACTION                                                            │
│ └─ AskUserQuestion │ P1 ✅   │ Interactive user questions - IMPLEMENTED      │
│                    │          │ 4 question types, 21 tests passing           │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ CONTEXT                                                                     │
│ └─ SnipTool        │ P2 ✅   │ Explicit context snipping - IMPLEMENTED       │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ NOTIFICATIONS                                                               │
│ ├─ PushNotif       │ P2 ✅   │ Push notifications - IMPLEMENTED              │
│ └─ SubscribePR     │ P3 ✅   │ PR subscriptions - IMPLEMENTED (37 tests)    │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ CONFIG                                                                      │
│ └─ ConfigTool      │ P2 ✅   │ Configuration management - IMPLEMENTED        │
├────────────────────┼──────────┼──────────────────────────────────────────────┤
│ OTHER                                                                       │
│ ├─ SleepTool       │ P3 ✅   │ Sleep/delay - IMPLEMENTED                    │
│ ├─ MonitorTool     │ P3 ✅   │ System monitoring - IMPLEMENTED               │
│ └─ ToolSearch      │ P3 ✅   │ Tool search - IMPLEMENTED                    │
└────────────────────┴──────────┴──────────────────────────────────────────────┘
```

---

## 三、核心架构对比

### 3.1 Agent Loop 架构对比

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE AGENT LOOP                                     │
│                                                                              │
│  QueryEngine.ts (46KB)                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  submitMessage(prompt)                                                 │  │
│  │    │                                                                   │  │
│  │    ├─ 1. getSystemPrompt()        ← 系统提示构建                      │  │
│  │    │     ├─ tool descriptions      ← 53 工具描述注入                   │  │
│  │    │     ├─ memory (MEMORY.md)     ← 记忆加载                         │  │
│  │    │     ├─ commands list          ← 115 命令列表                      │  │
│  │    │     └─ agent definitions      ← Agent 配置                       │  │
│  │    │                                                                   │  │
│  │    ├─ 2. query() loop (68KB)       ← 核心循环                         │  │
│  │    │     │                                                             │  │
│  │    │     ├─ compact(messages)       ← 4层压缩                         │  │
│  │    │     │   ├─ snipCompact         ← 移除低价值消息                  │  │
│  │    │     │   ├─ microCompact        ← 轻量裁剪 (19KB)                 │  │
│  │    │     │   ├─ collapse/compact    ← LLM 摘要 (60KB)                 │  │
│  │    │     │   └─ autoCompact         ← 自动触发 (12KB)                 │  │
│  │    │     │                                                             │  │
│  │    │     ├─ callModel(messages)     ← API 调用                        │  │
│  │    │     │   ├─ streaming           ← 流式输出                        │  │
│  │    │     │   ├─ tool_progress       ← 工具进度                        │  │
│  │    │     │   └─ FallbackTriggered   ← 模型降级                        │  │
│  │    │     │                                                             │  │
│  │    │     ├─ StreamingToolExecutor   ← 流式工具执行                    │  │
│  │    │     │   ├─ addTool(block)      ← 增量工具解析                    │  │
│  │    │     │   ├─ executeStreaming    ← 并行执行                        │  │
│  │    │     │   └─ permission check    ← 权限验证                        │  │
│  │    │     │                                                             │  │
│  │    │     ├─ runTools(toolBlocks)    ← 工具执行                        │  │
│  │    │     │   ├─ parallel (reads)    ← 只读并行                        │  │
│  │    │     │   ├─ serial (writes)     ← 写入串行                        │  │
│  │    │     │   └─ approval gates      ← 用户审批                        │  │
│  │    │     │                                                             │  │
│  │    │     └─ stop check              ← 停止条件                        │  │
│  │    │         ├─ end_turn            ← 正常结束                        │  │
│  │    │         ├─ tool_use            ← 继续循环                        │  │
│  │    │         └─ max_tokens          ← 续写                            │  │
│  │    │                                                                   │  │
│  │    ├─ 3. trackPermissions()        ← 权限追踪                         │  │
│  │    │     └─ permissionDenials[]     ← 拒绝记录                        │  │
│  │    │                                                                   │  │
│  │    ├─ 4. accumulateUsage()         ← Usage 累积                       │  │
│  │    │     └─ totalUsage              ← token 统计                      │  │
│  │    │                                                                   │  │
│  │    └─ 5. persistSession()          ← 会话持久化                       │  │
│  │          └─ sessionStorage          ← 会话存储                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘

                                    ↕ 对比

┌──────────────────────────────────────────────────────────────────────────────┐
│                    DEXTER AGENT LOOP                                          │
│                                                                              │
│  agent.ts (15KB / 770 lines)                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Agent.run(query): AsyncGenerator<AgentEvent>                          │  │
│  │    │                                                                   │  │
│  │    ├─ 1. microcompact(messages)   ← 轻量裁剪                          │  │
│  │    │     ├─ COUNT_TRIGGER = 8                                         │  │
│  │    │     ├─ COUNT_KEEP = 4                                            │  │
│  │    │     └─ TOKEN_TRIGGER = 80K                                       │  │
│  │    │                                                                   │  │
│  │    ├─ 2. snipMessages(messages)   ← 低价值消息移除                    │  │
│  │    │     ├─ LOW_VALUE_PATTERNS                                        │  │
│  │    │     └─ MEANINGFUL_KEYWORDS                                       │  │
│  │    │                                                                   │  │
│  │    ├─ 3. callModelWithStreaming() ← LLM 流式调用                      │  │
│  │    │     └─ llm.stream(messages)                                      │  │
│  │    │                                                                   │  │
│  │    ├─ 4. toolExecutor.executeAll() ← 工具执行                         │  │
│  │    │     ├─ partitionToolCalls()   ← 分区 (并发/串行)                │  │
│  │    │     ├─ read-only → parallel                                      │  │
│  │    │     ├─ write → serial + approval                                 │  │
│  │    │     └─ TOOLS_REQUIRING_APPROVAL                                  │  │
│  │    │                                                                   │  │
│  │    ├─ 5. manageContextThreshold()  ← 上下文溢出管理                   │  │
│  │    │     ├─ needsCompaction()                                          │  │
│  │    │     └─ compactContext()        ← LLM 压缩                       │  │
│  │    │                                                                   │  │
│  │    └─ 6. memoryExtraction()        ← 记忆提取 (PostToolUse)          │  │
│  │          └─ observationBuffer.shouldExtract()                          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  已实现:                                                                     │
│  ✅ SessionPersistence 会话持久化 (session-persistence.ts)                   │
│  ✅ StreamingToolExecutor 增量解析 (streaming-tool-executor.ts, 18 tests)    │
│  ✅ permissionDenials 追踪 (scratchpad.ts)                                   │
│  ✅ totalUsage 累积 (token-counter.ts)                                        │
│  ✅ Permission persistence (permission-mode.ts, 8 tests)                     │
│  ⏳ FallbackTriggered 模型降级 → ✅ 已集成到 agent loop (fallback-integration.test.ts, 29 tests) │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 压缩系统对比

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    COMPACTION SYSTEMS                                         │
│                                                                              │
│  Claude Code (3,983 lines, 8 files):                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │   SNIP   │→│  MICRO   │→│ COLLAPSE │→│  AUTO    │                        │
│  │  221B    │ │  530L    │ │ 1,705L   │ │  351L    │                        │
│  │          │ │          │ │          │ │          │                        │
│  │ 移除低   │ │ 轻量裁剪 │ │ LLM摘要  │ │ 自动触发│                        │
│  │ 价值消息 │ │ per-turn │ │ 完整摘要 │ │ 阈值触发│                        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                        │
│       ↓             ↓             ↓             ↓                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │  PROMPT  │ │ API-MICRO│ │  SESSION │ │ POST-    │                        │
│  │  374L    │ │  153L    │ │  630L    │ │ CLEANUP  │                        │
│  │ 压缩提示 │ │ API压缩  │ │ 会话压缩 │ │  77L     │                        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                        │
│                                                                              │
│  Dexter (~2,100 lines, 10 files):                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   SNIP   │→│  MICRO   │→│  COMPACT │→│ AUTO     │→│ API-MC   │           │
│  │  ~200L   │ │  114L    │ │  450L    │ │  351L    │ │  153L    │           │
│  │ ✅ 有    │ │ ✅ 有    │ │ ✅ 有    │ │ ✅ 有    │ │ ✅ 有    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                                   │
│  │ SESSION  │→│ POST-CLN │                                                   │
│  │  630L    │ │  77L     │                                                   │
│  │ ✅ 有    │ │ ✅ 有    │                                                   │
│  └──────────┘ └──────────┘                                                   │
│                                                                              │
│  差距:                                                                       │
│  ✅ autoCompact 自动触发层 (auto-trigger.ts)                                 │
│  ✅ apiMicrocompact API 级别压缩 (api-microcompact.ts)                       │
│  ✅ sessionMemoryCompact 会话级压缩 (session-compact.ts)                     │
│  ✅ postCompactCleanup 清理 (post-cleanup.ts)                                │
│  ⏳ grouping 消息分组 → ✅ (message-grouping.ts, 18 tests)                    │
│  ⏳ timeBasedMCConfig 时间配置 → ✅ (time-mc-config.ts, 21 tests)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Memory 系统对比

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MEMORY SYSTEM                                              │
│                                                                              │
│  Claude Code (memdir/, 11 files, ~80KB):                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  memdir.ts (21KB)  - MEMORY.md 构建和解析                          │     │
│  │  memoryTypes.ts (22KB) - 类型定义 (4-type)                         │     │
│  │  paths.ts (10KB)   - 记忆路径管理                                  │     │
│  │  findRelevantMemories.ts (5KB) - 相关记忆查找                      │     │
│  │  teamMemPaths.ts (11KB) - 团队记忆路径                             │     │
│  │  teamMemPrompts.ts (6KB) - 团队记忆提示                            │     │
│  │  memoryScan.ts (3KB) - 记忆扫描                                    │     │
│  │  memoryAge.ts (2KB)  - 记忆时效                                    │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│  特点: 文件系统存储, MEMORY.md 索引, 4-type 分类                             │
│                                                                              │
│  Dexter (memory/, 26+ files, 超越 Claude Code):                             │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  types.ts          - 4-type 分类 (user/project/feedback/reference) │     │
│  │  store.ts          - 存储引擎                                      │     │
│  │  database.ts       - SQLite 数据库                                 │     │
│  │  search.ts         - 搜索引擎                                      │     │
│  │  embeddings.ts     - 向量嵌入                                      │     │
│  │  mmr.ts            - MMR 多样性排序                                │     │
│  │  ai-selector.ts    - AI 选择器                                     │     │
│  │  memvid-store.ts   - Memvid 视频存储 🟢                            │     │
│  │  memvid-rag.ts     - BM25 + RAG 🟢                                │     │
│  │  indexer.ts        - 索引管理                                      │     │
│  │  chunker.ts        - 文本分块                                      │     │
│  │  scanner.ts        - 记忆扫描                                      │     │
│  │  extraction.ts     - 记忆提取 (PostToolUse)                        │     │
│  │  consolidation.ts  - 周期合并 (24h/5 sessions)                     │     │
│  │  save-gates.ts     - 保存门控 (排除/条件)                          │     │
│  │  observation-buffer.ts - 观察缓冲                                  │     │
│  │  flush.ts          - 记忆刷写                                      │     │
│  │  prompts.ts        - 提示模板                                      │     │
│  │  session-files.ts  - 会话文件                                      │     │
│  │  temporal-decay.ts - 时间衰减                                      │     │
│  │  migration.ts      - 迁移管理                                      │     │
│  │  memory-deny.ts    - 拒绝规则                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│  特点: 🟢 超越 Claude Code — Memvid + BM25 + Embeddings + AI-Selector       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Memory 保存时机分析

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    MEMORY SAVE TRIGGERS                                       │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐       │
│  │                    保存决策流程                                     │       │
│  │                                                                    │       │
│  │  Tool 执行完成                                                     │       │
│  │      │                                                             │       │
│  │      ▼                                                             │       │
│  │  observationBuffer.record()  ← 记录观察                           │       │
│  │      │                                                             │       │
│  │      ▼                                                             │       │
│  │  shouldExtract(min=5)?  ← 至少5次观察                             │       │
│  │      │                                                             │       │
│  │      ├─ No → Continue                                              │       │
│  │      │                                                             │       │
│  │      └─ Yes ──▶ extraction.ts                                      │       │
│  │                    │                                               │       │
│  │                    ├─ turnsSinceLastExtraction < 5? → Skip         │       │
│  │                    ├─ hasToolCalls(messages)? → Skip               │       │
│  │                    ├─ MAX_EXTRACTIONS_PER_HOUR (4) exceeded?→Skip  │       │
│  │                    │                                               │       │
│  │                    └─ extractMemories()                            │       │
│  │                          │                                         │       │
│  │                          ├─ LLM 分析消息                           │       │
│  │                          ├─ 最多 3 条记忆/extraction               │       │
│  │                          │                                         │       │
│  │                          ▼                                         │       │
│  │                    save-gates.ts                                   │       │
│  │                          │                                         │       │
│  │                          ├─ shouldExclude()? → Skip                │       │
│  │                          │   (排除代码/Git/调试等)                │       │
│  │                          │                                         │       │
│  │                          ├─ checkSaveGate()                        │       │
│  │                          │   ├─ 'skip' → 不保存                   │       │
│  │                          │   ├─ 'auto_save' → 自动保存            │       │
│  │                          │   └─ 'prompt' → 提示用户               │       │
│  │                          │                                         │       │
│  │                          └─ memory_update tool → 写入文件          │       │
│  │                                                                    │       │
│  │  周期性任务:                                                        │       │
│  │  ┌────────────────────────────────────────────────┐                │       │
│  │  │ consolidation.ts                                │                │       │
│  │  │   ├─ sessionCount >= 5 → consolidate            │                │       │
│  │  │   ├─ hoursSince >= 24 → consolidate             │                │       │
│  │  │   └─ file lock 防止并发合并                     │                │       │
│  │  └────────────────────────────────────────────────┘                │       │
│  └───────────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Hooks 系统对比

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    HOOKS SYSTEM                                               │
│                                                                              │
│  Claude Code (89 hooks):                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  CORE (20+ hooks):                                                 │     │
│  │  ├─ useReplBridge.tsx      116KB  ← REPL 核心桥接                  │     │
│  │  ├─ useTypeahead.tsx       212KB  ← 自动补全                      │     │
│  │  ├─ useCanUseTool.tsx       40KB  ← 工具权限判断                  │     │
│  │  ├─ useGlobalKeybindings    31KB  ← 全局快捷键                    │     │
│  │  ├─ useVoice.ts             45KB  ← 语音输入                      │     │
│  │  ├─ useVoiceIntegration     99KB  ← 语音集成                      │     │
│  │  ├─ useVirtualScroll        35KB  ← 虚拟滚动                     │     │
│  │  └─ useTextInput            17KB  ← 文本输入                      │     │
│  │                                                                    │     │
│  │  INTEGRATION (15+ hooks):                                          │     │
│  │  ├─ useIDEIntegration       10KB  ← IDE 集成                      │     │
│  │  ├─ useRemoteSession        23KB  ← 远程会话                      │     │
│  │  ├─ useInboxPoller          34KB  ← 收件箱轮询                    │     │
│  │  └─ useScheduledTasks        7KB  ← 定时任务                      │     │
│  │                                                                    │     │
│  │  SUGGESTIONS (10+ hooks):                                          │     │
│  │  ├─ fileSuggestions         27KB  ← 文件建议                      │     │
│  │  ├─ unifiedSuggestions        6KB  ← 统一建议                     │     │
│  │  └─ useSearchInput           10KB  ← 搜索输入                     │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Dexter (14 hooks):                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  Original (6 hooks):                                               │     │
│  │  ├─ permission-hooks.ts   ← 权限钩子                              │     │
│  │  ├─ rate-limiter.ts       ← 速率限制                              │     │
│  │  ├─ elicitation.ts        ← 引导钩子                              │     │
│  │  ├─ tool-hooks.ts         ← 工具钩子                              │     │
│  │  └─ index.ts              ← 导出                                  │     │
│  │  Agent Hooks (8 new, 64 tests):                                    │     │
│  │  ├─ useMemoryUsage        ← 内存监控                              │     │
│  │  ├─ useMergedClients      ← MCP 客户端合并                        │     │
│  │  ├─ useCommandQueue       ← 命令队列                              │     │
│  │  ├─ useDynamicConfig      ← 动态配置                              │     │
│  │  ├─ useSessionBackgrounding ← 会话后台管理                        │     │
│  │  ├─ useToolMetrics        ← 工具执行指标追踪                      │     │
│  │  ├─ useSessionRecovery    ← 会话恢复与自动保存                    │     │
│  │  └─ useContextWatchdog    ← 上下文窗口监控                        │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  差距: 89 hooks → 14 hooks (84% 差距) ✅ 8 new agent hooks (64 tests)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 四、完整系统架构图

### 4.1 Dexter 端到端架构

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DEXTER E2E ARCHITECTURE                               │
│                                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   CLI     │───▶│  Agent Core  │───▶│  Tool System │───▶│  External    │   │
│  │  cli.ts   │    │  agent.ts    │    │  registry.ts │    │  APIs        │   │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘   │
│       │               │       │             │                    │           │
│       │               │       │             │                    │           │
│       ▼               ▼       ▼             ▼                    ▼           │
│  ┌──────────┐   ┌─────────┐ ┌────────┐ ┌────────────┐   ┌─────────────┐    │
│  │  Theme   │   │Compact  │ │Memory  │ │ Investment │   │ AStock API  │    │
│  │  theme.ts│   │3 layers │ │26 files│ │   Tools    │   │ Finance API │    │
│  └──────────┘   └─────────┘ └────────┘ └────────────┘   │ Web Search  │    │
│                                                             │ MCP Servers │    │
│  ┌──────────┐   ┌─────────┐ ┌────────┐ ┌────────────┐   └─────────────┘    │
│  │  Hooks   │   │ Plan    │ │SubAgent│ │  Skills    │                       │
│  │  6 hooks │   │ 5 tools │ │Runner  │ │ 4+ skills  │                       │
│  └──────────┘   └─────────┘ └────────┘ └────────────┘                       │
│                                                                              │
│  ┌──────────┐   ┌─────────┐ ┌────────┐ ┌────────────┐                       │
│  │  Cron    │   │Worktree │ │Browser │ │  Fetch     │                       │
│  │  Tool    │   │ 3 tools │ │Playwrt │ │  Tool      │                       │
│  └──────────┘   └─────────┘ └────────┘ └────────────┘                       │
│                                                                              │
│  Data Flow:                                                                  │
│  User Query → Agent Loop → LLM → Tool Call → Tool Exec → Response          │
│                     │                           │                             │
│                     ├─ Microcompact ←───────────┘                             │
│                     ├─ Memory Extract (PostToolUse)                           │
│                     └─ Context Compact (on overflow)                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 工具执行流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    TOOL EXECUTION FLOW                                        │
│                                                                              │
│  LLM Response (tool_calls)                                                   │
│      │                                                                       │
│      ▼                                                                       │
│  toolExecutor.executeAll()                                                   │
│      │                                                                       │
│      ├─ partitionToolCalls()                                                 │
│      │     │                                                                 │
│      │     ├─ Read-only tools → concurrent batch                             │
│      │     │   (get_financials, get_market_data, web_search, etc.)           │
│      │     │                                                                 │
│      │     └─ Write tools → serial + approval                                │
│      │         (write_file, edit_file, memory_update, agent)                 │
│      │                                                                 │
│      ▼                                                                       │
│  ┌──────────────────────┐   ┌──────────────────────┐                         │
│  │  CONCURRENT BATCH    │   │  SERIAL EXECUTION     │                        │
│  │                      │   │                        │                        │
│  │  Promise.allSettled()│   │  for each tool:        │                        │
│  │  ├─ Tool 1 ─────┐   │   │    ├─ approval?        │                        │
│  │  ├─ Tool 2 ─────┤   │   │    │   └─ ask user     │                        │
│  │  ├─ Tool 3 ─────┤   │   │    ├─ execute          │                        │
│  │  └─ ...         ▼   │   │    └─ yield result      │                        │
│  │       results[]     │   │                        │                        │
│  └──────────────────────┘   └──────────────────────┘                         │
│      │                            │                                          │
│      └──────────┬─────────────────┘                                          │
│                 ▼                                                             │
│  observationBuffer.record()  ← 记录工具执行观察                             │
│      │                                                                       │
│      ▼                                                                       │
│  shouldExtract()? → memory extraction (PostToolUse)                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 五、关键差距量化

### 5.1 代码量差距

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CODE SIZE GAP                                              │
│                                                                              │
│  Module              Claude Code       Dexter        Gap                     │
│  ─────────────────────────────────────────────────────────────               │
│  Core Agent          812KB + 46KB      15KB + streaming   85% gap            │
│  BashTool            10,894 lines      ~2,400 lines ✅ (60 tests pass)       │
│  AgentTool           3,811 lines       ~1,300 lines ✅ (61 tests pass)       │
│  FileEdit            1,524 lines       ~200 lines   87% gap                  │
│  Compaction          3,983 lines       ~2,100 lines ✅ (41 tests pass)       │
│  Hooks               89 hooks          14 hooks     84% gap (was 88%)        │
│  Commands            115 commands       13 commands  89% gap (was 94%)       │
│  Memory              11 files          26+ files    🟢 Dexter 超越           │
│  Total Tools         53 tools          54+ tools    🟢 Dexter 超越           │
│  ─────────────────────────────────────────────────────────────               │
│  OVERALL             ~150KB+            ~60KB        60% gap (from 80%)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 功能完整度评分

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FEATURE COMPLETENESS SCORE                                 │
│                                                                              │
│  Category                 Score    Details                                   │
│  ────────────────────────────────────────────────────────────                │
│  Agent Loop               90%      ✅ StreamingToolExecutor ✅ TokenCounter ✅ PermissionDenials ✅ FallbackTriggered (29 tests) │
│  Tool System              95%      ✅ BashTool ✅ TodoWrite ✅ TaskSystem ✅ AskUser ✅ LSP ✅ Notebook ✅ Notify ✅ SubscribePR (37 tests) │
│  Compaction               90%      ✅ 4-layer pipeline ✅ AutoTrigger ✅ ApiMicrocompact ✅ SessionCompact ✅ PostCleanup ✅ MessageGrouping ✅ TimeMCConfig ✅ 100 tests │
│  Memory System            95%      🟢 超越 Claude Code (Memvid+BM25+AI)     │
│  Hooks System             50%      ✅ 8 hooks: useMemoryUsage ✅ useMergedClients ✅ useCommandQueue ✅ useDynamicConfig ✅ useSessionBackgrounding ✅ useToolMetrics ✅ useSessionRecovery ✅ useContextWatchdog (64 tests) │
│  Skills System            85%      ✅ SkillTool (skill_list/skill_execute/skill_info) + registry + loader (29 tests) │
│  Commands                 65%      ✅ 13 built-in commands + pluggable registry (58 tests) │
│  Permissions              60%      ✅ 完整权限规则 + 命令分类 + 持久化 (8 tests) │
│  MCP Integration          80%      MCP 客户端 + 工具注册完成                │
│  ── 投资功能 (Dexter 核心差异化) ──────────────────────────────────────────    │
│  数据获取 A-Stock         90%      🟢 生产级: Tushare API + 腾讯/新浪/东财实时行情 │
│  数据获取 US Finance      85%      🟢 生产级: Financial Datasets API + LLM路由 │
│  估值引擎 (PE/DCF/Peer)   85%      🟢 数学正确，但依赖 LLM 传入数据         │
│  量化计算 (VaR/Sharpe)    85%      🟢 数学正确，但依赖 LLM 传入收益数组     │
│  投资研究管道              70%      ✅ 升级: 深度情感分析 + 否定检测 + 事件提取 + 实体抽取 (46 tests) │
│  组合管理                  65%      ✅ 升级: 文件持久化 + 现金管理 + 交易历史 (15 tests) │
│  决策看板                  55%      🟡 原型: 规则评分，阈值固定，非投资级别   │
│  ────────────────────────────────────────────────────────────                │
│  OVERALL (通用能力)        80%                                                │
│  OVERALL (投资能力)        75%      数据层强，计算层正确，研究/看板待提升     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 六、文件索引

```
Dexter 核心文件:
├── src/agent/agent.ts          (770L)  - Agent 主循环
├── src/agent/compact.ts        (450L)  - LLM summarization压缩
├── src/agent/compaction/   - Enhanced Compaction (~1,500L, ✅)
│   ├── index.ts            - 导出
│   ├── auto-trigger.ts     - 自动触发层
│   ├── api-microcompact.ts - API级压缩
│   ├── session-compact.ts  - 会话级压缩
│   ├── post-cleanup.ts    - 清理层
│   ├── orchestrator.ts     - 4层编排器
│   └── compaction.test.ts  - 41 tests
├── src/agent/microcompact.ts   (114L)  - 微压缩
├── src/agent/snip.ts           (200L)  - 低价值消息移除
├── src/agent/tool-executor.ts  (212L)  - 工具执行器
├── src/agent/context.ts        - 上下文管理
├── src/agent/fallback.ts       - 模型降级
├── src/agent/registry.ts       - 工具注册
├── src/tools/bash/             - BashTool (~2,400L, 6 files, ✅)
│   ├── bash-tool.ts            (451L)  - 核心执行引擎
│   ├── security.ts             (512L)  - 安全验证
│   ├── path-validation.ts      (475L)  - 路径验证
│   ├── command-classifier.ts   (583L)  - 命令分类
│   ├── permission-mode.ts      (469L)  - 权限模式
│   └── bash-tool.test.ts       (403L)  - 60 tests
├── src/tools/todo/              - TodoWrite Tool (~450L, ✅)
│   ├── todo-tool.ts            - 核心工具实现
│   └── todo-tool.test.ts       - 9 tests
├── src/tools/task/              - Task System (~650L, ✅)
│   ├── task-tool.ts            - 核心工具实现
│   └── task-tool.test.ts       - 14 tests
├── src/tools/ask/              - AskUserQuestion (~400L, ✅)
│   ├── ask-tool.ts            - 核心工具实现
│   └── ask-tool.test.ts       - 21 tests
├── src/agent/session-persistence.ts - 会话持久化 ✅
├── src/agent/scratchpad.test.ts      - Scratchpad 测试 (9 tests)
├── src/agent/tombstone.ts      - 墓碑机制
├── src/agent/loop-recovery.ts  - 循环检测
├── src/tools/registry.ts       - 工具注册表 (50+ tools)
├── src/memory/store.ts         - 记忆存储
├── src/memory/database.ts      - SQLite 数据库
├── src/memory/extraction.ts    - 记忆提取
├── src/memory/consolidation.ts - 记忆合并
├── src/memory/save-gates.ts    - 保存门控
├── src/memory/memvid-store.ts  - Memvid 存储
├── src/memory/memvid-rag.ts    - BM25 + RAG
├── src/hooks/                  - 6 hooks
├── src/skills/                 - 4+ skills
└── src/mcp/                    - MCP 客户端

Claude Code 核心文件:
├── src/main.tsx                (812KB) - 主入口
├── src/QueryEngine.ts          (46KB)  - 查询引擎
├── src/query.ts                (68KB)  - 查询循环
├── src/Tool.ts                 (29KB)  - 工具框架
├── src/commands.ts             (25KB)  - 命令系统
├── src/tools/BashTool/         (10,894L) - Bash 工具
├── src/tools/AgentTool/        (3,811L) - Agent 工具
├── src/services/compact/       (3,983L) - 压缩服务
├── src/memdir/                 (11 files) - 记忆系统
├── src/hooks/                  (89 hooks) - React Hooks
└── src/commands/               (115 cmds) - 命令
```

---

## 七、实施优先级 TODO List

### P0 - 必须实现 (核心能力缺失)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  P0: CRITICAL - 核心能力缺失                                                  │
├──────┬────────────────────────────────────────────┬──────────┬───────────────┤
│  ID  │ Task                                       │ Est Lines│ Dependency    │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P0-1 │ BashTool - Shell 执行工具 ✅ DONE          │ ~2,400   │ sandbox, sec  │
│      │ ├─ ✅ 基础 shell 命令执行                   │          │               │
│      │ ├─ ✅ 安全检查 (禁止危险命令)               │          │               │
│      │ ├─ ✅ 沙盒模式 (timeout, maxBuffer)         │          │               │
│      │ ├─ ✅ 路径验证 (traversal, sensitive)       │          │               │
│      │ ├─ ✅ 读写分类 (read/write/unknown)         │          │               │
│      │ ├─ ✅ 权限模式 (bypass/allow/ask/deny)      │          │               │
│      │ └─ ✅ 60 tests passing                     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P0-2 │ AgentLoop 增强 ✅ 2026-05-08                │ ~500    │ P0-1          │
│      │ ├─ ✅ permissionDenials 权限拒绝追踪       │          │               │
│      │ ├─ ✅ SessionPersistence 会话持久化        │          │               │
│      │ ├─ ✅ Scratchpad 增强 (denial tracking)   │          │               │
│      │ ├─ ✅ StreamingToolExecutor 流式工具执行   │          │               │
│      │ └─ ✅ totalUsage token 统计累积 (TokenCounter) │     │               │
└──────┴────────────────────────────────────────────┴──────────┴───────────────┘
```

### P1 - 重要 (影响用户体验)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  P1: IMPORTANT - 影响用户体验                                                │
├──────┬────────────────────────────────────────────┬──────────┬───────────────┤
│  ID  │ Task                                       │ Est Lines│ Dependency    │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-1 │ TodoWrite Tool ✅ DONE                   │ 450     │ None          │
│      │ ├─ ✅ create_todo                         │          │               │
│      │ ├─ ✅ update_todo                         │          │               │
│      │ ├─ ✅ list_todos                          │          │               │
│      │ ├─ ✅ delete_todo                          │          │               │
│      │ ├─ ✅ 状态追踪 (pending/in_progress/done) │          │               │
│      │ └─ ✅ 9 tests passing                     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-2 │ Task System (6 tools) ✅ DONE              │ 650     │ P0-1          │
│      │ ├─ ✅ task_create                             │          │               │
│      │ ├─ ✅ task_get                               │          │               │
│      │ ├─ ✅ task_list                              │          │               │
│      │ ├─ ✅ task_stop                              │          │               │
│      │ ├─ ✅ task_update                             │          │               │
│      │ └─ ✅ 14 tests passing                        │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-3 │ AskUserQuestion Tool ✅ DONE              │ 300      │ None          │
│      │ ├─ ✅ ask_confirm (yes/no)                │          │               │
│      │ ├─ ✅ ask_select (single choice)          │          │               │
│      │ ├─ ✅ ask_multi_select (multiple choice)   │          │               │
│      │ ├─ ✅ ask_input (free text)               │          │               │
│      │ ├─ ✅ ask_response (submit answer)         │          │               │
│      │ ├─ ✅ AskManager singleton                 │          │               │
│      │ └─ ✅ 21 tests passing                     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-4 │ Compaction 增强 (4层) ✅ DONE           │ 600      │ None          │
│      │ ├─ ✅ AutoTrigger (token/message/turn thresholds)│           │               │
│      │ ├─ ✅ ApiMicrocompact (whitespace/code/md/rounding)│        │               │
│      │ ├─ ✅ SessionMemoryCompact (merge/dedup/max entries)│        │               │
│      │ ├─ ✅ PostCleanup (duplicates/orphans/markers)│           │               │
│      │ ├─ ✅ CompactionOrchestrator (4-layer pipeline)│           │               │
│      │ └─ ✅ 41 tests passing                     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-5 │ AgentTool 增强 ✅ DONE                   │ 1,000    │ P0-2          │
│      │ ├─ ✅ EnhancedSubagentRunner (fork/pause/resume/memory)│       │               │
│      │ ├─ ✅ AgentMemoryStore (create/get/update/delete/context)│     │               │
│      │ ├─ ✅ BUILT_IN_AGENTS (6 types: code-reviewer/researcher/tester/architect/debugger/refactorer)│        │               │
│      │ ├─ ✅ AgentDirectoryLoader (loadFromDirectory/listBuiltIn)│      │               │
│      │ ├─ ✅ 5 tools: fork_subagent/resume_agent/agent_memory/list_agents/run_builtin_agent│       │               │
│      │ ├─ ✅ 5 schemas + descriptions            │          │               │
│      │ ├─ ✅ Registered in registry.ts            │          │               │
│      │ └─ ✅ 61 tests passing                     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P1-6 │ SendMessage Tool ✅ DONE              │ 200      │ P1-5          │
│      │ ├─ ✅ AgentMessageStore (send/get/markRead/unread)     │          │               │
│      │ ├─ ✅ send_message tool (to/content/type/task_id/from) │          │               │
│      │ ├─ ✅ Schema + description               │          │               │
│      │ ├─ ✅ Registered in registry.ts         │          │               │
│      │ └─ ✅ 27 tests passing + bun run dev ✅ |          │               │
└──────┴────────────────────────────────────────────┴──────────┴───────────────┘
```

### P2 - 有则更好 (增强功能)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  P2: NICE TO HAVE - 增强功能                                                 │
├──────┬────────────────────────────────────────────┬──────────┬───────────────┤
│  ID  │ Task                                       │ Est Lines│ Dependency    │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-1 │ NotebookEditTool ✅ 2026-05-08            │ 300      │ ✅ `src/tools/notebook/notebook-tools.ts`, `src/tools/notebook/notebook-tools.test.ts` |
│      │ └─ ✅ 5 tools: notebook_read/create/edit_cell/insert_cell/delete_cell (23 tests) │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-2 │ LSPTool ✅ 2026-05-08                     │ 400      │ ✅ `src/tools/lsp/lsp-tools.ts`, `src/tools/lsp/lsp-tools.test.ts` |
│      │ ├─ ✅ 代码补全 (lsp_complete)              │          │               │
│      │ ├─ ✅ 定义跳转 (lsp_definition)            │          │               │
│      │ ├─ ✅ 引用查找 (lsp_references)            │          │               │
│      │ ├─ ✅ Hover 信息 (lsp_hover)              │          │               │
│      │ └─ ✅ 诊断信息 (lsp_diagnostics) (23 tests) │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-3 │ ConfigTool ✅ DONE                   │ 200      │ None          │
│      │ ├─ ✅ getConfigValue/setConfigValue helpers      │          │               │
│      │ ├─ ✅ 3 tools: config_get/config_set/config_list      │          │               │
│      │ ├─ ✅ Dot notation support (e.g. memory.enabled)     │          │               │
│      │ ├─ ✅ Schema + descriptions              │          │               │
│      │ ├─ ✅ Registered in registry.ts          │          │               │
│      │ └─ ✅ 31 tests passing + bun run dev ✅ |          |               |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-4 │ SnipTool (as tool) ✅ DONE           | 100      │ None          │
│      │ ├─ ✅ snip_tool with dry_run/threshold/preserve options   │          │               │
│      │ ├─ ✅ Schema + description               │          │               │
│      │ ├─ ✅ Registered in registry.ts          │          │               │
│      │ ├─ ✅ Bug fix: snip loop (i > safeEnd)  │          │               │
│      │ └─ ✅ 24 tests passing + bun run dev ✅|          |               |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-5 │ PushNotification Tool ✅ 2026-05-08      │ 200      │ ✅ `src/tools/notify/notify-tool.ts`, `src/tools/notify/notify-tool.test.ts` |
│      │ └─ ✅ 2 tools: notify/notify_list (23 tests) │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-6 │ Hooks 增强 ✅ 2026-05-08                  │ 1,000    │ ✅ `src/hooks/agent-hooks.ts`, `src/hooks/agent-hooks.test.ts` |
│      │ ├─ ✅ useMemoryUsage 内存监控 (34 tests)   │          │               │
│      │ ├─ ✅ useMergedClients MCP 合并            │          │               │
│      │ ├─ ✅ useCommandQueue 命令队列             │          │               │
│      │ ├─ ✅ useDynamicConfig 动态配置            │          │               │
│      │ └─ ✅ useSessionBackgrounding 会话后台     │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P2-7 │ Permission 系统增强 ✅ 2026-05-08         │ 300      │ ✅ P0-1       │
│      │ ├─ ✅ 完整权限规则系统 (permission-mode.ts) │          │               │
│      │ ├─ ✅ Shell 命令分类器 (command-classifier) │          │               │
│      │ └─ ✅ 权限持久化 (8 tests passing)         │          │               │
└──────┴────────────────────────────────────────────┴──────────┴───────────────┘
```

### P3 - 远期目标

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  P3: FUTURE - 远期目标                                                       │
├──────┬────────────────────────────────────────────┬──────────┬───────────────┤
│  ID  │ Task                                       │ Est Lines│ Dependency    │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-1 │ Commands 系统 ✅ 2026-05-08               │ 2,000    │ ✅ `src/commands/commands.ts`, `src/commands/commands.test.ts` |
│      │ ├─ ✅ slash 命令框架 (CommandRegistry)    │          │               │
│      │ ├─ ✅ 内置命令 (/help, /clear, /compact, /status, /skills, /echo, /reset) │ │
│      │ ├─ ✅ 别名支持 (/h, /cls, /?)            │          │               │
│      │ ├─ ✅ 自定义命令注册                       │          │               │
│      │ └─ ✅ 31 tests passing                    │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-2 │ SleepTool ✅ 2026-05-08                   │ 100      │ ✅ `src/tools/sleep-tool.ts`, `src/tools/sleep-tool.test.ts` |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-3 │ MonitorTool ✅ 2026-05-08                │ 200      │ ✅ `src/tools/monitor-tool.ts`, `src/tools/monitor-tool.test.ts` |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-4 │ ToolSearchTool ✅ 2026-05-08              │ 150      │ ✅ `src/tools/tool-search-tool.ts`, `src/tools/tool-search-tool.test.ts`, `src/tools/tool-search-tool.behavior.test.ts` |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-5 │ TeamCreate/Delete Tools ✅ 2026-05-08    │ 300      │ ✅ `src/tools/team-tools.ts`, `src/tools/team-tools.test.ts`, `src/tools/team-tools.behavior.test.ts` |
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-6 │ 估值分析引擎 ✅ 2026-05-08                │ 600      │ ✅ `src/tools/valuation/valuation-tools.ts`, `src/tools/valuation/valuation-tools.test.ts` |
│      │ ├─ PE/PB/PCF 指标 ✅                      │          │               │
│      │ ├─ DCF 内在价值 ✅                        │          │               │
│      │ └─ 同业对比 ✅                            │          │               │
├──────┼────────────────────────────────────────────┼──────────┼───────────────┤
│ P3-7 │ 决策仪表盘 ✅ 2026-05-08                  │ 800      │ ✅ `src/tools/valuation/decision-dashboard.ts`, `src/tools/valuation/decision-dashboard.test.ts` |
│      │ ├─ 四维度评分 (技术/基本/情感/风险) ✅    │          │               │
│      │ ├─ 买卖信号 ✅                            │          │               │
│      │ └─ Markdown 报告 ✅                       │          │               │
└──────┴────────────────────────────────────────────┴──────────┴───────────────┘
```

### 工作量估算汇总

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    EFFORT ESTIMATION                                          │
│                                                                              │
│  Priority  │ Tasks │ Est Lines │ Est Time  │ Description                    │
│  ─────────────────────────────────────────────────────────────               │
│  P0        │   2   │  2,800    │  3-5 days │ Core capabilities              │
│  P1        │   6   │  3,200    │  5-7 days │ User experience                │
│  P2        │   7   │  2,800    │  4-6 days │ Enhanced features              │
│  P3        │   7   │  4,150    │  5-7 days │ Future goals                   │
│  ─────────────────────────────────────────────────────────────               │
│  TOTAL     │  22   │ 12,950    │ 17-25 days│                                │
│                                                                              │
│  Week 1: P0 (BashTool + AgentLoop 增强)                                     │
│  Week 2: P1 (TodoWrite + TaskSystem + AskUser + Compaction)                 │
│  Week 3: P1 continued + P2 start (AgentTool + Hooks)                        │
│  Week 4: P2 continued + P3 start (Commands + Investment)                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

> 文档版本: v3.1 — 审计完成，后续计划见 mm4.md
> 最后更新: 2026-05-08
> 基于对 Claude Code (loucode) 和 Dexter 的完整源码分析
> 后续计划: mm4.md (592行，11章节，完整差距分析 + 投资功能优先级)
> ✅ All P0 + P1 + P2 + P3 items completed. 834 tests passing. bun run dev ✅
>
> ## 八、投资能力真实审计 (2026-05-08)
>
> ### 8.1 生产级 (真实 API，可用)
> - **A-Stock 数据管道**: Tushare Pro API + 腾讯/新浪/东方财富实时行情，多源降级
> - **US Finance**: Financial Datasets API，LLM 路由自动选择子工具
> - **估值计算**: PE/PB/PCF/DCF/Peer 数学正确，标准教科书实现
> - **量化计算**: VaR (历史+参数) / Sharpe / Sortino / MaxDD 数学正确
>
> ### 8.2 已升级 (从玩具级 → 原型级)
> - **投资研究管道** ✅ 升级: 否定感知情感分析 + 8类事件检测 + 中文实体抽取 (46 tests)
> - **组合管理** ✅ 升级: JSON文件持久化 + 现金管理 + 交易历史 + 自动保存 (15 tests)
>
> ### 8.3 仍需提升 (当前限制)
> - **决策看板**: 规则评分阈值固定 (PE<10=便宜+15)，权重不可配，非投资级别信号
> - **股票筛选器**: PE/市值过滤未实现，仅列出股票基本信息
> - **数据编排**: LLM 必须手动在 get_financials → valuation_tools 之间传递数据，容易出错
> - **新闻抓取**: 依赖未公开 API (东财/新浪/网易)，容易失效
>
> ### 8.4 与投资级 Claude Code 的差距
> | 能力           | 投资级要求              | 当前状态                     | 差距 |
> |---------------|------------------------|-----------------------------|------|
> | 实时数据       | 稳定 API + 降级        | ✅ 多源降级 + 重试           | 小   |
> | 基本面分析     | 自动的数据→计算流程     | ⚠️ 数学正确但手动编排       | 中   |
> | 技术面分析     | RSI/MACD/KDJ 计算      | ❌ 未实现                    | 大   |
> | 情感分析       | LLM 级理解             | ✅ 升级为否定感知 + 句子级   | 小   |
> | 组合跟踪       | 持久化 + 实时价格       | ✅ 文件持久化 (价格需传入)   | 中   |
> | 投资报告       | 综合研报生成            | ⚠️ 决策看板仅基础报告       | 中   |
> | 回测           | 历史策略验证            | ❌ 未实现                    | 大   |
>
> **结论**: Dexter 的数据获取层是生产级的，计算层数学正确。主要差距在于:
> 1. 缺少自动化数据编排 (工具间自动传递数据)
> 2. 缺少技术指标计算 (RSI/MACD/KDJ/BOLL)
> 3. 决策看板评分逻辑过于简化
> 4. 缺少回测系统
