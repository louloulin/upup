## 1. 基础设施:Event Bus + Realtime Stream(地基)

- [ ] 1.1 实现 `core/event-bus.ts` 发布订阅总线,支持 topic 过滤、通配符、最近 1000 条回放
- [ ] 1.2 实现 `tools/market/realtime.ts` RealtimeFeed 抽象接口(subscribe / unsubscribe / on)
- [ ] 1.3 实现东方财富 WebSocket Adapter 作为首个 RealtimeFeed 实现
- [ ] 1.4 在 `core/index.ts` 暴露 event bus singleton,所有模块可 import
- [ ] 1.5 写 event-bus 和 realtime 单元测试(>80% 覆盖率)

## 2. Feature Gates 体系(GATE)

- [ ] 2.1 实现 `config/feature-gates.ts` 50+ 开关枚举 + 三级门控 API
- [ ] 2.2 编译时门控:`Bun.build` filter + `BUN_CONFIG_FEATURE_*` env 触发
- [ ] 2.3 启动时门控:`src/index.tsx` 顶部读取 `FEATURE_*` 注入全局
- [ ] 2.4 运行时门控:`featureGates.set('kairos', { userId, ratio: 0.1 })` 灰度
- [ ] 2.5 实现 `feature-gates doctor` CLI 命令,诊断当前开关状态
- [ ] 2.6 写 50+ 开关的 e2e 测试,验证每开关开/关行为差异

## 3. Broker Adapter + 沙盒(EXEC-001 / EXEC-002)

- [ ] 3.1 定义 `tools/trading/brokers/types.ts` BrokerAdapter 接口(placeOrder/cancelOrder/getPositions/getBalance)
- [ ] 3.2 实现 `tools/trading/sandbox.ts` 沙盒 Adapter(撮合模型:市价/限价/止损;滑点/手续费可配置)
- [ ] 3.3 实现 `tools/trading/sandbox.test.ts` 验证撮合、滑点、手续费、撤单、持仓同步
- [ ] 3.4 实现 `tools/trading/registry.ts` Adapter 注册中心(用户配置哪个 broker 启用哪个)
- [ ] 3.5 写 e2e:用 sandbox 跑 "回测→paper trading→report" 全链路

## 4. 算法交易(EXEC-003)

- [ ] 4.1 实现 `tools/trading/algos/twap.ts` 时间加权平均价格(按时间均匀拆单)
- [ ] 4.2 实现 `tools/trading/algos/vwap.ts` 成交量加权(按历史量分布)
- [ ] 4.3 实现 `tools/trading/algos/index.ts` 通用 algo runner(可扩展 POV / IS 等)
- [ ] 4.4 写 algo 在沙盒的 e2e 测试(对比"立即市价单"和"TWAP 30 分钟"滑点差异)

## 5. 组合归因(EXEC-004)

- [ ] 5.1 实现 `tools/portfolio/attribution.ts` Brinson 归因(配置、行业、交互效应)
- [ ] 5.2 实现 `tools/portfolio/attribution.ts` 风格归因(大盘/价值/成长/动量)
- [ ] 5.3 实现 `tools/portfolio/attribution.ts` 行业归因(申万一级 / GICS)
- [ ] 5.4 写 e2e:用 mock 组合验证归因加和等于收益

## 6. KAIROS 持续助手(3 个子系统)

- [ ] 6.1 重构 `agent/cron/` 和 `agent/heartbeat/` 为 `agent/kairos/` 命名空间(保留旧 YAML 兼容)
- [ ] 6.2 实现 `agent/kairos/scanner.ts` 盘前/盘中/盘后事件扫描(基于 cron + event bus)
- [ ] 6.3 实现 `agent/kairos/position-monitor.ts` 持仓监控(实时 PnL、止盈止损、风险预算)
- [ ] 6.4 实现 `agent/kairos/proactive.ts` 主动机会发现(技术形态、估值修复、舆情异动)
- [ ] 6.5 写 e2e:KAIROS 在 mock 时间触发 + 验证告警推送

## 7. Coordinator 多 Agent 编排(COORD)

- [ ] 7.1 实现 `agent/coordinator/coordinator-mode.ts` Coordinator 类(主从职责分离)
- [ ] 7.2 主 Claude 工具白名单(Agent/SendMessage/TaskStop),其他工具禁用
- [ ] 7.3 实现 Worker XML 结果注入协议
- [ ] 7.4 实现四阶段协议(Research / Synthesis / Implementation / Verification)
- [ ] 7.5 实现 `agent/coordinator/workers/technical.ts`、`fundamental.ts`、`capital.ts`、`sentiment.ts` 4 路并行 Worker
- [ ] 7.6 写 e2e:Coordinator 调度 4 路 Worker,主 Claude 综合出投资决策

