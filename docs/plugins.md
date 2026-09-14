# Pi Packages

UpUp 不再维护独立的旧 Plugin Registry、Plugin SDK 或运行时 Adapter。扩展能力必须作为 **Pi Package** 交付，并通过 `package.json` 的 `pi` manifest 接入同一个 Pi `AgentSession`。

## Package 结构

```text
my-package/
├── package.json
├── extensions/index.ts
├── skills/my-skill/SKILL.md
├── prompts/report.md
├── workflows/invest.md
├── policies/safety.md
└── evals/contract.json
```

最小 manifest：

```json
{
  "name": "@example/my-package",
  "version": "1.0.0",
  "type": "module",
  "pi": {
    "contract": "upup.pi.runtime.v1",
    "source": "local:my-package",
    "trust": { "mode": "trusted", "filesystem": false, "network": false },
    "lifecycle": { "scope": "session" },
    "extensions": ["./extensions"],
    "skills": ["./skills/my-skill"],
    "prompts": ["./prompts/report.md"],
    "workflows": ["./workflows/invest.md"],
    "policies": ["./policies/safety.md"],
    "evals": ["./evals/contract.json"]
  }
}
```

## Extension

`extensions/index.ts` 导出 Pi extension factory。工具只能通过 `pi.registerTool()` 注册，权限、sandbox、证据和审计由 Pi Package host contract 决定。包不创建第二个 Agent loop、Tool Registry 或 Skill Registry。

## Trust 与加载

项目包通过 `.pi/settings.json` 显式配置：

```json
{
  "packages": ["./packages/my-package"],
  "upupPiPackages": {
    "trustedPaths": ["./packages/my-package"],
    "pinnedPackages": { "@example/my-package": "1.0.0" },
    "allowedSources": { "@example/my-package": ["local:my-package"] }
  }
}
```

默认包由 `@upup/pi-resource-composition` 提供，包发现、manifest 校验、资源读取、依赖谈判、trust、reload 和 lifecycle 都在该边界完成。高风险工具必须在 Package policy 中声明并默认进入 deny/approval；真实交易、通知、凭证读取和文件写入不因 prompt 文本而获得权限。

## 验证

```bash
bun run typecheck
bun run check:pi-packages
bun run check:pi-package-audit
bun run check:pi-deletion-audit
bun run check:module-boundaries
bun run build
```

删除或迁移 Package 前，必须确认生产消费者为零，并保留必要的 Session/config 一次性迁移；不得恢复旧 Plugin Registry 或全局 capability fallback。
