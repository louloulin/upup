# tui-renderer

## Purpose
提供基于 pi-tui 的终端渲染层：组件、keybindings、overlays、状态管理。所有 CLI 交互 SHALL 走 `@upup/tui-renderer`。

## Requirements

### R-1 Component model
系统 SHALL 提供声明式组件：Container、Text、Spacer、Box、ScrollableList、Input、Select、Status、Spinner、Markdown。

### R-2 Keybinding system
系统 SHALL 支持全局 + 局部 keybinding，配置由 `@upup/keybindings` 提供。

### R-3 Render throttling
系统 SHALL 节流 render 请求（30fps），关键事件 SHALL 强制 render。

### R-4 Overlay/modal
系统 SHALL 支持 overlays（确认、选择、文件树）。

### R-5 Theme
系统 SHALL 支持多主题切换，主题色由 `@upup/index-app` 注入。

## Scenarios

### S-1 Multi-line input
- **GIVEN** 用户粘贴多行文本
- **WHEN** 在 Input 组件中输入
- **THEN** SHALL 正确处理 paste events 并保留换行
