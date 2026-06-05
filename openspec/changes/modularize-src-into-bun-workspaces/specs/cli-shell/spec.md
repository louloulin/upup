# cli-shell

## Purpose
提供 CLI 命令注册、子命令解析、onboarding、doctor、stdio server。

## Requirements

### R-1 Subcommand routing
系统 SHALL 支持 `upup <subcommand> [args]`，子命令由 `@upup/commands` 注册。

### R-2 Onboarding
系统 SHALL 提供 first-run 引导（API key、provider 选择、.upup 目录创建）。

### R-3 Doctor
系统 SHALL 提供 `upup doctor` 健康检查。

### R-4 Stdio server
系统 SHALL 提供 stdio JSON-RPC server，给 SDK 客户端使用。

### R-5 Config
系统 SHALL 支持 `~/.upup/settings.json` 持久化 model/provider 选择。

## Scenarios

### S-1 First run
- **GIVEN** `~/.upup/` 不存在
- **WHEN** 首次执行 `upup`
- **THEN** onboarding SHALL 引导用户完成 API key 配置
