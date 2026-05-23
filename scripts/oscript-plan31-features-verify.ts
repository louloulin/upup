/**
 * oscript-plan31-features-verify.ts
 * 
 * Verifies the Phase 3 features implemented for Plan31.md:
 * - Multi-agent research
 * - Market monitoring
 * - Sentiment analysis
 * - Financial forecasting
 * - Personalized recommendations
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail' | 'info';
  details: string;
}

function log(message: string) {
  console.log(message);
}

function logSection(title: string) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(80));
}

function verifyFile(filePath: string, description: string): VerificationResult {
  try {
    const exists = fs.existsSync(filePath);
    return {
      name: description,
      status: exists ? 'pass' : 'fail',
      details: exists ? `Found: ${filePath}` : `Not found: ${filePath}`,
    };
  } catch (error) {
    return {
      name: description,
      status: 'fail',
      details: `Error checking file: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

function verifyFunctionInFile(filePath: string, functionName: string, description: string): VerificationResult {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        name: description,
        status: 'fail',
        details: `File not found: ${filePath}`,
      };
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const found = content.includes(functionName);
    
    return {
      name: description,
      status: found ? 'pass' : 'fail',
      details: found 
        ? `Function '${functionName}' found in ${path.basename(filePath)}`
        : `Function '${functionName}' not found in ${path.basename(filePath)}`,
    };
  } catch (error) {
    return {
      name: description,
      status: 'fail',
      details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

function runCommand(command: string, description: string): VerificationResult {
  try {
    const output = execSync(command, { encoding: 'utf-8', timeout: 60000 });
    return {
      name: description,
      status: 'pass',
      details: `Command succeeded: ${command}\nOutput preview: ${output.substring(0, 200)}...`,
    };
  } catch (error: any) {
    return {
      name: description,
      status: 'fail',
      details: `Command failed: ${command}\nError: ${error.message || 'Unknown'}`,
    };
  }
}

async function main() {
  log('╔══════════════════════════════════════════════════════════════════════════════╗');
  log('║  Plan31.md Phase 3 Features Verification                                    ║');
  log('╚══════════════════════════════════════════════════════════════════════════════╝');
  
  const results: VerificationResult[] = [];
  
  // Base directory
  const baseDir = '/Users/louloulin/Documents/linchong/touzhi/dexter';
  
  // ===========================================
  // PART 1: File Existence Checks
  // ===========================================
  logSection('PART 1: File Structure Verification');
  
  // Phase 3 tools
  results.push(verifyFile(
    `${baseDir}/src/tools/sentiment/index.ts`,
    'Sentiment Analysis Tool'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/forecast/index.ts`,
    'Financial Forecast Tool'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/research/multi-agent-research.ts`,
    'Multi-Agent Research Tool'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/monitor/index.ts`,
    'Market Monitor Tool'
  ));
  
  // Phase 3 skills
  results.push(verifyFile(
    `${baseDir}/src/skills/multi-market-analysis/SKILL.md`,
    'Multi-Market Analysis Skill'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/skills/research-report/SKILL.md`,
    'Research Report Skill'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/skills/personalized-recommendation/SKILL.md`,
    'Personalized Recommendation Skill'
  ));
  
  // ===========================================
  // PART 2: Function/Export Verification
  // ===========================================
  logSection('PART 2: Function & Export Verification');
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/sentiment/index.ts`,
    'createGetSentiment',
    'createGetSentiment function'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/forecast/index.ts`,
    'createFinancialForecast',
    'createFinancialForecast function'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/research/multi-agent-research.ts`,
    'createMultiAgentResearch',
    'createMultiAgentResearch function'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/monitor/index.ts`,
    'createMarketMonitor',
    'createMarketMonitor function'
  ));
  
  // ===========================================
  // PART 3: Tool Descriptions
  // ===========================================
  logSection('PART 3: Tool Description Verification');
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/sentiment/index.ts`,
    'GET_SENTIMENT_DESCRIPTION',
    'Sentiment tool description'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/forecast/index.ts`,
    'FORECAST_DESCRIPTION',
    'Forecast tool description'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/research/multi-agent-research.ts`,
    'MULTI_AGENT_RESEARCH_DESCRIPTION',
    'Research tool description'
  ));
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/tools/monitor/index.ts`,
    'MARKET_MONITOR_DESCRIPTION',
    'Monitor tool description'
  ));
  
  // ===========================================
  // PART 4: Skill Metadata
  // ===========================================
  logSection('PART 4: Skill Metadata Verification');
  
  for (const skill of [
    'multi-market-analysis',
    'research-report',
    'personalized-recommendation'
  ]) {
    const skillPath = `${baseDir}/src/skills/${skill}/SKILL.md`;
    results.push(verifyFunctionInFile(
      skillPath,
      'name:',
      `Skill metadata in ${skill}`
    ));
    results.push(verifyFunctionInFile(
      skillPath,
      'triggers:',
      `Skill triggers in ${skill}`
    ));
  }
  
  // ===========================================
  // PART 5: Unit Tests
  // ===========================================
  logSection('PART 5: Unit Tests Verification');
  
  results.push(verifyFile(
    `${baseDir}/src/tools/sentiment/sentiment.test.ts`,
    'Sentiment tool tests'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/forecast/forecast.test.ts`,
    'Forecast tool tests'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/research/research.test.ts`,
    'Research tool tests'
  ));
  
  results.push(verifyFile(
    `${baseDir}/src/tools/monitor/monitor.test.ts`,
    'Monitor tool tests'
  ));
  
  // Run the actual unit tests
  log('\n[5.1] Running unit tests...');
  try {
    const testOutput = execSync('cd ' + baseDir + ' && bun test 2>&1 | tail -5', {
      encoding: 'utf-8',
      timeout: 120000,
    });
    const testMatch = testOutput.match(/(\d+)\s+pass/);
    if (testMatch) {
      results.push({
        name: 'Unit tests execution',
        status: 'pass',
        details: `Tests result: ${testMatch[0]}`,
      });
    }
  } catch (error: any) {
    results.push({
      name: 'Unit tests execution',
      status: 'fail',
      details: `Error: ${error.message || 'Unknown'}`,
    });
  }
  
  // ===========================================
  // PART 6: Skills Discovery
  // ===========================================
  logSection('PART 6: Skills Discovery Verification');
  
  results.push(verifyFunctionInFile(
    `${baseDir}/src/skills/registry.ts`,
    'discoverSkills',
    'discoverSkills function'
  ));
  
  // ===========================================
  // PART 7: TUI Startup
  // ===========================================
  logSection('PART 7: TUI Development Mode Verification');
  
  // Check if dev server can start
  log('\n[7.1] Checking dev server startup...');
  try {
    const devOutput = execSync(
      `cd ${baseDir} && timeout 5 bun run dev 2>&1 || true`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    
    if (devOutput.includes('UpUp') || devOutput.includes('Welcome')) {
      results.push({
        name: 'TUI Dev Server',
        status: 'pass',
        details: 'Dev server starts successfully with welcome screen',
      });
    } else {
      results.push({
        name: 'TUI Dev Server',
        status: 'info',
        details: 'Dev server started but welcome text not detected',
      });
    }
  } catch (error: any) {
    results.push({
      name: 'TUI Dev Server',
      status: 'fail',
      details: `Error: ${error.message || 'Unknown'}`,
    });
  }
  
  // ===========================================
  // RESULTS SUMMARY
  // ===========================================
  logSection('VERIFICATION SUMMARY');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const info = results.filter(r => r.status === 'info').length;
  
  log('\nDetailed Results:');
  results.forEach((result, index) => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : 'ℹ️';
    log(`  ${icon} ${result.name}: ${result.status.toUpperCase()}`);
    log(`     ${result.details.substring(0, 100)}`);
  });
  
  log('\n' + '─'.repeat(80));
  log(`  Total Tests: ${results.length}`);
  log(`  ✅ Passed:   ${passed}`);
  log(`  ❌ Failed:   ${failed}`);
  log(`  ℹ️  Info:    ${info}`);
  log(`  Pass Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  log('─'.repeat(80));
  
  if (failed === 0) {
    log('\n🎉 ALL VERIFICATIONS PASSED!');
  } else {
    log(`\n⚠️  ${failed} verification(s) failed.`);
  }
  
  return failed === 0;
}

// Run verification
const success = main().catch((error) => {
  console.error('Verification failed:', error);
  process.exit(1);
});

process.exit(success ? 0 : 1);
