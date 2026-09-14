# Example Pi Package

这是一个最小的 Pi Package 示例，不使用旧 Plugin Registry、旧 Plugin SDK 或独立 Skill Registry。

## 本地加载

在 `.pi/settings.json` 中声明本地路径、精确版本和允许来源：

```json
{
  "packages": ["./examples/plugins/example-skill-plugin"],
  "upupPiPackages": {
    "trustedPaths": ["./examples/plugins/example-skill-plugin"],
    "pinnedPackages": { "@example/example-pi-package": "1.0.0" },
    "allowedSources": { "@example/example-pi-package": ["local:example-pi-package"] }
  }
}
```

运行 `bun run check:pi-package-audit` 和 `bun run check:module-boundaries` 验证 manifest、trust 和边界。
