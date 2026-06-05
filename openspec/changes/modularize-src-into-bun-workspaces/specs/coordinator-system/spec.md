# coordinator-system

## Purpose
提供多 agent 编排、planner、orchestrator。

## Requirements

### R-1 Multi-agent
系统 SHALL 支持 planner / executor / critic 三种角色 agent。

### R-2 Task delegation
系统 SHALL 支持把子任务委派给 subagent。

### R-3 Result aggregation
系统 SHALL 收集 subagent 结果并汇总。

### R-4 Backends
系统 SHALL 支持 local、docker、remote 三种 subagent backend。

## Scenarios

### S-1 Plan + execute
- **GIVEN** 用户 query "深度调研 NVDA"
- **WHEN** coordinator 启动
- **THEN** planner SHALL 拆 5 步，executor SHALL 串行执行，critic SHALL 评估
