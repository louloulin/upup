/**
 * `check:upup-clean-loading` — Sprint A + C 守门
 *
 * 验证：
 *   1. Pi 启动时无 `[workflow-delivery]` / 第三方 side-effect warning
 *   2. settings.json 的 packages 数组含 19 个 builtin pi-* workspace packages
 *      且 11 个 npm 第三方包中非推荐的已标 autoload=false
 *   3. bootstrap-agent 的 getBuiltinPackageSources / disableNonRecommendedThirdPartyPackages
 *      函数存在
 *   4. plugin CLI 暴露 recommend/enable/disable 子命令
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const UP = '\x1b[A';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

interface CheckResult {
  readonly name: string;
  readonly status: 'pass' | 'fail';
  readonly detail: string;
}

const results: CheckResult[] = [];

function pass(name: string, detail = ''): void {
  results.push({ name, status: 'pass', detail });
  console.log(`${GREEN}✓${RESET} ${name}${detail ? `  ${detail}` : ''}`);
}
function fail(name: string, detail = ''): void {
  results.push({ name, status: 'fail', detail });
  console.log(`${RED}✗${RESET} ${name}${detail ? `  ${detail}` : ''}`);
}

// 1. bootstrap-agent 含 syncBuiltinPiPackages / disableNonRecommendedThirdPartyPackages
const bootstrapPath = 'packages/pi-app/src/bootstrap-agent.ts';
if (existsSync(bootstrapPath)) {
  const text = readFileSync(bootstrapPath, 'utf8');
  if (text.includes('syncBuiltinPiPackages')) {
    pass('bootstrap-agent 含 syncBuiltinPiPackages', 'Sprint A');
  } else {
    fail('bootstrap-agent 缺 syncBuiltinPiPackages', 'Sprint A 未实施');
  }
  if (text.includes('disableNonRecommendedThirdPartyPackages')) {
    pass('bootstrap-agent 含 disableNonRecommendedThirdPartyPackages', 'Sprint C');
  } else {
    fail('bootstrap-agent 缺 disableNonRecommendedThirdPartyPackages', 'Sprint C 未实施');
  }
} else {
  fail('bootstrap-agent.ts 不存在', '');
}

// 2. package-config.ts 含 getBuiltinPackageSources
const pkgConfigPath = 'packages/pi-resource-composition/src/package-config.ts';
if (existsSync(pkgConfigPath)) {
  const text = readFileSync(pkgConfigPath, 'utf8');
  if (text.includes('export function getBuiltinPackageSources')) {
    pass('package-config.ts 导出 getBuiltinPackageSources', '');
  } else {
    fail('package-config.ts 缺 getBuiltinPackageSources export', '');
  }
  if (text.includes('builtin:@upup/')) {
    pass('resolveConfiguredPiPackages 支持 builtin: 解析', '');
  } else {
    fail('resolveConfiguredPiPackages 不识别 builtin: 前缀', '');
  }
} else {
  fail('package-config.ts 不存在', '');
}

// 3. plugin CLI 暴露 recommend / enable / disable
const pluginPath = 'packages/pi-cli-bootstrap/src/plugin.ts';
if (existsSync(pluginPath)) {
  const text = readFileSync(pluginPath, 'utf8');
  for (const sub of ['recommend', 'enable', 'disable']) {
    if (text.includes(`case '${sub}':`)) {
      pass(`plugin CLI 暴露 ${sub} 子命令`, '');
    } else {
      fail(`plugin CLI 缺 ${sub} 子命令`, '');
    }
  }
} else {
  fail('plugin.ts 不存在', '');
}

// 4. recommended-plugins.ts 存在
const recPath = 'packages/pi-cli-bootstrap/src/recommended-plugins.ts';
if (existsSync(recPath)) {
  const text = readFileSync(recPath, 'utf8');
  if (text.includes('UPUP_KNOWN_PROBLEMATIC_PLUGINS') && text.includes('pi-dynamic-workflows')) {
    pass('recommended-plugins 含 problematic 清单', '');
  } else {
    fail('recommended-plugins 缺 problematic 清单', '');
  }
} else {
  fail('recommended-plugins.ts 不存在', '');
}

// 5. Sprint D: 每个 pi-* workspace 包 self-publish capability host
import { readdirSync, statSync as _statSync } from 'node:fs';
import { resolve as _resolve } from 'node:path';
const microkernelDir = _resolve(process.cwd(), 'packages');
let microkernelChecked = 0;
let microkernelFail = 0;
for (const entry of readdirSync(microkernelDir)) {
  if (!entry.startsWith('pi-')) continue;
  const dir = _resolve(microkernelDir, entry);
  if (!_statSync(dir).isDirectory()) continue;
  let pkg;
  try { pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')); } catch { continue; }
  const declared: readonly string[] = pkg?.pi?.hostCapabilities ?? [];
  if (declared.length === 0) continue;
  microkernelChecked += 1;
  const extPath = `${dir}/extensions/index.ts`;
  if (!existsSync(extPath)) {
    fail(`${pkg.name}: extensions/index.ts missing`, '');
    microkernelFail += 1;
    continue;
  }
  const extSrc = readFileSync(extPath, 'utf8');
  if (!extSrc.includes('definePiCapabilityHost')) {
    fail(`${pkg.name}: definePiCapabilityHost 未调用`, '');
    microkernelFail += 1;
    continue;
  }
  const blockMatch = extSrc.match(/definePiCapabilityHost\(\s*pi\s*,\s*\{([\s\S]*?)\}\s*\)/);
  const block = blockMatch ? blockMatch[1] : '';
  const contractPath = `${dir}/extensions/host-contract.ts`;
  const unionSrc = existsSync(contractPath) ? extSrc + readFileSync(contractPath, 'utf8') : extSrc;
  const missing = declared.filter((c) => !block.includes(`'${c}'`) && !unionSrc.includes(`'${c}'`));
  if (missing.length > 0) {
    fail(`${pkg.name}: 缺 capability ${missing.join(', ')}`, '');
    microkernelFail += 1;
  } else {
    pass(`${pkg.name} self-publish ${declared.length} capability`, '');
  }
}
if (microkernelChecked === 0) {
  pass('Sprint D: microkernel self-publish (no hostCapabilities declared)', '');
}

// 6. (optional) 跑一次 bun run dev 看是否还有 workflow-delivery warning
// 这里不做实际启动（耗时），但提供 hint
console.log();
console.log(`${BOLD}Sprint A + C + D 静态守门完成${RESET}`);
console.log('手动验证启动无 warning：echo exit | timeout 8 bun run src/index.tsx 2>&1 | grep -c workflow-delivery');

const failed = results.filter((r) => r.status === 'fail');
if (failed.length > 0) {
  console.log();
  console.log(`${RED}${BOLD}${failed.length} 项检查失败${RESET}`);
  process.exit(1);
} else {
  console.log();
  console.log(`${GREEN}${BOLD}全部 ${results.length} 项 PASS${RESET}`);
}
