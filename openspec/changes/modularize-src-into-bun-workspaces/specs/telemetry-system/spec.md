# telemetry-system

## Purpose
提供指标、trace、events、anonymized 遥测。

## Requirements

### R-1 Metrics
系统 SHALL 暴露 counter、gauge、histogram 三类指标。

### R-2 Tracing
系统 SHALL 接入 LangSmith / OpenTelemetry。

### R-3 Events
系统 SHALL 把所有 agent 事件以结构化日志形式持久化。

### R-4 Anonymization
系统 SHALL 在默认模式下脱敏 PII（API key、邮箱、电话）。

### R-5 Opt-out
系统 SHALL 支持 `UPUP_TELEMETRY=off` 关闭。

## Scenarios

### S-1 LangSmith trace
- **GIVEN** `LANGSMITH_API_KEY` 已设置
- **WHEN** agent 跑完一轮
- **THEN** trace SHALL 出现在 LangSmith project
