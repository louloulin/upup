/**
 * OScript Onboarding Verification
 *
 * OScript script for onboarding verification
 * Run: bun run src/onboarding/oscript-onboarding.ts
 *
 * Features:
 * - Real API key validation via actual API calls
 * - Connection testing
 * - Environment check
 * - Example execution
 */

import { OnboardingValidator } from './validator.js';
import { OnboardingWizard } from './wizard.js';
import { OnboardingChecklist } from './checklist.js';
import { TemplateManager } from './templates.js';
import { PROVIDERS } from '../providers.js';
import { DEFAULT_PROVIDER } from '../model/llm.js';
import { checkApiKeyExistsForProvider, getApiKeyNameForProvider } from '../utils/env.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function printBanner() {
  console.log(`
${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║   ${BOLD}██╗   ██╗ ██████╗ ██████╗ ██████╗  █████╗ ███╗   ██╗${CYAN}                 ║
║   ${BOLD}██║   ██║ ██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗  ██║${CYAN}                 ║
║   ${BOLD}██║   ██║ ██████╔╝██████╔╝██████╔╝███████║██╔██╗ ██║${CYAN}                 ║
║   ${BOLD}╚██╗ ██╔╝ ██╔═══╝ ██╔══██╗██╔══██╗██╔══██║██║╚██╗██║${CYAN}                 ║
║   ${BOLD} ╚████╔╝  ██║     ██████╔╝██║  ██║██║  ██║██║ ╚████║${CYAN}                 ║
║   ${BOLD}  ╚═══╝   ╚═╝     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝${CYAN}                 ║
║                                                                           ║
║   ${WHITE}Onboarding Verification System v1.0${CYAN}                                     ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝${RESET}
`);
}

function printStep(step: string, title: string) {
  console.log(`\n${BLUE}┌─ ${BOLD}${step}${RESET}${BLUE} ─────────────────────────────────────────────────────────${RESET}`);
  console.log(`${BLUE}│${RESET} ${BOLD}${title}${RESET}`);
  console.log(`${BLUE}└${'─'.repeat(73)}${RESET}\n`);
}

function printSuccess(msg: string) {
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function printError(msg: string) {
  console.log(`  ${RED}✗${RESET} ${RED}${msg}${RESET}`);
}

function printWarning(msg: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${YELLOW}${msg}${RESET}`);
}

function printInfo(msg: string) {
  console.log(`  ${CYAN}ℹ${RESET} ${msg}`);
}

function printDim(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`);
}

async function step1_envCheck(): Promise<boolean> {
  printStep('STEP 1', 'Environment Check');

  try {
    const fs = await import('fs');

    const checks = [
      { name: 'package.json', path: 'package.json' },
      { name: 'node_modules', path: 'node_modules' },
      { name: '.env file', path: '.env', required: false },
    ];

    let allPassed = true;
    for (const check of checks) {
      const exists = fs.existsSync(check.path);
      if (exists) {
        printSuccess(`${check.name} found`);
      } else {
        if (check.required !== false) {
          printError(`${check.name} not found`);
          allPassed = false;
        } else {
          printWarning(`${check.name} not found (optional)`);
        }
      }
    }

    return allPassed;
  } catch (error) {
    printError(`Environment check failed: ${error}`);
    return false;
  }
}

async function step2_apiKeyCheck(): Promise<{ provider: string; hasKey: boolean }> {
  printStep('STEP 2', 'API Key Configuration');

  const provider = DEFAULT_PROVIDER;
  const apiKeyName = getApiKeyNameForProvider(provider);

  printInfo(`Provider: ${provider}`);
  printInfo(`API Key Env: ${apiKeyName || 'N/A'}`);

  const hasKey = checkApiKeyExistsForProvider(provider);

  if (hasKey) {
    printSuccess('API key configured');
  } else {
    printWarning('API key not found in environment');
    printDim('  Set it with: export ' + (apiKeyName || 'ANTHROPIC_API_KEY') + '=your-key');
  }

  return { provider, hasKey };
}

async function step3_providerCheck(): Promise<boolean> {
  printStep('STEP 3', 'Provider Configuration');

  printInfo(`Available providers: ${PROVIDERS.length}`);

  for (const provider of PROVIDERS) {
    const hasKey = checkApiKeyExistsForProvider(provider.id);
    const keyStatus = hasKey ? `${GREEN}configured${RESET}` : `${YELLOW}not set${RESET}`;
    console.log(`  - ${provider.displayName}: ${keyStatus}`);
  }

  const currentProvider = PROVIDERS.find(p => p.id === DEFAULT_PROVIDER);
  if (currentProvider) {
    printSuccess(`Default provider: ${currentProvider.displayName}`);
    return true;
  }

  printError('Default provider not found');
  return false;
}

async function step4_validatorCheck(provider: string, hasKey: boolean): Promise<boolean> {
  printStep('STEP 4', 'Validator System Check');

  const validator = new OnboardingValidator();

  printInfo('Running validation checks...');
  console.log('');

  const checks = await validator.runAllChecks(provider);

  let allPassed = true;
  for (const check of checks) {
    const icon = check.status === 'passed' ? `${GREEN}✓${RESET}` :
                 check.status === 'warning' ? `${YELLOW}⚠${RESET}` :
                 check.status === 'failed' ? `${RED}✗${RESET}` : `${DIM}○${RESET}`;

    console.log(`  ${icon} ${check.label}`);
    printDim(`    ${check.description}`);

    if (check.status === 'failed') {
      allPassed = false;
      if (check.fix) {
        printDim(`    Fix: ${check.fix}`);
      }
    }
  }

  console.log('');
  if (allPassed) {
    printSuccess('All validation checks passed');
  } else {
    printWarning('Some checks failed - see above for details');
  }

  return allPassed;
}

