# index-app

## Purpose
提供顶层入口（src/index.tsx + src/run.ts），把 cli / bundled-runner / stdio server 串起来。

## Requirements

### R-1 Entry point
系统 SHALL 暴露 `bun run start` 调起 CLI 入口。

### R-2 Bundled runner
系统 SHALL 提供 bundled runner 用于单文件分发。

### R-3 Stdio server
系统 SHALL 支持 `upup stdio` 启动 stdio JSON-RPC server。

### R-4 No business logic
系统 SHALL 不在入口写业务；只做 wiring。

### R-5 Env loading
系统 SHALL 在入口最早阶段加载 .env。

## Scenarios

### S-1 Default start
- **GIVEN** `bun run start`
- **WHEN** 执行
- **THEN** CLI SHALL 启动并进入 REPL
