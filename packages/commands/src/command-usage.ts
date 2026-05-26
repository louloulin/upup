/**
 * Command Usage Statistics
 *
 * Tracks command usage for:
 * - Prioritizing autocomplete suggestions
 * - Showing usage in help
 * - Analytics
 *
 * Uses file-based persistence to share state across module instances.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

interface UsageEntry {
  command: string
  count: number
  lastUsed: number
}

interface UsageStats {
  totalCommands: number
  totalExecutions: number
  mostUsed: Array<{ command: string; count: number }>
}

// Global storage path - persist to file for sharing across module instances
let storagePath: string | null = null

function getStoragePath(): string {
  if (!storagePath) {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    storagePath = join(__dirname, '../../.command-usage.json')
  }
  return storagePath
}

// In-memory cache
let usageMap: Map<string, UsageEntry> = new Map()
let loaded = false

function loadFromFile(): void {
  if (loaded) return
  loaded = true

  try {
    const path = getStoragePath()
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      usageMap = new Map(Object.entries(data))
    }
  } catch {
    // File doesn't exist or is corrupted, start fresh
    usageMap = new Map()
  }
}

function saveToFile(): void {
  try {
    const path = getStoragePath()
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const data = Object.fromEntries(usageMap)
    writeFileSync(path, JSON.stringify(data, null, 2))
  } catch {
    // Ignore write errors
  }
}

export function recordCommandUsage(command: string): void {
  loadFromFile()

  const normalized = command.toLowerCase().trim()
  const existing = usageMap.get(normalized)

  if (existing) {
    existing.count++
    existing.lastUsed = Date.now()
  } else {
    usageMap.set(normalized, {
      command: normalized,
      count: 1,
      lastUsed: Date.now(),
    })
  }

  saveToFile()
}

export function getCommandUsage(command: string): number {
  loadFromFile()

  const normalized = command.toLowerCase().trim()
  return usageMap.get(normalized)?.count ?? 0
}

export function getTopCommands(limit: number = 10): Array<{ command: string; count: number }> {
  loadFromFile()

  const sorted = Array.from(usageMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  return sorted.map((e) => ({ command: e.command, count: e.count }))
}

export function getUsageStats(): UsageStats {
  loadFromFile()

  const entries = Array.from(usageMap.values())
  const totalExecutions = entries.reduce((sum, e) => sum + e.count, 0)
  const mostUsed = getTopCommands(10)

  return {
    totalCommands: usageMap.size,
    totalExecutions,
    mostUsed,
  }
}

export function resetUsageStats(): void {
  usageMap = new Map()
  saveToFile()
}

export function getCommandRank(command: string): number {
  loadFromFile()

  const normalized = command.toLowerCase().trim()
  const sorted = Array.from(usageMap.values()).sort((a, b) => b.count - a.count)
  const index = sorted.findIndex((e) => e.command === normalized)
  return index === -1 ? -1 : index + 1
}

export function isFrequentlyUsed(command: string, threshold: number = 3): boolean {
  return getCommandUsage(command) >= threshold
}
