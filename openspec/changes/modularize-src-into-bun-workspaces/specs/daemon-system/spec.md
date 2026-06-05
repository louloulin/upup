# daemon-system

## Purpose
提供后台守护进程、健康检查、worker 池。

## Requirements

### R-1 Daemon lifecycle
系统 SHALL 支持 start / stop / restart / status。

### R-2 Health endpoint
系统 SHALL 暴露 /health、/ready、/metrics 端点。

### R-3 Worker pool
系统 SHALL 支持 task queue + worker pool 解耦。

### R-4 PID & log
系统 SHALL 写 PID file 和 log file 到 `~/.upup/daemon/`。

## Scenarios

### S-1 Auto-restart on crash
- **GIVEN** worker panic
- **WHEN** 进程退出
- **THEN** daemon SHALL 拉起新 worker 并上报 health=fail 事件
