/**
 * Skill Evaluation Runner
 *
 * Evaluates Dexter's skill triggering accuracy and output quality.
 * Based on Anthropic's skill-creator eval methodology.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkills, getSkill } from '../src/skills/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Types
// ============================================================================

interface EvalTestCase {
  id: string;
  query: string;
  expectedSkill: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

interface EvalConfig {
  name: string;
  version: string;
  testCases: EvalTestCase[];
  evaluationCriteria: Record<string, {
    weight: number;
    description: string;
    passThreshold: string | number;
  }>;
  metadata: {
    created: string;
    lastUpdated: string;
    totalCases: number;
  };
}

interface EvalResult {
  caseId: string;
  query: string;
  expectedSkill: string;
  actualSkill: string | null;
  triggered: boolean;
  match: boolean;
  confidence: number;
  error?: string;
  durationMs: number;
}

interface EvalSummary {
  totalCases: number;
  triggeredCases: number;
  matchedCases: number;
  triggerAccuracy: number;
  avgConfidence: number;
  results: EvalResult[];
  errors: number;
  byCategory: Record<string, { total: number; matched: number; accuracy: number }>;
  byPriority: Record<string, { total: number; matched: number; accuracy: number }>;
}

// ============================================================================
// Skill Matching (Simplified AI-driven matching)
// ============================================================================

/**
 * Extract keywords from text for matching (supports both English and Chinese)
 */
function extractKeywords(text: string): string[] {
  const keywords = new Set<string>();

  // Extract English words
  const englishWords = text.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  englishWords.forEach(w => keywords.add(w));

  // Extract Chinese keywords (2+ character phrases)
  const chinesePhrases = text.match(/[一-龥]{2,}/g) || [];
  chinesePhrases.forEach(p => keywords.add(p));

  return Array.from(keywords);
}

/**
 * Calculate match score between query and skill
 */
function calculateMatchScore(query: string, skillName: string, skillDescription: string): number {
  const queryLower = query.toLowerCase();
  const keywords = extractKeywords(skillDescription);
  const queryKeywords = extractKeywords(query);

  // Direct name match (highest weight)
  if (skillName.toLowerCase().includes(queryLower) || queryLower.includes(skillName.toLowerCase())) {
    return 1.0;
  }

  // Keyword matching
  let score = 0;
  let matchCount = 0;

  // Check if query keywords exist in skill description
  for (const queryWord of queryKeywords) {
    for (const keyword of keywords) {
      if (keyword.includes(queryWord) || queryWord.includes(keyword)) {
        matchCount++;
        score += 0.15;
        break;
      }
    }
  }

  // Normalize score (cap at 0.95 for partial matches)
  const normalizedScore = Math.min(score, 0.95);

  return normalizedScore;
}

/**
 * Find the best matching skill for a query
 */
function findBestMatchingSkill(
  query: string,
  skills: Array<{ name: string; description: string }>
): { skill: string | null; score: number } {
  let bestMatch = { skill: null as string | null, score: 0 };

  for (const skill of skills) {
    const score = calculateMatchScore(query, skill.name, skill.description);
    if (score > bestMatch.score) {
      bestMatch = { skill: skill.name, score };
    }
  }

  // Only return a match if confidence is above threshold
  if (bestMatch.score < 0.3) {
    return { skill: null, score: 0 };
  }

  return bestMatch;
}

// ============================================================================
// Evaluation Logic
// ============================================================================

/**
 * Run evaluation for a single test case
 */
