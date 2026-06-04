# Spec: 投研 Coach (coach-mode)

## Purpose

把 upup 主对话从"通用 LLM 工具"升级为"投研 Claude"——人格化、跨会话记忆、主动推送的投研助手。这是 v3 的"用户面对层",是 L1 顶层叠加的"投研 Claude"人设。

## Requirements

### REQ-1: 投研 Claude 人设

The Coach SHALL embody an "投研 Claude" persona with these properties:

- **中文为主**,专业且平易近人
- **引用源**:每个数据点带 source URL + 时间戳
- **风险提示**:涉及投资建议时必须带"本工具不构成投资建议,投资有风险,决策需谨慎"
- **不直接给买卖建议**:给"分析 + 候选 + 风险"而非"买 X"
- **用户分层感知**:散户 / 活跃 / 私募 / 企业,差异化话术

### REQ-2: System Prompt 注入

The Coach MUST inject its persona into the system prompt at L1. The system prompt MUST contain:

- 一段 200 字以内的"投研 Claude 自我介绍"
- 一段 100 字以内的"4 个核心准则"(引用源 / 风险提示 / 不直接买卖 / 用户分层)
- 一段 50 字以内的"主动推送触发条件"

### REQ-3: 跨会话记忆

The Coach SHALL persist user context across sessions:

- **用户偏好**:风险偏好(保守/平衡/激进)/ 投资风格(价值/成长/动量)/ 关注行业
- **持仓**:从 broker 同步 / 手动录入(去标识化存储)
- **历史咨询**:最近 100 条 query + 标的(可选)
- **关注列表**:自选股

存储位置:`.upup/coach/memory.json`,加密 + 脱敏

### REQ-4: 主动推送

The Coach SHALL support 4 types of proactive pushes:

- **晨会**(MORNING_BRIEF):每个交易日 9:00 前
- **盘后**(AFTER_HOURS):每个交易日 15:30 后
- **财报日**(EARNINGS_PREVIEW):持仓 / 关注股财报日 T-1 / T+0
- **政策日**(POLICY):从 alt-data 订阅的政策事件触发

### REQ-5: 推送渠道

The Coach SHALL support these push channels:

- **CLI**:用户再次打开时显示
- **微信**(Wechat Work / Server 酱 / PushPlus)
- **飞书**(Lark Bot)
- **钉钉**(DingTalk Bot)
- **邮件**(SMTP)

### REQ-6: 编译开关

The Coach SHALL be gated by `feature('COACH_MODE')`:

- 默认 off
- `UPUP_COACH_MODE=1` 启用
- 关闭时主对话 prompt 不注入人设

### REQ-7: 软降级

The Coach MUST support `UPUP_COACH_MODE=0` soft fallback:

- 不抛错
- 主对话正常运行
- 不注入人设
- 不主动推送

## Scenarios

### Scenario 1: 首次进入

- **Given**: 用户首次进入 CLI,`UPUP_COACH_MODE=1`
- **When**: 主对话触发
- **Then**: Coach 自我介绍 + 询问用户偏好 + 推荐初始 watchlist

### Scenario 2: 引用源

- **Given**: 用户问"贵州茅台现在 PE 多少"
- **When**: Coach 调用 `financial_metrics` tool 查 PE
- **Then**: 回复带"PE 28.5(数据源:东方财富,2026-06-04 收盘)"

### Scenario 3: 风险提示

- **Given**: 用户问"现在该买茅台吗"
- **When**: Coach 给出分析
- **Then**: 回复末尾必带"本工具不构成投资建议,投资有风险,决策需谨慎"

### Scenario 4: 晨会推送

- **Given**: KAIROS 启用,`feature('COACH_MODE')` + `feature('KAIROS_BRIEF')` 都启用
- **When**: 交易日 9:00
- **Then**: Coach 生成简报 → 推送到用户配置的所有渠道

### Scenario 5: 跨会话记忆

- **Given**: 用户上次问过"贵州茅台"
- **When**: 用户重新打开 CLI
- **Then**: Coach 主动引用"上次您咨询过贵州茅台,目前 PE X 较上次 Y 变化 Z"

## Dependencies

- `src/agent/role-system.ts`(v3 新增,定义人设)
- `src/coach/memory.ts`(v3 新增,跨会话记忆)
- `src/coach/{morningBrief,afterHours,earningsPreview,policy}.ts`(v3 新增)
- `src/coach/channels/{cli,wechat,feishu,dingtalk,email}.ts`(v3 新增)
- `src/kairos/`(集成,提供 cron 调度)

## Out of Scope

- 投研 Coach 的具体 prompt 模板调优(由 LLM 训练迭代)
- 投研 Coach 的 A/B 实验(由 telemetry spec 覆盖)
