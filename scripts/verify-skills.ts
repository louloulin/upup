#!/usr/bin/env bun
/**
 * Skills 系统验证脚本
 * 验证所有 skills 核心功能和实际执行
 */

import {
  discoverSkills,
  getSkill,
  initializeSkills,
  createSkillCommand,
  getPromptForCommand,
  executeShellCommandsInPrompt,
  containsShellCommands,
  extractShellCommands,
  getAllSkillCommands,
  getSkillCommand,
  substituteArguments,
} from '../src/skills/index';

console.log('\n' + '='.repeat(80));
console.log('                    SKILLS 系统验证脚本');
console.log('='.repeat(80) + '\n');

// ============================================================================
// 1. Skills 发现测试
// ============================================================================
console.log('📦 [1/6] Skills 发现测试');
console.log('-'.repeat(60));

const skills = discoverSkills();
console.log(`✅ 发现 ${skills.length} 个 Skills`);

for (const skill of skills) {
  console.log(`   - ${skill.name}: ${skill.description.slice(0, 50)}...`);
}

// ============================================================================
// 2. Skill 加载测试
// ============================================================================
console.log('\n📂 [2/6] Skill 加载测试');
console.log('-'.repeat(60));

const firstSkill = skills[0];
if (firstSkill) {
  const loadedSkill = getSkill(firstSkill.name);
  if (loadedSkill) {
    console.log(`✅ 加载 Skill: ${loadedSkill.name}`);
    console.log(`   路径: ${loadedSkill.path}`);
    console.log(`   指令长度: ${loadedSkill.instructions.length} 字符`);
    console.log(`   来源: ${loadedSkill.source}`);
  }
}

// ============================================================================
// 3. Command 创建测试
// ============================================================================
console.log('\n⚙️  [3/6] Command 创建测试');
console.log('-'.repeat(60));

if (firstSkill) {
  const loadedSkill = getSkill(firstSkill.name);
  if (loadedSkill) {
    const cmd = createSkillCommand(loadedSkill);
    console.log(`✅ 创建 Command: ${cmd.name}`);
    console.log(`   类型: ${cmd.type}`);
    console.log(`   skillRoot: ${cmd.skillRoot}`);
    console.log(`   描述: ${cmd.description.slice(0, 60)}...`);
  }
}

// ============================================================================
// 4. getPromptForCommand 测试
// ============================================================================
console.log('\n🔧 [4/6] getPromptForCommand 测试');
console.log('-'.repeat(60));

const dcfSkill = getSkill('dcf-valuation');
if (dcfSkill) {
  const cmd = createSkillCommand(dcfSkill);

  // 测试无参数
  const result1 = await cmd.getPromptForCommand('');
  console.log(`✅ 无参数执行:`);
  console.log(`   返回 ${result1.length} 个 ContentBlock`);
  console.log(`   内容长度: ${result1[0]?.text.length} 字符`);

  // 测试有参数
  const result2 = await cmd.getPromptForCommand('贵州茅台 600519.SH');
  console.log(`\n✅ 带参数执行:`);
  console.log(`   参数: 贵州茅台 600519.SH`);
  console.log(`   内容包含参数: ${result2[0]?.text.includes('贵州茅台 600519.SH')}`);

  // 验证 ${CLAUDE_SKILL_DIR} 替换
  console.log(`   ${'{CLAUDE_SKILL_DIR}'} 替换: ${!result2[0]?.text.includes('${CLAUDE_SKILL_DIR}')}`);

  // 验证 ${CLAUDE_SESSION_ID} 替换
  console.log(`   ${'{CLAUDE_SESSION_ID}'} 替换: ${!result2[0]?.text.includes('${CLAUDE_SESSION_ID}')}`);
} else {
  console.log('⚠️  DCF Skill 未找到');
}

// ============================================================================
// 5. Shell 命令执行测试
// ============================================================================
console.log('\n🐚 [5/6] Shell 命令执行测试');
console.log('-'.repeat(60));

// 测试 inline 语法
const testInline = 'Value: !`echo "hello-world"`';
if (containsShellCommands(testInline)) {
  const cmds = extractShellCommands(testInline);
  console.log(`✅ 检测到 Shell 命令: ${cmds.length} 个`);
  console.log(`   命令: ${cmds[0]}`);

  const result = await executeShellCommandsInPrompt(testInline, undefined, '/test');
  console.log(`   执行结果: ${result}`);
  console.log(`   结果正确: ${result.includes('hello-world')}`);
}

// 测试 block 语法
const testBlock = '```!\necho "block-test"\n```';
if (containsShellCommands(testBlock)) {
  const cmds = extractShellCommands(testBlock);
  console.log(`\n✅ Block 语法检测: ${cmds.length} 个命令`);

  const result = await executeShellCommandsInPrompt(testBlock, undefined, '/test');
  console.log(`   执行结果: ${result.trim()}`);
  console.log(`   结果正确: ${result.includes('block-test')}`);
}

// ============================================================================
// 6. initializeSkills 测试
// ============================================================================
console.log('\n🚀 [6/6] initializeSkills 测试');
console.log('-'.repeat(60));

const count = await initializeSkills();
console.log(`✅ 初始化 ${count} 个 Skills`);

const allCmds = getAllSkillCommands();
console.log(`   注册命令: ${allCmds.length} 个`);

// 测试 getSkillCommand
const dcfCmd = getSkillCommand('dcf-valuation');
if (dcfCmd) {
  console.log(`   getSkillCommand("dcf-valuation"): ✅ 找到`);
} else {
  console.log(`   getSkillCommand("dcf-valuation"): ❌ 未找到`);
}

// ============================================================================
// 7. 参数替换测试
// ============================================================================
console.log('\n📝 [额外] 参数替换测试');
console.log('-'.repeat(60));

const template = 'Stock: {{args}}, Price: {{price}}, Target: {{target}}';
const result = substituteArguments(template, '贵州茅台', true, ['price', 'target']);
console.log(`✅ 参数替换测试:`);
console.log(`   模板: ${template}`);
console.log(`   参数: 贵州茅台`);
console.log(`   结果: ${result}`);

// ============================================================================
// 总结
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('                         验证完成 ✅');
console.log('='.repeat(80) + '\n');
