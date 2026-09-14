/**
 * Built-in Bundled Skills
 *
 * These skills ship with the CLI and are registered at startup.
 * They provide core functionality without requiring file-based SKILL.md files.
 *
 * Reference: Loucode's src/skills/bundled/ pattern
 */

import type { BundledSkillDefinition } from '@upup/skills';

/**
 * Built-in skill definitions
 */
export const BUILTIN_SKILLS: Omit<BundledSkillDefinition, 'path' | 'source'>[] = [
  {
    name: 'health',
    description: '检查代码质量：运行类型检查、lint、测试，计算综合评分',
    instructions: `# Health Check Skill

运行项目的质量检查工具并计算综合评分。

## 检查项

### 1. TypeScript 类型检查
运行 npm run typecheck 或 tsc --noEmit

### 2. Lint 检查
运行 npm run lint 或 eslint

### 3. 测试
运行 npm test 或 bun test

### 4. 死代码检测
检查未使用的导出、变量、函数

## 输出格式

=== Health Check ===

TypeScript: {{pass}}/{{fail}}
Linting: {{pass}}/{{warn}}/{{fail}}
Tests: {{pass}}/{{fail}}
Dead Code: {{count}} issues

Overall Score: {{score}}/10

## 执行建议

- 并行运行多个检查以提高速度
- 只报告失败项的详细信息
- 提供修复建议`,
    userInvocable: true,
    argumentHint: '[--full]',
    whenToUse: '检查代码质量、运行测试套件、验证类型安全',
  },

  {
    name: 'checkpoint',
    description: '保存工作状态检查点：记录git状态、决策、剩余工作',
    instructions: `# Checkpoint Skill

保存当前工作的检查点状态。

## 快照内容

### Git 状态
- 当前分支
- 未提交的更改
- 与主分支的差异

### 决策记录
- 已做出的重要决定
- 架构选择
- 已完成的变更

### 剩余工作
- 待办事项
- 已知问题
- 后续步骤

## 使用方式

/checkpoint
/checkpoint --save "完成了用户认证模块"

## 存储位置

检查点存储在 .upup/checkpoints/ 目录`,
    userInvocable: true,
    argumentHint: '[--save <message>]',
    whenToUse: '保存进度、切换上下文、准备交接',
  },

  {
    name: 'review',
    description: '代码审查：分析PR/分支变更，检查安全性，性能、可维护性',
    instructions: `# Code Review Skill

对代码变更进行系统性审查。

## 审查维度

### 1. 安全性
- SQL注入
- XSS漏洞
- 敏感信息泄露
- 权限检查

### 2. 性能
- N+1查询
- 不必要的重渲染
- 大数据集处理
- 缓存使用

### 3. 可维护性
- 代码重复
- 命名规范
- 注释质量
- 测试覆盖

### 4. 最佳实践
- 错误处理
- 日志记录
- 配置管理

## 输出格式

=== Code Review ===

安全性: {{score}}/10
性能: {{score}}/10
可维护性: {{score}}/10
最佳实践: {{score}}/10

问题列表:
- [{{severity}}] {{file}}:{{line}} - {{issue}}
  建议: {{fix}}

总体评价: {{overall}}

## 执行方式

- 如果有 PR，使用 PR 差异
- 如果有分支，使用分支与主分支的差异
- 如果有未提交更改，先展示差异`,
    userInvocable: true,
    argumentHint: '[pr-number|/branch-name]',
    whenToUse: '审查PR、检查分支变更、代码质量评估',
  },

  {
    name: 'retro',
    description: '工程回顾：分析提交历史，工作模式、代码质量趋势',
    instructions: `# Retro Skill

工程回顾分析工具。

## 分析维度

### 1. 提交模式
- 提交频率
- 提交大小
- 分支策略

### 2. 工作模式
- 任务完成速度
- 迭代周期
- 团队协作模式

### 3. 代码质量
- 测试覆盖率趋势
- 错误率变化
- 重构频率

### 4. 技术债务
- 新增依赖
- 配置变更
- 遗留代码

## 输出格式

=== Engineering Retro ===

周期: {{start}} - {{end}}

提交统计:
- 总提交: {{count}}
- 日均: {{daily}}
- 峰值: {{peak}}

代码质量:
- 测试覆盖: {{coverage}}%
- 错误率: {{errorRate}}%
- 重构次数: {{refactorCount}}

建议:
1. {{suggestion1}}
2. {{suggestion2}}
3. {{suggestion3}}`,
    userInvocable: true,
    argumentHint: '[--period <days>]',
    whenToUse: '周回顾、迭代总结、团队分析',
  },

  {
    name: 'plan',
    description: '计划审查：分析任务计划，检查完整性、可行性、风险',
    instructions: `# Plan Review Skill

审查和优化任务计划。

## 审查维度

### 1. 完整性
- 所有需求是否覆盖
- 边界情况
- 错误处理

### 2. 可行性
- 技术可行性
- 时间估计
- 资源需求

### 3. 风险
- 已知风险
- 未知风险
- 依赖项

### 4. 优先级
- 关键路径
- 阻塞项
- 交付顺序

## 交互式问题

审查计划时会问：
1. 这个计划的目标是什么？
2. 谁是主要受益者？
3. 成功的标准是什么？
4. 有哪些约束条件？

## 输出格式

=== Plan Review ===

完整性: {{score}}/10
可行性: {{score}}/10
风险评估: {{score}}/10
优先级: {{score}}/10

改进建议:
{{suggestions}}

下一步:
{{next_steps}}`,
    userInvocable: true,
    argumentHint: '<plan-content>',
    whenToUse: '审查计划、改进流程、识别风险',
  },
];

/**
 * Register all built-in skills
 */
export function registerBuiltinSkills(): void {
  // Dynamic import for ESM compatibility
  import('./registry.js').then(({ registerBundledSkill }) => {
    for (const skill of BUILTIN_SKILLS) {
      registerBundledSkill({
        ...skill,
        path: `builtin:${skill.name}`,
        source: 'builtin',
      } as BundledSkillDefinition);
    }
  });
}