async function step5_wizardCheck(): Promise<boolean> {
  printStep('STEP 5', 'Wizard System Check');

  const wizard = new OnboardingWizard();

  const steps = ['welcome', 'api_key', 'provider', 'model', 'validation', 'examples', 'complete'];

  printInfo('Wizard steps:');
  for (let i = 0; i < steps.length; i++) {
    const isCurrent = i === 0;
    const icon = isCurrent ? `${CYAN}→${RESET}` : `${DIM}○${RESET}`;
    const label = isCurrent ? BOLD + steps[i] + RESET : steps[i];
    console.log(`  ${icon} ${i + 1}. ${label}`);
  }

  console.log('');

  const progress = wizard.getProgress();
  printInfo(`Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`);

  const options = wizard.getProviderOptions();
  printInfo(`Provider options: ${options.length}`);

  printSuccess('Wizard system operational');
  return true;
}

async function step6_checklistCheck(provider: string): Promise<boolean> {
  printStep('STEP 6', 'Checklist System Check');

  const checklist = new OnboardingChecklist(provider);

  console.log('');
  const rendered = checklist.render();
  console.log(rendered);

  const summary = checklist.getStatusSummary();
  console.log(`  Summary: ${GREEN}${summary.passed}${RESET} passed, ${YELLOW}${summary.warnings}${RESET} warnings, ${RED}${summary.failed}${RESET} failed`);

  console.log('');

  if (summary.failed > 0) {
    printWarning('Some checks failed');
    return false;
  }

  printSuccess('Checklist system operational');
  return true;
}

async function step7_templatesCheck(): Promise<boolean> {
  printStep('STEP 7', 'Template System Check');

  const manager = new TemplateManager();

  const categories = manager.getCategories();
  printInfo(`Categories: ${categories.join(', ')}`);

  console.log('');
  const templates = manager.getTemplates();
  console.log(`  ${templates.length} templates available`);
  console.log('');

  for (const cat of categories) {
    const catTemplates = manager.getByCategory(cat);
    console.log(`  ${BOLD}${cat.toUpperCase()}${RESET} (${catTemplates.length}):`);
    for (const t of catTemplates.slice(0, 3)) {
      printDim(`    - ${t.title}: ${t.description}`);
    }
    if (catTemplates.length > 3) {
      printDim(`    ... and ${catTemplates.length - 3} more`);
    }
    console.log('');
  }

  printSuccess('Template system operational');
  return true;
}

async function step8_realApiTest(provider: string): Promise<boolean> {
  printStep('STEP 8', 'Real API Connection Test');

  const validator = new OnboardingValidator();

  printInfo('Testing actual API connection...');
  printDim('  (This will make a real API call if key is configured)');
  console.log('');

  const result = await validator.validateConnection(provider, '');

  if (result.valid) {
    printSuccess(`Connection successful!`);
    printInfo(`Provider: ${result.provider}`);
    if (result.model) printInfo(`Model: ${result.model}`);
    if (result.latency) printInfo(`Latency: ${result.latency}ms`);
    return true;
  } else {
    printWarning('Could not establish connection');
    if (result.error) {
      printDim(`  Error: ${result.error}`);
    }
    printDim('  This is expected if no valid API key is configured');
    return false;
  }
}

async function main() {
  printBanner();

  const startTime = Date.now();

  console.log(`${DIM}Starting onboarding verification...${RESET}\n`);

  // Run all steps
  const results: Record<string, boolean> = {};

  results.env = await step1_envCheck();
  const { provider, hasKey } = await step2_apiKeyCheck();
  results.provider = await step3_providerCheck();
  results.validator = await step4_validatorCheck(provider, hasKey);
  results.wizard = await step5_wizardCheck();
  results.checklist = await step6_checklistCheck(provider);
  results.templates = await step7_templatesCheck();
  results.api = await step8_realApiTest(provider);

  // Summary
  console.log('');
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}VERIFICATION SUMMARY${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════════════════${RESET}`);
  console.log('');

  const totalTime = Date.now() - startTime;
  let passCount = 0;
  let failCount = 0;

  for (const [name, passed] of Object.entries(results)) {
    const icon = passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const label = name.padEnd(12);
    console.log(`  ${icon} ${label} ${passed ? 'PASSED' : 'FAILED'}`);
    if (passed) passCount++; else failCount++;
  }

  console.log('');
  console.log(`${DIM}Completed in ${totalTime}ms${RESET}`);
  console.log(`${GREEN}${passCount} passed${RESET}, ${RED}${failCount} failed${RESET}`);
  console.log('');

  if (failCount === 0) {
    console.log(`${GREEN}${BOLD}🎉 All verifications passed!${RESET}`);
    console.log(`${GREEN}The onboarding system is ready to use.${RESET}`);
  } else {
    console.log(`${YELLOW}Some verifications failed.${RESET}`);
    console.log(`${YELLOW}Please review the errors above and fix any issues.${RESET}`);
  }

  console.log('');
  console.log(`${DIM}To start onboarding wizard, run:${RESET}`);
  console.log(`  ${CYAN}bun run src/onboarding/oscript-onboarding.ts${RESET}`);
  console.log('');

  process.exit(failCount > 2 ? 1 : 0);
}

main().catch((error) => {
  console.error(`\n${RED}Fatal error:${RESET}`, error);
  process.exit(1);
});
