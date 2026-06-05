# session-system

## Purpose
提供 session 持久化、checkpoint、resume、迁移。

## Requirements

### R-1 Session model
系统 SHALL 定义 Session 包含 id、messages、events、tokenUsage、checkpoints。

### R-2 Checkpoint
系统 SHALL 在每轮 agent 循环后写入 checkpoint。

### R-3 Resume
系统 SHALL 支持从任意 checkpoint 恢复 session。

### R-4 Migration
系统 SHALL 支持跨 UpUp 版本的 session 迁移（schema versioned）。

### R-5 Storage
系统 SHALL 使用 `@upup/storage` 抽象，支持本地 + S3。

## Scenarios

### S-1 Crash recovery
- **GIVEN** CLI 崩溃在第 7 轮
- **WHEN** 用户 `/resume`
- **THEN** 系统 SHALL 从第 7 轮 checkpoint 恢复
