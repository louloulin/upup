# memory-system

## Purpose
提供 memvid/SQLite/BM25 记忆、归档、跨 session 共享。

## Requirements

### R-1 Multi-tier memory
系统 SHALL 提供 working / episodic / semantic / procedural 四层记忆。

### R-2 BM25 search
系统 SHALL 在所有记忆上提供 BM25 全文检索。

### R-3 Cross-session share
系统 SHALL 支持跨 session 记忆共享（带 ACL）。

### R-4 Archive
系统 SHALL 支持长期归档（memvid 视频 / S3 / 本地冷存）。

### R-5 Privacy
系统 SHALL 支持记忆脱敏和删除（GDPR-style）。

## Scenarios

### S-1 Recall
- **GIVEN** 用户在 session A 提到 "关注 AAPL"
- **WHEN** session B 启动
- **THEN** LLM SHALL 能通过 memory 工具检索到该上下文
