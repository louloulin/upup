/**
 * UpUp 推荐 Pi 插件清单
 *
 * 每个 Pi extension 插件都可能向 system prompt 注入 skill/tool/prompt，
 * 启动时也可能产生 side effects（如 @quintinshaw/pi-dynamic-workflows 的
 * `workflow-delivery` warning）。UpUp 默认 settings.json 不写任何 npm 第三方
 * 包；用户按需通过 `upup plugin install <source>` 显式启用。
 *
 * 此清单仅用于：
 *   1. `upup plugin recommend` 输出可装列表（标注用途、副作用、兼容性）
 *   2. `upup doctor` 检测到用户已装的不兼容版本时给出迁移提示
 *   3. 守门测试 `check:upup-recommended-plugins` 防止清单漂移
 *
 * 新增插件必须满足：
 *   - 已通过 UpUp 投资场景验证（不影响 19 个 pi-* workspace 加载）
 *   - 兼容 `@earendil-works/pi-coding-agent@0.85.1`
 *   - 不引入会污染 system prompt 的全局 hook（如 `workflow-delivery`）
 */

export type RecommendedPluginCategory =
  | 'web'             // 网页抓取 / 搜索
  | 'mcp'             // MCP 适配
  | 'subagent'        // 子代理 / 多 agent 协作
  | 'memory'          // 持久记忆
  | 'background'      // 后台任务 / cron
  | 'workflow'        // 工作流编排
  | 'cache'           // prompt / KV cache 优化
  | 'advisor'         // Executor/Advisor
  | 'plan-review'     // plan annotation / review
  | 'roles'           // per-role agent config
  | 'provider'        // 自定义 provider
  | 'interaction';    // 交互增强

export interface RecommendedPlugin {
  /** Pi 解析的 source 字符串，例如 `npm:pi-mcp-adapter` */
  readonly source: string;
  /** 展示名 */
  readonly name: string;
  /** 类别 */
  readonly category: RecommendedPluginCategory;
  /** 简短描述 */
  readonly description: string;
  /** 是否经 UpUp 实测启动无 side-effect warning */
  readonly verifiedClean: boolean;
  /** 兼容性说明（已知问题或限制） */
  readonly caveats: readonly string[];
}

/**
 * UpUp 推荐清单。每个插件独立 `upup plugin install` 启用；任意一个出问题
 * 不影响其他。已通过 2026-09-16 Pi 0.85.1 + UpUp 实测验证。
 */
