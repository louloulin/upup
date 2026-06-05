# skill-system

## Purpose
提供 SKILL.md 的发现、加载、调度和执行。每个 skill SHALL 是一段结构化指令，可被 LLM 主动调用。

## Requirements

### R-1 SKILL.md format
系统 SHALL 解析 SKILL.md 的 YAML frontmatter（name、description）和 markdown body。

### R-2 Discovery
系统 SHALL 在启动时扫描 `skills/` 和 `packages/*/skills/` 目录，缓存所有 SKILL.md。

### R-3 Tool exposure
系统 SHALL 把 skill 暴露为 LLM 可调用的工具；每个 query 内 skill SHALL 最多执行一次。

### R-4 Built-in skills
系统 SHALL 内置至少一个 skill（DCF valuation）。

### R-5 Skill state
系统 SHALL 跟踪 skill 执行状态（pending/running/success/fail），供 UI 和 telemetry 观察。

## Scenarios

### S-1 DCF invocation
- **GIVEN** 用户问 "AAPL 估值"
- **WHEN** LLM 选择 dcf skill
- **THEN** skill SHALL 跑完 valuation flow 并返回 intrinsic value
