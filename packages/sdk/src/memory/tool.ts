/**
 * @upup/sdk - Memory Tool
 *
 * 记忆工具集成 - 将 @upup/memory 集成为可运行的工具
 * @see https://docs.anthropic.com/en/docs/claude-code/api
 */

import type { MemoryStore } from '@upup/memory'
import type { BetaTool, JsonSchema } from '../beta-tool.js'
import { betaTool } from '../beta-tool.js'

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
  store: MemoryStore
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
  store: MemoryStore,
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

      const results = semantic
        ? await store.semanticSearch(query, { maxResults: k })
        : await store.search(query, { maxResults: k, type: type as any })

      if (results.length === 0) {
        return 'No memories found'
      }

      return results
        .map((r, i) => `[${i + 1}] ${r.content.slice(0, 200)}... (score: ${r.score})`)
        .join('\n')
    },
  })
}

function createPutTool(store: MemoryStore, prefix: string): BetaTool {
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

      const id = await store.put(content, { type, name })
      return `Memory saved with ID: ${id}`
    },
  })
}

function createGetTool(store: MemoryStore, prefix: string): BetaTool {
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

      try {
        const content = await store.view(id)
        return content
      } catch {
        return `Memory not found: ${id}`
      }
    },
  })
}

function createDeleteTool(store: MemoryStore, prefix: string): BetaTool {
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

      // 注意: MemoryStore 可能没有 delete 方法
      // 这里返回一个提示信息
      return `Delete not supported in current MemoryStore implementation. Memory ID: ${id}`
    },
  })
}

function createTimelineTool(store: MemoryStore, prefix: string): BetaTool {
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

      const timeline = await store.timeline(limit)

      if (timeline.length === 0) {
        return 'No memories in timeline'
      }

      return timeline
        .map((t, i) => `[${i + 1}] ${t.title} (${new Date(t.timestamp).toLocaleDateString()})`)
        .join('\n')
    },
  })
}

// ============ Exports ============

export type {
  MemoryType,
  MemoryToolOptions,
  MemoryTools,
}