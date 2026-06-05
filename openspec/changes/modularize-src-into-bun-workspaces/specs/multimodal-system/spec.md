# multimodal-system

## Purpose
提供多模态输入/输出（image/audio/structured）。

## Requirements

### R-1 Input
系统 SHALL 支持 image、pdf、audio、video 入站。

### R-2 Output
系统 SHALL 支持文本、结构化 JSON、image、chart 出站。

### R-3 Provider abstraction
系统 SHALL 用 provider 抽象（vision、tts、image-gen）隔离具体实现。

### R-4 Caching
系统 SHALL 对多模态 embedding 做缓存。

## Scenarios

### S-1 Screenshot analysis
- **GIVEN** 用户贴一张财报截图
- **WHEN** LLM 调用 vision 工具
- **THEN** 系统 SHALL 返回结构化财务摘要