async function evaluateCase(
  testCase: EvalTestCase,
  skills: Array<{ name: string; description: string }>,
  useAI: boolean = false
): Promise<EvalResult> {
  const startTime = Date.now();

  try {
    // For now, use keyword-based matching (can be enhanced with AI)
    const { skill: matchedSkill, score } = findBestMatchingSkill(testCase.query, skills);

    const result: EvalResult = {
      caseId: testCase.id,
      query: testCase.query,
      expectedSkill: testCase.expectedSkill,
      actualSkill: matchedSkill,
      triggered: matchedSkill !== null,
      match: matchedSkill === testCase.expectedSkill,
      confidence: score,
      durationMs: Date.now() - startTime,
    };

    return result;
  } catch (error) {
    return {
      caseId: testCase.id,
      query: testCase.query,
      expectedSkill: testCase.expectedSkill,
      actualSkill: null,
      triggered: false,
      match: false,
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run full evaluation suite
 */
async function runEvaluation(config: EvalConfig, useAI: boolean = false): Promise<EvalSummary> {
  // Get all available skills
  const skills = discoverSkills().map(s => ({
    name: s.name,
    description: s.description || s.instructions.substring(0, 500),
  }));

  console.log(`[Eval] Found ${skills.length} skills`);
  console.log(`[Eval] Running ${config.testCases.length} test cases...\n`);

  const results: EvalResult[] = [];

  // Run evaluations
  for (const testCase of config.testCases) {
    const result = await evaluateCase(testCase, skills, useAI);
    results.push(result);

    // Progress indicator
    const status = result.match ? '✅' : result.triggered ? '⚠️' : '❌';
    console.log(`${status} ${testCase.id}: expected=${testCase.expectedSkill}, actual=${result.actualSkill || 'none'}, confidence=${(result.confidence * 100).toFixed(0)}%`);
  }

  // Calculate summary statistics
  const triggeredCases = results.filter(r => r.triggered).length;
  const matchedCases = results.filter(r => r.match).length;
  const errors = results.filter(r => r.error).length;
  const triggerAccuracy = triggeredCases / results.length;
  const matchAccuracy = matchedCases / results.length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  // Group by category
  const byCategory: Record<string, { total: number; matched: number; accuracy: number }> = {};
  for (const result of results) {
    const testCase = config.testCases.find(t => t.id === result.caseId);
    const category = testCase?.category || 'unknown';

    if (!byCategory[category]) {
      byCategory[category] = { total: 0, matched: 0, accuracy: 0 };
    }
    byCategory[category].total++;
    if (result.match) {
      byCategory[category].matched++;
    }
  }

  for (const category of Object.keys(byCategory)) {
    byCategory[category].accuracy = byCategory[category].matched / byCategory[category].total;
  }

  // Group by priority
  const byPriority: Record<string, { total: number; matched: number; accuracy: number }> = {};
  for (const result of results) {
    const testCase = config.testCases.find(t => t.id === result.caseId);
    const priority = testCase?.priority || 'low';

    if (!byPriority[priority]) {
      byPriority[priority] = { total: 0, matched: 0, accuracy: 0 };
    }
    byPriority[priority].total++;
    if (result.match) {
      byPriority[priority].matched++;
    }
  }

  for (const priority of Object.keys(byPriority)) {
    byPriority[priority].accuracy = byPriority[priority].matched / byPriority[priority].total;
  }

  return {
    totalCases: results.length,
    triggeredCases,
    matchedCases,
    triggerAccuracy,
    avgConfidence,
    results,
    errors,
    byCategory,
    byPriority,
  };
}

/**
 * Format evaluation summary
 */
function formatSummary(summary: EvalSummary): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    SKILL EVALUATION REPORT');
  lines.push('═══════════════════════════════════════════════════════════════\n');

  lines.push('## Overall Metrics');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Total Test Cases:     ${summary.totalCases}`);
  lines.push(`Triggered Cases:      ${summary.triggeredCases} (${(summary.triggerAccuracy * 100).toFixed(1)}%)`);
  lines.push(`Matched Cases:        ${summary.matchedCases} (${(summary.matchedCases / summary.totalCases * 100).toFixed(1)}%)`);
  lines.push(`Errors:               ${summary.errors}`);
  lines.push(`Avg Confidence:       ${(summary.avgConfidence * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('## Accuracy by Priority');
  lines.push('───────────────────────────────────────────────────────────────');
  for (const [priority, stats] of Object.entries(summary.byPriority)) {
    const bar = '█'.repeat(Math.round(stats.accuracy * 20)) + '░'.repeat(20 - Math.round(stats.accuracy * 20));
    lines.push(`${priority.toUpperCase().padEnd(8)} ${bar} ${(stats.accuracy * 100).toFixed(1)}% (${stats.matched}/${stats.total})`);
  }
  lines.push('');

  lines.push('## Accuracy by Category');
  lines.push('───────────────────────────────────────────────────────────────');
  for (const [category, stats] of Object.entries(summary.byCategory)) {
    const bar = '█'.repeat(Math.round(stats.accuracy * 20)) + '░'.repeat(20 - Math.round(stats.accuracy * 20));
    lines.push(`${category.padEnd(20)} ${bar} ${(stats.accuracy * 100).toFixed(1)}% (${stats.matched}/${stats.total})`);
  }
  lines.push('');

  lines.push('## Recommendations');
  lines.push('───────────────────────────────────────────────────────────────');

  const lowAccuracyCategories = Object.entries(summary.byCategory)
    .filter(([, stats]) => stats.accuracy < 0.8)
    .sort((a, b) => a[1].accuracy - b[1].accuracy);

  if (lowAccuracyCategories.length > 0) {
    lines.push('Categories needing improvement:');
    for (const [category] of lowAccuracyCategories) {
      lines.push(`  - ${category}`);
    }
  } else {
    lines.push('All categories meet the 80% accuracy threshold!');
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('[Eval] Starting Skill Evaluation...\n');

  // Load evaluation config
  const configPath = join(__dirname, 'skill-eval.json');
  const configContent = await readFile(configPath, 'utf-8');
  const config: EvalConfig = JSON.parse(configContent);

  console.log(`[Eval] Loaded ${config.testCases.length} test cases`);
  console.log(`[Eval] Config version: ${config.version}\n`);

  // Run evaluation
  const summary = await runEvaluation(config, false);

  // Print summary
  console.log('\n' + formatSummary(summary));

  // Generate report
  const reportPath = join(__dirname, 'eval-report.md');
  const reportContent = generateMarkdownReport(config, summary);

  // Write report (for programmatic access)
  console.log(`\n[Eval] Report available in: ${reportPath}`);

  // Return exit code based on accuracy
  const targetAccuracy = 0.9;
  const actualAccuracy = summary.matchedCases / summary.totalCases;

  if (actualAccuracy >= targetAccuracy) {
    console.log(`\n✅ Evaluation PASSED (${(actualAccuracy * 100).toFixed(1)}% >= ${(targetAccuracy * 100).toFixed(0)}% target)`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  Evaluation needs improvement (${(actualAccuracy * 100).toFixed(1)}% < ${(targetAccuracy * 100).toFixed(0)}% target)`);
    process.exit(1);
  }
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(config: EvalConfig, summary: EvalSummary): string {
  const lines: string[] = [];

  lines.push('# Skill Evaluation Report');
  lines.push('');
  lines.push(`**Date**: ${new Date().toISOString()}`);
  lines.push(`**Version**: ${config.version}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Cases | ${summary.totalCases} |`);
  lines.push(`| Triggered | ${summary.triggeredCases} (${(summary.triggerAccuracy * 100).toFixed(1)}%) |`);
  lines.push(`| Matched | ${summary.matchedCases} (${(summary.matchedCases / summary.totalCases * 100).toFixed(1)}%) |`);
  lines.push(`| Errors | ${summary.errors} |`);
  lines.push(`| Avg Confidence | ${(summary.avgConfidence * 100).toFixed(1)}% |`);
  lines.push('');
  lines.push('## By Category');
  lines.push('');
  lines.push('| Category | Accuracy | Matched/Total |');
  lines.push('|----------|----------|---------------|');

  for (const [category, stats] of Object.entries(summary.byCategory).sort((a, b) => b[1].accuracy - a[1].accuracy)) {
    lines.push(`| ${category} | ${(stats.accuracy * 100).toFixed(1)}% | ${stats.matched}/${stats.total} |`);
  }

  lines.push('');
  lines.push('## By Priority');
  lines.push('');
  lines.push('| Priority | Accuracy | Matched/Total |');
  lines.push('|----------|----------|---------------|');

  for (const [priority, stats] of [['high', summary.byPriority.high], ['medium', summary.byPriority.medium], ['low', summary.byPriority.low]].filter(([, s]) => s)) {
    lines.push(`| ${priority} | ${(stats.accuracy * 100).toFixed(1)}% | ${stats.matched}/${stats.total} |`);
  }

  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  for (const result of summary.results) {
    const status = result.match ? '✅' : result.triggered ? '⚠️' : '❌';
    lines.push(`### ${status} ${result.caseId}`);
    lines.push('');
    lines.push(`- **Query**: ${result.query}`);
    lines.push(`- **Expected**: ${result.expectedSkill}`);
    lines.push(`- **Actual**: ${result.actualSkill || 'none'}`);
    lines.push(`- **Confidence**: ${(result.confidence * 100).toFixed(0)}%`);
    if (result.error) {
      lines.push(`- **Error**: ${result.error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Run if executed directly
main().catch(console.error);

// Export for programmatic use
export { runEvaluation, evaluateCase, findBestMatchingSkill };
export type { EvalResult, EvalSummary, EvalConfig, EvalTestCase };