## 8. Intent Detector 重写(LLM-driven)

- [ ] 8.1 重写 `agent/intent-detector.ts` 为 LLM-driven 多层分类
- [ ] 8.2 提供 `legacy` 模式保留旧硬编码关键词匹配
- [ ] 8.3 写投资领域 few-shot 例子(选股/分析/回测/交易/监控 5 大意图)
- [ ] 8.4 写 e2e:用真实 query 验证意图识别准确率 >85%

## 9. Bridge 远程控制(BRIDGE-001)

- [ ] 9.1 实现 `bridge/server.ts` 本地 WebSocket server(Bun 原生)
- [ ] 9.2 实现 token 鉴权 + 速率限制 + 审计日志
- [ ] 9.3 实现 `bridge/protocol.ts` 消息协议(消息/审批/输出/状态)
- [ ] 9.4 实现 `bridge/session-sync.ts` 跨设备会话同步
- [ ] 9.5 CLI 参数 `upup --bridge` 启动,默认关闭
- [ ] 9.6 写 e2e:启动 bridge,网页客户端连接、发送消息、批准权限

## 10. 另类数据集成(DATA-001)

- [ ] 10.1 实现 `data/alt/news.ts` 新闻源 Adapter(财联社、新华财经)
- [ ] 10.2 实现 `data/alt/reports.ts` 研报 Adapter(慧博、Choice)
- [ ] 10.3 实现 `data/alt/social.ts` 社交 Adapter(雪球、X)
- [ ] 10.4 实现 `data/alt/dragon-tiger.ts` 龙虎榜 + 北向资金
- [ ] 10.5 写 e2e:抓取过去 7 天数据,验证格式统一

## 11. 多模态输出(UX-001)

- [ ] 11.1 实现 `ui/multimodal/chart.ts` ASCII 蜡烛图(基于 OHLC)
- [ ] 11.2 实现 `ui/multimodal/chart.ts` ASCII 曲线图、热力图
- [ ] 11.3 实现 `ui/multimodal/report.ts` 研报模板(可导出 Markdown)
- [ ] 11.4 写 e2e:给定 mock 数据,验证图表输出

## 12. 监控/告警通道扩展

- [ ] 12.1 现有 `tools/notify/` 新增钉钉/飞书/Slack/邮件 Adapter(部分已有,补齐)
- [ ] 12.2 KAIROS 事件触发告警的路由配置
- [ ] 12.3 写 e2e:模拟 KAIROS 触发,验证告警到达(用 mock server)

## 13. 文档与示例

- [ ] 13.1 写 `docs/trading.md`:trading 沙盒/实盘使用文档
- [ ] 13.2 写 `docs/kairos.md`:KAIROS 配置和事件订阅文档
- [ ] 13.3 写 `docs/coordinator.md`:Coordinator 使用和 Worker 模板文档
- [ ] 13.4 写 `docs/feature-gates.md`:50+ 开关清单和推荐配置
- [ ] 13.5 写 `docs/bridge.md`:Bridge 部署和远程客户端文档
- [ ] 13.6 更新主 `README.md` 和 `README_CN.md`,反映新能力

## 14. 端到端验证(E2E)

- [ ] 14.1 实现完整 demo:用户输入"分析 600519,模拟买入 100 股",Agent 调 technical/fundamental/capital/sentiment 4 个 Worker,综合决策,沙盒成交,生成报告
- [ ] 14.2 KAIROS demo:KAIROS 在盘中扫描到异动,推送告警到 Slack
- [ ] 14.3 Bridge demo:本地 CLI 启动 bridge,网页客户端远程控制
- [ ] 14.4 所有 demo 在 CI 中跑通,作为长期回归基线

## 15. 文档交付(本次 change 范围)

- [ ] 15.1 写好 13 个新 specs + 3 个 modified specs(在 `openspec/changes/<name>/specs/`)
- [ ] 15.2 proposal.md / design.md / tasks.md 三件套内容完整
- [ ] 15.3 用户确认 proposal/design/tasks 内容
- [ ] 15.4 Phase guard 通过,转换到 `design` 阶段(下一步进入实现期)