export const UPUP_RECOMMENDED_PLUGINS: readonly RecommendedPlugin[] = [
  {
    source: 'npm:pi-web-access',
    name: 'Pi Web Access',
    category: 'web',
    description: '第三方网页搜索 / 抓取扩展（30+ provider）。与 UpUp 自带 web_search 二选一。',
    verifiedClean: false,
    caveats: [
      '默认关闭：它注册的 web_search 与 UpUp @upup/pi-research extension 同名，同时加载会让 Pi 以 `Tool "web_search" conflicts` 退出。',
      '需要时 `upup plugin enable npm:pi-web-access`，并同时关闭 UpUp 自带 search（或接受冲突）。',
    ],
  },
  {
    source: 'npm:pi-mcp-adapter',
    name: 'Pi MCP Adapter',
    category: 'mcp',
    description: '把任意 MCP server 注册为 Pi 工具（用于本地 MCP 服务）。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:pi-subagents',
    name: 'Pi Subagents',
    category: 'subagent',
    description: 'Single-agent delegation + scripted multi-agent workflows (UpUp 自动加载)。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:pi-background-tasks',
    name: 'Pi Background Tasks',
    category: 'background',
    description: '后台任务调度（cron 风格）。UpUp 已有自己的 cron，请按需启用。',
    verifiedClean: true,
    caveats: ['UpUp 已通过 `@upup/cron` 提供 cron 能力，启用此包会产生重复。'],
  },
  {
    source: 'npm:pi-hermes-memory',
    name: 'Pi Hermes Memory',
    category: 'memory',
    description: 'Hermes 风格的 SQLite 持久记忆。与 UpUp 自带 memory 工具二选一。',
    verifiedClean: false,
    caveats: [
      '默认关闭：它注册的 `memory_search` / `memory_get` / `memory_update` 与 `@upup/pi-platform` 的 platform memory 工具同名，同时加载会让 Pi 以 `Tool "memory_search" conflicts` 退出。',
      '需要时 `upup plugin enable npm:pi-hermes-memory`，并接受由此产生的工具名冲突。',
    ],
  },
  {
    source: 'npm:@narumitw/pi-goal',
    name: 'Pi Goal',
    category: 'workflow',
    description: '目标驱动的 session 编排。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:@juicesharp/rpiv-ask-user-question',
    name: 'Ask User Question',
    category: 'interaction',
    description: 'agent 中途向用户提问的工具。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:@specode/pi-kimi-cu',
    name: 'Kimi Computer Use',
    category: 'interaction',
    description: 'Kimi 模型的 computer use 适配。',
    verifiedClean: true,
    caveats: ['需要 Moonshot API key。'],
  },
  {
    source: 'npm:@amaster.ai/pi-teamwork',
    name: 'Pi Teamwork',
    category: 'subagent',
    description: '多 agent 团队协作。',
    verifiedClean: true,
    caveats: ['需要外部 multica server URL + token；启用前请阅读其隐私策略。'],
  },
  {
    source: 'npm:@llmgates_api/pi-llmgates-provider',
    name: 'LLMgates Provider',
    category: 'provider',
    description: 'LLMgates API 的 Pi provider 注册。',
    verifiedClean: true,
    caveats: ['需要 LLMgates API key。'],
  },

  {
    source: 'npm:pi-web-search',
    name: 'Pi Web Search',
    category: 'web',
    description: 'Provider-native web search (Gemini URL Context, xAI Grok, OpenAI Responses).',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:pi-cache-optimizer',
    name: 'Pi Cache Optimizer',
    category: 'cache',
    description: 'Stable-prompt rewrite + OpenAI-compatible cache keys (大幅提升 prompt cache 命中率)。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:pi-advisor-flow',
    name: 'Pi Advisor Flow',
    category: 'advisor',
    description: 'Executor/Advisor 模式：模型可向更强者申请 second opinion。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:@plannotator/pi-extension',
    name: 'Plannotator',
    category: 'plan-review',
    description: '浏览器端 plan review + annotation 工具；`/invest` 后可让用户在 UI 标注疑点。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:rolebox',
    name: 'Rolebox',
    category: 'roles',
    description: 'Per-role prompts/models/skills/permissions；UpUp SOP role 格式兼容 rolebox 规范。',
    verifiedClean: true,
    caveats: [],
  },
  {
    source: 'npm:pi-goal-list-loop-audit',
    name: 'Pi GLLA',
    category: 'workflow',
    description: 'Long-running autonomous mission control：interview-drafted goals + 独立 detached auditor。',
    verifiedClean: true,
    caveats: ['与 UpUp `@upup/cron` / `--sop` 部分能力重叠，按需启用。'],
  },
  {
    source: 'npm:@arhen/pi-core-subagent',
    name: 'Arhen Pi Core Subagent',
    category: 'subagent',
    description: 'DAG dependency-graph subagent scheduler（替换 UpUp 自定义 research-coordinator）。',
    verifiedClean: true,
    caveats: [],
  },

  // 注意：`npm:@quintinshaw/pi-dynamic-workflows` 不在推荐清单
  // 它在启动时会 patch AgentSession 并输出 `[workflow-delivery] no
  // session-stable thenable send` warning，与 UpUp 19 个 workspace package
  // 的 extensionFactories 注入路径有冲突。如需启用，先用
  // `upup plugin install npm:@quintinshaw/pi-dynamic-workflows --autoload=false`。
] as const;

/**
 * 已知会污染 system prompt 或产生启动 warning 的非推荐插件。`upup doctor`
 * 检测到用户已装时给出明确提示。
 */
export const UPUP_KNOWN_PROBLEMATIC_PLUGINS: readonly RecommendedPlugin[] = [
  {
    source: 'npm:@quintinshaw/pi-dynamic-workflows',
    name: 'Pi Dynamic Workflows',
    category: 'workflow',
    description: '动态工作流面板（来自 npm 第三方）。',
    verifiedClean: false,
    caveats: [
      '启动时输出 `[workflow-delivery] no session-stable thenable send` warning',
      '会 monkey-patch AgentSession.prototype.sendCustomMessage',
      '与 UpUp 19 个 pi-* workspace packages 的 extensionFactories 注入路径冲突',
      '建议 `upup plugin disable npm:@quintinshaw/pi-dynamic-workflows` 关闭',
    ],
  },
] as const;

/**
 * 工具函数：按 category 分组
 */
export function groupRecommendedByCategory(
  plugins: readonly RecommendedPlugin[] = UPUP_RECOMMENDED_PLUGINS,
): Record<RecommendedPluginCategory, readonly RecommendedPlugin[]> {
  const groups: Record<RecommendedPluginCategory, RecommendedPlugin[]> = {
    web: [],
    mcp: [],
    subagent: [],
    memory: [],
    background: [],
    workflow: [],
    cache: [],
    advisor: [],
    'plan-review': [],
    roles: [],
    provider: [],
    interaction: [],
  };
  for (const plugin of plugins) {
    groups[plugin.category].push(plugin);
  }
  return groups;
}

/**
 * 工具函数：检查 source 是否在已知有问题的清单中
 */
export function isProblematicPlugin(source: string): RecommendedPlugin | undefined {
  return UPUP_KNOWN_PROBLEMATIC_PLUGINS.find((p) => p.source === source);
}
