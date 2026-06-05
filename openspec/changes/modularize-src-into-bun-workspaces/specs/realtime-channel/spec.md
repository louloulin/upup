# realtime-channel

## Purpose
提供实时通道（WebSocket/SSE/广播），让多个客户端能订阅 agent 事件流。

## Requirements

### R-1 Transports
系统 SHALL 支持 WebSocket、SSE、长轮询三种 transport。

### R-2 Multi-channel
系统 SHALL 支持按 session、agent、user 维度分通道广播。

### R-3 Backpressure
系统 SHALL 在客户端消费慢时自动 buffer 或丢弃最旧事件。

### R-4 Auth
系统 SHALL 对所有实时连接做 auth（API key / session token）。

## Scenarios

### S-1 Multi-client subscribe
- **GIVEN** 两个 client 订阅同一 session
- **WHEN** agent 发出 tool_start 事件
- **THEN** 两个 client SHALL 同时收到
