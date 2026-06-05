# services-core

## Purpose
提供应用服务层、context wiring、DI 容器。

## Requirements

### R-1 Service registry
系统 SHALL 提供 ServiceRegistry，所有 runtime 依赖 SHALL 通过 registry 解析。

### R-2 Context
系统 SHALL 暴露 AppContext（config、logger、telemetry、storage、llm）。

### R-3 Lifecycle
系统 SHALL 支持 service init / start / stop / dispose。

### R-4 No ambient globals
系统 SHALL 禁止直接 import 全局 config；所有依赖 SHALL 显式注入。

## Scenarios

### S-1 Service init
- **GIVEN** CLI 启动
- **WHEN** AppContext 初始化
- **THEN** 所有 service SHALL 按依赖序完成 init
