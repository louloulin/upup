# bridge-system

## Purpose
提供外部桥接（Paperclip/WhatsApp/IM），让 UpUp 能跑在这些外部 surface 上。

## Requirements

### R-1 Adapter contract
系统 SHALL 定义统一 BridgeAdapter 接口。

### R-2 Built-in adapters
系统 SHALL 内置 paperclip、whatsapp、telegram 三个 adapter。

### R-3 Message routing
系统 SHALL 把外部消息映射成 UpUp session。

### R-4 Media
系统 SHALL 支持图片/文件/语音的入站和出站。

## Scenarios

### S-1 WhatsApp query
- **GIVEN** 用户在 WhatsApp 发 "分析 NVDA"
- **WHEN** bridge 收到消息
- **THEN** 系统 SHALL 创建 session 跑 agent 并回复
