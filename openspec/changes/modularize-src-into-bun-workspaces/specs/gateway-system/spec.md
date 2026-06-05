# gateway-system

## Purpose
提供通道网关、消息路由、WhatsApp/Webhook。

## Requirements

### R-1 Channel registry
系统 SHALL 维护 channel 列表（whatsapp、telegram、webhook、stdio）。

### R-2 Routing
系统 SHALL 按 channel + user 把消息路由到对应 session。

### R-3 Outbound
系统 SHALL 支持把 agent 回复按 channel 序列化（文本、按钮、卡片）。

### R-4 Reconnect
系统 SHALL 断线自动重连，重连后 SHALL resync 未送达消息。

## Scenarios

### S-1 WhatsApp webhook
- **GIVEN** WhatsApp webhook 收到消息
- **WHEN** gateway 处理
- **THEN** 系统 SHALL 路由到正确 session 并返回 reply
