# Pi Skills

UpUp 的技能是 Pi Package resource，不再由独立的 Skill Registry、目录扫描器或旧 `@upup/skills` 包发现。

## Skill resource

技能放在某个 Pi Package 的 manifest 路径下：

```text
packages/pi-investment-workflow/
├── package.json
└── skills/investment-workflow/SKILL.md
```

`SKILL.md` 保持 YAML frontmatter 和 Markdown 指令。Package manifest 通过 `pi.skills` 暴露 resource；Pi `DefaultResourceLoader` 负责发现、解析、trust、reload 和按 AgentSpec allowlist 过滤。技能不自行注册工具，也不能绕过 capability/policy。

## `/invest`

`/invest` 是唯一投研状态机：

```text
detect → plan → execute → verify → report
```

`@upup/pi-investment-workflow` 提供工作流，金融数据和分析能力分别由对应 Pi Package extension 提供。每个阶段必须保留可恢复 Session 状态、工具调用记录、证据来源和风险审计。

## 新增技能

1. 选择已有的领域 Package；没有清晰边界时才新增 Package。
2. 在 `skills/<name>/SKILL.md` 编写资源，并在 `package.json` 的 `pi.skills` 声明。
3. 在 `pi.policies` 声明数据、风险和副作用约束。
4. 为 Package 添加独立合同测试和 eval resource。
5. 运行：

```bash
bun run typecheck
bun run check:pi-packages
bun run check:pi-package-audit
bun run check:pi-deletion-audit
bun test --cwd packages/<package>
```

禁止新增：`src/skills`、Skill Registry、动态全局注册表、重复 command discovery，或从 root `src` 私有路径加载技能。
