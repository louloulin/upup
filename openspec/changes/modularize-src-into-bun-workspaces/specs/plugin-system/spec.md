# plugin-system

## Purpose
提供第三方插件的 manifest、加载、adapters；UpUp SHALL 作为可扩展 host。

## Requirements

### R-1 Plugin manifest
系统 SHALL 用 JSON + Zod schema 描述插件元数据（name、version、entry、permissions、tools）。

### R-2 Loader
系统 SHALL 支持从 `plugins/` 和 `~/.upup/plugins/` 加载插件。

### R-3 Adapters
系统 SHALL 提供 paperclip、whatsapp、webhook 等内置 adapter。

### R-4 Permission model
系统 SHALL 强制插件权限（读文件 / 写文件 / 调 LLM / 调工具）。

### R-5 Hot-reload
系统 SHALL 支持开发态热重载（watch 模式）。

## Scenarios

### S-1 Install community plugin
- **GIVEN** 用户把插件放入 `~/.upup/plugins/my-plugin/`
- **WHEN** CLI 启动
- **THEN** 插件的工具 SHALL 被注册并暴露给 LLM
