/**
 * @upup/sdk - Memory Tool
 *
 * 记忆工具集成 - 将 @upup/memory 集成为可运行的工具
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { getMemvidStore } from '@upup/memory'

type MemvidStore = Awaited<ReturnType<typeof getMemvidStore>>
import type { BetaTool, JsonSchema } from '../beta-tool'
import { betaTool } from '../beta-tool'

// ============ Types ============

/**
 * 记忆类型
 */
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

/**
 * 记忆工具选项
 */
export interface MemoryToolOptions {
  /** 记忆存储实例 */
  store: MemvidStore
  /** 工具名称前缀 (默认: 'memory') */
  prefix?: string
  /** 默认搜索返回数量 */
  defaultK?: number
  /** 是否启用语义搜索 */
  enableSemantic?: boolean
}

// ============ Memory Tools Factory ============

/**
 * 创建记忆工具集
 *
 * @example
 * ```typescript
 * import { MemoryStore } from '@upup/memory'
 * import { createMemoryTools } from '@upup/sdk'
 *
 * const store = new MemoryStore({ path: './memory' })
 * await store.initialize()
 *
 * const tools = createMemoryTools({ store })
 *
 * // tools.search - 搜索记忆
 * // tools.put - 保存记忆
 * // tools.get - 获取记忆
 * // tools.delete - 删除记忆
 * // tools.timeline - 获取时间线
 * ```
 */
export function createMemoryTools(options: MemoryToolOptions): MemoryTools {
  const {
    store,
    prefix = 'memory',
    defaultK = 5,
    enableSemantic = false,
  } = options

  return {
    search: createSearchTool(store, prefix, defaultK, enableSemantic),
    put: createPutTool(store, prefix),
    get: createGetTool(store, prefix),
    delete: createDeleteTool(store, prefix),
    timeline: createTimelineTool(store, prefix),
  }
}

/**
 * 记忆工具集合
 */
export interface MemoryTools {
  /** 搜索记忆 */
  search: BetaTool
  /** 保存记忆 */
  put: BetaTool
  /** 获取记忆 */
  get: BetaTool
  /** 删除记忆 */
  delete: BetaTool
  /** 获取时间线 */
  timeline: BetaTool
}

// ============ Individual Tools ============

function createSearchTool(
  store: MemvidStore,
  prefix: string,
  defaultK: number,
  enableSemantic: boolean
): BetaTool {
  return betaTool({
    name: `${prefix}_search`,
    description: 'Search memories using keywords or semantic similarity',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference', 'all'],
          description: 'Filter by memory type',
        },
        k: {
          type: 'number',
          description: 'Number of results to return',
        },
        semantic: {
          type: 'boolean',
          description: 'Use semantic search instead of keyword search',
        },
      },
      required: ['query'],
    } as JsonSchema,
    run: async (input: unknown) => {
      const { query, type, k = defaultK, semantic = enableSemantic } = input as {
        query: string
        type?: MemoryType | 'all'
        k?: number
        semantic?: boolean
      }

      const typeFilter = type === 'all' ? undefined : type

      const results = semantic
        ? await store.semanticSearch(query, k, typeFilter)
        : await store.search(query, k, typeFilter)

      if (results.length === 0) {
        return 'No memories found'
      }

      return results
        .map((result, i) => `[${i + 1}] ${result.snippet.slice(0, 200)} (score: ${result.score})`)
        .join('\n')
    },
  })
}

function createPutTool(store: MemvidStore, prefix: string): BetaTool {
  return betaTool({
    name: `${prefix}_put`,
    description: 'Store a new memory',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content to store',
        },
        type: {
          type: 'string',
          enum: ['user', 'feedback', 'project', 'reference'],
          description: 'Memory type',
        },
        name: {
          type: 'string',
          description: 'Optional name for the memory',
        },
      },
      required: ['content'],
    } as JsonSchema,
    run: async (input: unknown) => {
      const { content, type = 'user', name } = input as {
        content: string
        type?: MemoryType
        name?: string
      }

      const id = await store.putMemory({
        type,
        name: name ?? `memory-${Date.now()}`,
        description: content.split('\n')[0]?.slice(0, 120) ?? '',
        content,
      })
      return `Memory saved with ID: ${id}`
    },
  })
}

function createGetTool(store: MemvidStore, prefix: string): BetaTool {
  return betaTool({
    name: `${prefix}_get`,
    description: 'Get full content of a memory by ID',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID',
        },
      },
      required: ['id'],
    } as JsonSchema,
    run: async (input: unknown) => {
      const { id } = input as { id: string }

      const frameId = Number.parseInt(id, 10)
      if (!Number.isInteger(frameId)) {
        return `Memory not found: ${id}`
      }
      try {
        return await store.viewFrame(frameId)
      } catch {
        return `Memory not found: ${id}`
      }
    },
  })
}

function createDeleteTool(_store: MemvidStore, prefix: string): BetaTool {
  return betaTool({
    name: `${prefix}_delete`,
    description: 'Delete a memory by ID',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID to delete',
        },
      },
      required: ['id'],
    } as JsonSchema,
    run: async (input: unknown) => {
      const { id } = input as { id: string }

      // MemvidStore exposes no delete operation yet.
      return `Delete not supported by MemvidStore. Memory ID: ${id}`
    },
  })
}

function createTimelineTool(store: MemvidStore, prefix: string): BetaTool {
  return betaTool({
    name: `${prefix}_timeline`,
    description: 'Get timeline of recent memories',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent memories to return',
        },
      },
      required: [],
    } as JsonSchema,
    run: async (input: unknown) => {
      const { limit = 10 } = input as { limit?: number }

      const timeline = await store.getTimeline(limit)

      if (timeline.length === 0) {
        return 'No memories in timeline'
      }

      return timeline
        .map((entry, i) => `[${i + 1}] #${entry.frameId} ${entry.title} (${new Date(entry.timestamp).toLocaleDateString()})`)
        .join('\n')
    },
  })
}
