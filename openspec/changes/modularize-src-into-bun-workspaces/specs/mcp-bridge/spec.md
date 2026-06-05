# mcp-bridge

## Purpose
实现 Model Context Protocol 客户端、服务端和 stdio 传输，让 UpUp 能作为 MCP host 或 server。

## Requirements

### R-1 MCP client
系统 SHALL 支持 stdio 和 HTTP 两种 transport 连接外部 MCP server。

### R-2 MCP server
系统 SHALL 暴露 stdio MCP server，注册所有内部工具。

### R-3 Tool bridging
系统 SHALL 把外部 MCP 工具以 `mcp__<server>__<tool>` 命名空间注入 LLM。

### R-4 Capability negotiation
系统 SHALL 实现 MCP 协议能力协商（tools、resources、prompts）。

## Scenarios

### S-1 Connect external server
- **GIVEN** 用户配置 external MCP server
- **WHEN** CLI 启动
- **THEN** 外部工具 SHALL 出现在 LLM 可用列表
