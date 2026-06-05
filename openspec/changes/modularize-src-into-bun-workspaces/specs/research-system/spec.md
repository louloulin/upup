# research-system

## Purpose
提供 research workflow、dossier、报告生成。

## Requirements

### R-1 Research workflow
系统 SHALL 定义可复用的 research flow（collect → analyze → synthesize → report）。

### R-2 Dossier
系统 SHALL 维护结构化 dossier 对象（company、financials、events、risks、thesis）。

### R-3 Report generator
系统 SHALL 把 dossier 渲染成 markdown / html / pdf。

### R-4 Caching
系统 SHALL 对相同 ticker 的 dossier 做缓存。

## Scenarios

### S-1 Full report
- **GIVEN** 用户要 "AAPL 完整研报"
- **WHEN** research 跑完
- **THEN** dossier SHALL 含 4 部分 + 报告 SHALL 渲染为 markdown
