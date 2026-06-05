# cron-system

## Purpose
提供 croner 驱动的调度、任务状态机和 worker pool。

## Requirements

### R-1 Cron syntax
系统 SHALL 支持标准 cron 表达式和时区。

### R-2 Job state machine
系统 SHALL 提供 5 态状态机：pending → running → success/failed/cancelled。

### R-3 Worker pool
系统 SHALL 支持多 worker 并发执行 job。

### R-4 Retry & backoff
系统 SHALL 支持指数退避重试。

### R-5 Observability
系统 SHALL 暴露 cron metrics 给 telemetry。

## Scenarios

### S-1 Daily morning brief
- **GIVEN** 配置 cron "0 9 * * 1-5"
- **WHEN** 时间到达
- **THEN** 系统 SHALL 触发 morning-brief job
