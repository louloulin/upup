/**
 * oscript-workspace-verify.ts
 *
 * 验证 Bun Workspace 模块化实现的脚本
 * 验证内容:
 * 1. @upup/types 包
 * 2. @upup/plugin-sdk 包
 * 3. @upup/memory 包
 * 4. @upup/llm 包
 * 5. @upup/hooks 包
 * 6. src/types.ts 使用 @upup/types
 * 7. src/plugins/sdk 使用 @upup/plugin-sdk
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function pass(name: string, message = 'OK') {
  results.push({ name, passed: true, message });
  console.log(`✅ ${name}: ${message}`);
}

function fail(name: string, message: string) {
  results.push({ name, passed: false, message });
  console.log(`❌ ${name}: ${message}`);
}

function checkFile(filePath: string, description: string): boolean {
  if (existsSync(filePath)) {
    pass(description, `Found: ${filePath}`);
    return true;
  } else {
    fail(description, `Not found: ${filePath}`);
    return false;
  }
}

function checkPackage(name: string, pkgPath: string): boolean {
  const pkgJsonPath = join(rootDir, pkgPath, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    fail(`@upup/${name}`, `package.json not found at ${pkgPath}`);
    return false;
  }

  try {
    const content = readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (pkg.name !== `@upup/${name}`) {
      fail(`@upup/${name}`, `Wrong package name: ${pkg.name}`);
      return false;
    }

    if (!pkg.exports) {
      fail(`@upup/${name}`, 'Missing exports field');
      return false;
    }

    // Check dist exists
    const distPath = join(rootDir, pkgPath, 'dist');
    if (!existsSync(distPath)) {
      fail(`@upup/${name}`, 'dist/ directory not found (run build first)');
      return false;
    }

    pass(`@upup/${name}`, `version: ${pkg.version}, exports: ${Object.keys(pkg.exports).length}`);
    return true;
  } catch (e) {
    fail(`@upup/${name}`, `Error: ${e}`);
    return false;
  }
}

function checkSourceImport(filePath: string, importString: string): boolean {
  if (!existsSync(filePath)) {
    fail('Source Import', `File not found: ${filePath}`);
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    if (content.includes(importString)) {
      pass('Source Import', `Found '${importString}' in ${filePath}`);
      return true;
    } else {
      fail('Source Import', `Not found '${importString}' in ${filePath}`);
      return false;
    }
  } catch (e) {
    fail('Source Import', `Error reading: ${e}`);
    return false;
  }
}

function checkWorkspaceConfig(): boolean {
  const pkgJsonPath = join(rootDir, 'package.json');
  const bunfigPath = join(rootDir, 'bunfig.toml');

  if (!existsSync(pkgJsonPath)) {
    fail('Workspace Config', 'package.json not found');
    return false;
  }

  if (!existsSync(bunfigPath)) {
    fail('Workspace Config', 'bunfig.toml not found');
    return false;
  }

  try {
    const content = readFileSync(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (!pkg.workspaces) {
      fail('Workspace Config', 'Missing workspaces field');
      return false;
    }

    if (!Array.isArray(pkg.workspaces) || pkg.workspaces.length === 0) {
      fail('Workspace Config', 'Empty workspaces array');
      return false;
    }

    pass('Workspace Config', `workspaces: ${pkg.workspaces.join(', ')}`);
    return true;
  } catch (e) {
    fail('Workspace Config', `Error: ${e}`);
    return false;
  }
}

function checkDistFiles(pkgPath: string, expectedFiles: string[]): boolean {
  const distPath = join(rootDir, pkgPath, 'dist');
  if (!existsSync(distPath)) {
    return false;
  }

  const files = readdirSync(distPath).filter(f => !f.endsWith('.map'));
  let allFound = true;

  for (const expected of expectedFiles) {
    if (files.some(f => f.includes(expected))) {
      pass(`dist/${expected}`, 'Found');
    } else {
      fail(`dist/${expected}`, 'Not found');
      allFound = false;
    }
  }

  return allFound;
}

// ============ Main Test ============

console.log('\n========================================');
console.log('Bun Workspace 模块化验证');
console.log('========================================\n');

// 1. 检查 Bun Workspace 配置
console.log('\n📦 1. 检查 Workspace 配置');
checkWorkspaceConfig();

// 2. 检查 @upup/types 包
console.log('\n📦 2. 检查 @upup/types 包');
checkPackage('types', 'packages/types');
checkDistFiles('packages/types', ['index.js', 'index.d.ts']);

// 3. 检查 @upup/plugin-sdk 包
console.log('\n📦 3. 检查 @upup/plugin-sdk 包');
checkPackage('plugin-sdk', 'packages/plugin-sdk');
checkDistFiles('packages/plugin-sdk', ['index.js', 'manifest.js']);

// 4. 检查 @upup/memory 包
console.log('\n📦 4. 检查 @upup/memory 包');
checkPackage('memory', 'packages/memory');
checkDistFiles('packages/memory', ['index.js']);

// 5. 检查 @upup/llm 包
console.log('\n📦 5. 检查 @upup/llm 包');
checkPackage('llm', 'packages/llm');
checkDistFiles('packages/llm', ['index.js']);

// 6. 检查 @upup/hooks 包
console.log('\n📦 6. 检查 @upup/hooks 包');
checkPackage('hooks', 'packages/hooks');
checkDistFiles('packages/hooks', ['index.js']);

// 7. 检查 src/types.ts 使用 @upup/types
console.log('\n🔗 7. 检查源码引用');
checkSourceImport(
  join(rootDir, 'src/types.ts'),
  "from '@upup/types'"
);

// 8. 检查 src/plugins/sdk 使用 @upup/plugin-sdk
checkSourceImport(
  join(rootDir, 'src/plugins/sdk/index.ts'),
  "from '@upup/plugin-sdk'"
);

// 9. 检查 bun.lock 存在
console.log('\n🔐 8. 检查 Lock 文件');
checkFile(join(rootDir, 'bun.lock'), 'bun.lock');

// ============ Summary ============
console.log('\n========================================');
console.log('验证结果汇总');
console.log('========================================');

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const total = results.length;

console.log(`\n总计: ${total} 项`);
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`\n成功率: ${((passed / total) * 100).toFixed(1)}%`);

if (failed > 0) {
  console.log('\n失败项:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}: ${r.message}`);
  });
}

console.log('\n========================================\n');

process.exit(failed > 0 ? 1 : 0);
