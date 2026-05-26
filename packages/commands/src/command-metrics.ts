/**
 * Command Metrics Collector
 *
 * Tracks detailed command execution metrics for:
 * - Success/failure rates
 * - Execution duration
 * - Performance analysis
 * - Usage patterns
 *
 * Reference: loucode command metrics system
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export interface CommandMetric {
  name: string
  totalCalls: number
  successCount: number
  errorCount: number
  totalDurationMs: number
  avgDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  lastCalled: number
  lastSuccess: number
  lastError?: string
}

export interface MetricsSummary {
  totalCommands: number
  totalExecutions: number
  overallSuccessRate: number
  avgExecutionTimeMs: number
  topCommands: CommandMetric[]
  slowestCommands: CommandMetric[]
  errorCommands: CommandMetric[]
}

// Storage path
let storagePath: string | null = null

function getStoragePath(): string {
  if (!storagePath) {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    storagePath = join(__dirname, '../../.command-metrics.json')
  }
  return storagePath
}

// In-memory cache
let metricsMap: Map<string, CommandMetric> = new Map()
let loaded = false

function loadFromFile(): void {
  if (loaded) return
  loaded = true

  try {
    const path = getStoragePath()
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'))
      metricsMap = new Map(Object.entries(data))
    }
  } catch {
    metricsMap = new Map()
  }
}

function saveToFile(): void {
  try {
    const path = getStoragePath()
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const data = Object.fromEntries(metricsMap)
    writeFileSync(path, JSON.stringify(data, null, 2))
  } catch {
    // Ignore write errors
  }
}

/**
 * Record a command execution
 */
export function recordCommandMetric(
  name: string,
  success: boolean,
  durationMs: number,
  errorMessage?: string
): void {
  loadFromFile()

  const normalized = name.toLowerCase().trim()
  const now = Date.now()

  const existing = metricsMap.get(normalized)

  if (existing) {
    existing.totalCalls++
    if (success) {
      existing.successCount++
      existing.lastSuccess = now
    } else {
      existing.errorCount++
      existing.lastError = errorMessage
    }
    existing.totalDurationMs += durationMs
    existing.avgDurationMs = Math.round(existing.totalDurationMs / existing.totalCalls)
    existing.minDurationMs = Math.min(existing.minDurationMs, durationMs)
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs)
    existing.lastCalled = now
  } else {
    metricsMap.set(normalized, {
      name: normalized,
      totalCalls: 1,
      successCount: success ? 1 : 0,
      errorCount: success ? 0 : 1,
      totalDurationMs: durationMs,
      avgDurationMs: durationMs,
      minDurationMs: durationMs,
      maxDurationMs: durationMs,
      lastCalled: now,
      lastSuccess: success ? now : 0,
      lastError: success ? undefined : errorMessage,
    })
  }

  saveToFile()
}

/**
 * Get metrics for a specific command
 */
export function getCommandMetric(name: string): CommandMetric | undefined {
  loadFromFile()
  return metricsMap.get(name.toLowerCase().trim())
}

/**
 * Get all metrics
 */
export function getAllMetrics(): Map<string, CommandMetric> {
  loadFromFile()
  return new Map(metricsMap)
}

/**
 * Get metrics summary
 */
export function getMetricsSummary(): MetricsSummary {
  loadFromFile()

  const metrics = Array.from(metricsMap.values())
  const totalExecutions = metrics.reduce((sum, m) => sum + m.totalCalls, 0)
  const totalDuration = metrics.reduce((sum, m) => sum + m.totalDurationMs, 0)
  const totalSuccesses = metrics.reduce((sum, m) => sum + m.successCount, 0)

  const topCommands = [...metrics]
    .sort((a, b) => b.totalCalls - a.totalCalls)
    .slice(0, 10)

  const slowestCommands = [...metrics]
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10)

  const errorCommands = [...metrics]
    .filter(m => m.errorCount > 0)
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10)

  return {
    totalCommands: metrics.length,
    totalExecutions,
    overallSuccessRate: totalExecutions > 0 ? Math.round((totalSuccesses / totalExecutions) * 10000) / 100 : 0,
    avgExecutionTimeMs: totalExecutions > 0 ? Math.round(totalDuration / totalExecutions) : 0,
    topCommands,
    slowestCommands,
    errorCommands,
  }
}

/**
 * Reset all metrics
 */
export function resetMetrics(): void {
  metricsMap = new Map()
  saveToFile()
}

/**
 * Delete metrics for a specific command
 */
export function deleteCommandMetric(name: string): boolean {
  loadFromFile()
  const deleted = metricsMap.delete(name.toLowerCase().trim())
  if (deleted) saveToFile()
  return deleted
}

/**
 * Export metrics as JSON string
 */
export function exportMetrics(): string {
  loadFromFile()
  return JSON.stringify(Object.fromEntries(metricsMap), null, 2)
}

/**
 * Import metrics from JSON string
 */
export function importMetrics(json: string): void {
  try {
    const data = JSON.parse(json)
    metricsMap = new Map(Object.entries(data))
    saveToFile()
    loaded = true
  } catch {
    throw new Error('Invalid metrics JSON')
  }
}
